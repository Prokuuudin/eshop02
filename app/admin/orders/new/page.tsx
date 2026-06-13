'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOrders, type DeliveryMethod } from '@/lib/orders-store'
import { readUsers } from '@/lib/auth'
import { formatEuro } from '@/lib/utils'
import { logAdminAction } from '@/lib/admin-log-store'
import { useAdminStore } from '@/lib/admin-store'

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogProduct = {
  id: string
  title: string
  brand: string
  category: string
  price: number
  stock: number
  sku?: string
  image?: string
}

type LineItem = {
  product: CatalogProduct
  quantity: number
  unitPrice: number  // may be overridden
}

type PromoResult = {
  code: string
  discountPct: number
  minOrder: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; cost: number }[] = [
  { value: 'pickup',  label: 'Самовывоз',  cost: 0 },
  { value: 'courier', label: 'Курьер',     cost: 5 },
  { value: 'post',    label: 'Почта',      cost: 3 },
]

const PAYMENT_METHODS = ['Счёт (invoice)', 'Наличные', 'Карта (терминал)', 'Перевод', 'Stripe']

const LOC = 'ru-RU'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ORD-${ts}-${rnd}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewOrderPage() {
  const router = useRouter()
  const { addOrder } = useOrders()
  const { setOrderStatus } = useAdminStore()

  // ── Catalog
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── Customer
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [emailSuggestions, setEmailSuggestions] = useState<ReturnType<typeof readUsers>>([])
  const [showEmailList, setShowEmailList] = useState(false)

  // ── Items
  const [items, setItems] = useState<LineItem[]>([])

  // ── Pricing
  const [promoInput, setPromoInput] = useState('')
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoCodes, setPromoCodes] = useState<PromoResult[]>([])
  const [manualDiscountPct, setManualDiscountPct] = useState('')

  // ── Delivery
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')

  // ── Payment
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid')

  // ── Notes
  const [notes, setNotes] = useState('')

  // ── Submit
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // ── Load catalog + promo codes ────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((d: { data?: { products?: CatalogProduct[] } }) => setCatalog(d.data?.products ?? []))
      .catch(() => {})

    fetch('/api/admin/promo-codes')
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) {
          setPromoCodes(d.map((p: Record<string, unknown>) => ({
            code: String(p.code ?? ''),
            discountPct: Number(p.discount ?? 0),
            minOrder: Number(p.minOrder ?? 0),
          })))
        }
      })
      .catch(() => {})
  }, [])

  // ── Customer lookup ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!email.trim()) { setEmailSuggestions([]); return }
    try {
      const users = readUsers()
      setEmailSuggestions(
        users.filter((u) => u.email.toLowerCase().includes(email.toLowerCase())).slice(0, 5)
      )
    } catch { setEmailSuggestions([]) }
  }, [email])

  const fillCustomer = (user: ReturnType<typeof readUsers>[number]) => {
    setEmail(user.email)
    const parts = (user.name ?? '').split(' ')
    setFirstName(parts[0] ?? '')
    setLastName(parts.slice(1).join(' '))
    setPhone(user.phone ?? '')
    setShowEmailList(false)
  }

  // ── Product search ────────────────────────────────────────────────────────

  const productResults = useMemo(() => {
    const q = productSearch.toLowerCase().trim()
    if (!q || q.length < 1) return []
    return catalog
      .filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [catalog, productSearch])

  const addProduct = (p: CatalogProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === p.id)
      if (existing) {
        return prev.map((i) => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { product: p, quantity: 1, unitPrice: p.price }]
    })
    setProductSearch('')
    setShowDropdown(false)
  }

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.product.id !== id))

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) { removeItem(id); return }
    setItems((prev) => prev.map((i) => i.product.id === id ? { ...i, quantity: qty } : i))
  }

  const updateUnitPrice = (id: string, price: number) => {
    if (!Number.isFinite(price) || price < 0) return
    setItems((prev) => prev.map((i) => i.product.id === id ? { ...i, unitPrice: price } : i))
  }

  // ── Promo code ────────────────────────────────────────────────────────────

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    const found = promoCodes.find((p) => p.code.toUpperCase() === code)
    if (!found) { setPromoError('Промокод не найден'); setPromoResult(null); return }
    if (subtotal < found.minOrder) {
      setPromoError(`Мин. сумма заказа: ${formatEuro(found.minOrder, LOC)}`)
      setPromoResult(null)
      return
    }
    setPromoResult(found)
    setPromoError('')
  }

  const removePromo = () => { setPromoResult(null); setPromoInput(''); setPromoError('') }

  // ── Calculations ──────────────────────────────────────────────────────────

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  const discountFromPromo = promoResult
    ? Math.round((subtotal * promoResult.discountPct) / 100 * 100) / 100
    : 0

  const discountFromManual = (() => {
    const pct = parseFloat(manualDiscountPct)
    if (!Number.isFinite(pct) || pct <= 0) return 0
    return Math.round((subtotal * Math.min(pct, 100)) / 100 * 100) / 100
  })()

  const discount = Math.max(discountFromPromo, discountFromManual)

  const deliveryCost = DELIVERY_OPTIONS.find((d) => d.value === deliveryMethod)?.cost ?? 0

  const total = Math.max(0, subtotal - discount + deliveryCost)

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): string[] => {
    const errs: string[] = []
    if (!email.trim()) errs.push('Email покупателя обязателен')
    if (!firstName.trim()) errs.push('Имя покупателя обязательно')
    if (items.length === 0) errs.push('Добавьте хотя бы один товар')
    if (deliveryMethod !== 'pickup' && !address.trim()) errs.push('Укажите адрес доставки')
    if (deliveryMethod !== 'pickup' && !city.trim()) errs.push('Укажите город')
    return errs
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setErrors([])
    setSubmitting(true)

    const orderId = genOrderId()
    const now = new Date()

    const order = {
      id: orderId,
      createdAt: now,
      // CartItem = Product & { quantity } — API products carry all fields; cast is safe
      items: items.map((i) => ({ ...i.product, quantity: i.quantity, price: i.unitPrice })) as never,
      subtotal,
      tax: 0,
      delivery: deliveryCost,
      deliveryMethod,
      paymentMethod,
      promoCode: promoResult?.code,
      discount,
      total,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: address.trim() || 'Самовывоз',
      city: city.trim() || '—',
      postalCode: postalCode.trim() || undefined,
      paymentStatus,
      paymentProvider: 'manual' as const,
    }

    addOrder(order)
    setOrderStatus(orderId, 'confirmed')  // manual orders start as confirmed

    logAdminAction('product.created', { type: 'order', id: orderId, title: `${firstName} ${lastName}` }, {
      after: { total, items: items.length, paymentMethod },
      details: `Ручное создание заказа на ${formatEuro(total, LOC)}${notes ? ` · ${notes.slice(0, 60)}` : ''}`,
    })

    // Save notes if any
    if (notes.trim()) {
      // Stored via admin-log details — also save to order notes in admin store
      useAdminStore.getState().setOrderNote(orderId, notes.trim())
    }

    setSubmitting(false)
    router.push('/admin/orders')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const inputCls = 'w-full rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400'
  const selectCls = inputCls

  return (
    <AdminGate>
      <main className="w-full py-4">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Создать заказ вручную</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Заказ создаётся со статусом «Подтверждён» и оплатой «{paymentStatus === 'paid' ? 'Оплачен' : 'Не оплачен'}»
            </p>
          </div>
          <Link href="/admin/orders"><Button variant="outline">← Заказы</Button></Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Left: form ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Customer */}
            <Section title="Покупатель">
              <div className="relative" ref={searchRef}>
                <Field label="Email" required>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setShowEmailList(true) }}
                    onFocus={() => setShowEmailList(true)}
                    placeholder="customer@example.com"
                  />
                </Field>
                {showEmailList && emailSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-lg">
                    {emailSuggestions.map((u) => (
                      <button
                        key={u.email}
                        type="button"
                        onClick={() => fillCustomer(u)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.email}</p>
                          {u.name && <p className="text-xs text-gray-400">{u.name}{u.phone ? ` · ${u.phone}` : ''}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Имя" required>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван" />
                </Field>
                <Field label="Фамилия">
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Петров" />
                </Field>
              </div>
              <Field label="Телефон">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+371 2X XXX XXX" />
              </Field>
            </Section>

            {/* Products */}
            <Section title="Товары">
              {/* Search */}
              <div className="relative">
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Поиск по названию, SKU, бренду..."
                />
                {showDropdown && productResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl max-h-72 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        {p.image && (
                          <img src={p.image} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                          <p className="text-xs text-gray-400">{p.brand}{p.sku ? ` · ${p.sku}` : ''}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-foreground">{formatEuro(p.price, LOC)}</p>
                          <p className={`text-xs ${p.stock === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {p.stock === 0 ? 'нет' : `${p.stock} шт`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Added items */}
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  Начните вводить название товара чтобы добавить его в заказ
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex items-center gap-3 rounded-lg border border-border bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                      {item.product.image && (
                        <img src={item.product.image} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.product.title}</p>
                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                      </div>
                      {/* Unit price override */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-gray-400">€</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unitPrice}
                          onChange={(e) => updateUnitPrice(item.product.id, parseFloat(e.target.value))}
                          className="w-20 rounded border border-border bg-card px-2 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          title="Цена за единицу (можно изменить)"
                        />
                      </div>
                      {/* Qty */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(item.product.id, item.quantity - 1)}
                          className="h-7 w-7 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-lg leading-none"
                        >−</button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.product.id, item.quantity + 1)}
                          className="h-7 w-7 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-lg leading-none"
                        >+</button>
                      </div>
                      {/* Line total */}
                      <span className="w-20 text-right text-sm font-semibold text-foreground shrink-0 tabular-nums">
                        {formatEuro(item.unitPrice * item.quantity, LOC)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Discounts */}
            <Section title="Скидки">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Promo code */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Промокод</p>
                  {promoResult ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm">
                        <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">{promoResult.code}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 ml-2">−{promoResult.discountPct}%</span>
                      </div>
                      <button type="button" onClick={removePromo} className="text-gray-400 hover:text-red-500 text-xl leading-none">×</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                        placeholder="WELCOME10"
                        className="font-mono"
                      />
                      <Button size="sm" variant="outline" onClick={applyPromo}>Применить</Button>
                    </div>
                  )}
                  {promoError && <p className="text-xs text-red-600 dark:text-red-400">{promoError}</p>}

                  {/* Quick promo list */}
                  {promoCodes.length > 0 && !promoResult && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {promoCodes.filter((p) => p.discountPct > 0).slice(0, 5).map((p) => (
                        <button
                          key={p.code}
                          type="button"
                          onClick={() => { setPromoInput(p.code); setPromoResult(null) }}
                          className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:border-indigo-300 hover:text-primary dark:hover:text-indigo-400 transition-colors"
                        >
                          {p.code} −{p.discountPct}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual discount */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Ручная скидка, %
                    {promoResult && <span className="text-gray-400 ml-1">(применяется большее из двух)</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={manualDiscountPct}
                      onChange={(e) => setManualDiscountPct(e.target.value)}
                      placeholder="0"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  {discountFromManual > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      −{formatEuro(discountFromManual, LOC)}
                    </p>
                  )}
                </div>
              </div>
            </Section>

            {/* Delivery */}
            <Section title="Доставка">
              <div className="flex flex-wrap gap-2">
                {DELIVERY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeliveryMethod(opt.value)}
                    className={[
                      'rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                      deliveryMethod === opt.value
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-primary dark:bg-indigo-900/20 dark:text-primary'
                        : 'border-border text-muted-foreground hover:border-gray-300',
                    ].join(' ')}
                  >
                    {opt.label}
                    <span className="ml-1.5 text-xs opacity-70">
                      {opt.cost === 0 ? 'бесплатно' : `€${opt.cost}`}
                    </span>
                  </button>
                ))}
              </div>

              {deliveryMethod !== 'pickup' && (
                <div className="space-y-3 pt-1">
                  <Field label="Адрес" required>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ул. Пушкина, д. 10, кв. 5" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Город" required>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Рига" />
                    </Field>
                    <Field label="Индекс">
                      <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="LV-1001" />
                    </Field>
                  </div>
                </div>
              )}
            </Section>

            {/* Payment */}
            <Section title="Оплата">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Способ оплаты">
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={selectCls}
                  >
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Статус оплаты">
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as 'unpaid' | 'paid')}
                    className={selectCls}
                  >
                    <option value="unpaid">Не оплачен</option>
                    <option value="paid">Оплачен</option>
                  </select>
                </Field>
              </div>
            </Section>

            {/* Notes */}
            <Section title="Заметка менеджера">
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Внутренний комментарий (клиент не видит)..."
                className="w-full rounded-lg border border-border bg-white dark:bg-gray-950 px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </Section>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 px-4 py-3 space-y-1">
                {errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-700 dark:text-red-300">· {e}</p>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: order summary (sticky) ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Сводка заказа</h2>

              {/* Customer */}
              {(firstName || email) && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm">
                  <p className="font-medium text-foreground">
                    {[firstName, lastName].filter(Boolean).join(' ') || '—'}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">{email}</p>
                </div>
              )}

              {/* Items */}
              {items.length > 0 && (
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm gap-2">
                      <span className="truncate text-gray-700 dark:text-gray-300 flex-1">
                        {item.product.title} ×{item.quantity}
                      </span>
                      <span className="shrink-0 text-foreground tabular-nums">
                        {formatEuro(item.unitPrice * item.quantity, LOC)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {items.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Товары</span>
                    <span className="tabular-nums">{formatEuro(subtotal, LOC)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>
                        Скидка
                        {promoResult && discountFromPromo >= discountFromManual
                          ? ` (${promoResult.code})`
                          : manualDiscountPct ? ` (${manualDiscountPct}%)` : ''}
                      </span>
                      <span className="tabular-nums">−{formatEuro(discount, LOC)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Доставка ({DELIVERY_OPTIONS.find((d) => d.value === deliveryMethod)?.label})</span>
                    <span className="tabular-nums">
                      {deliveryCost === 0 ? 'бесплатно' : formatEuro(deliveryCost, LOC)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-lg text-foreground pt-1 border-t border-border">
                    <span>Итого</span>
                    <span className="tabular-nums">{formatEuro(total, LOC)}</span>
                  </div>
                </div>
              )}

              {/* Payment summary */}
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Оплата: {paymentMethod}</p>
                <p>Статус: {paymentStatus === 'paid' ? '✓ Оплачен' : '⚠ Не оплачен'}</p>
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white"
                disabled={submitting || items.length === 0}
                onClick={handleSubmit}
              >
                {submitting ? 'Создание...' : `Создать заказ${total > 0 ? ` · ${formatEuro(total, LOC)}` : ''}`}
              </Button>

              {items.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Добавьте товары чтобы создать заказ
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </AdminGate>
  )
}
