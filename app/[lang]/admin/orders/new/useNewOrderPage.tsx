'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

export function useNewOrderPage() {
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

  const emailSuggestions = useMemo(() => {
    if (!email.trim()) return []
    try {
      const users = readUsers()
      return users.filter((u) => u.email.toLowerCase().includes(email.toLowerCase())).slice(0, 5)
    } catch {
      return []
    }
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

  const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
  const selectCls = inputCls

    return { router, addOrder, setOrderStatus, catalog, setCatalog, productSearch, setProductSearch, showDropdown, setShowDropdown, searchRef, email, setEmail, firstName, setFirstName, lastName, setLastName, phone, setPhone, showEmailList, setShowEmailList, items, setItems, promoInput, setPromoInput, promoResult, setPromoResult, promoError, setPromoError, promoCodes, setPromoCodes, manualDiscountPct, setManualDiscountPct, deliveryMethod, setDeliveryMethod, address, setAddress, city, setCity, postalCode, setPostalCode, paymentMethod, setPaymentMethod, paymentStatus, setPaymentStatus, notes, setNotes, submitting, setSubmitting, errors, setErrors, emailSuggestions, fillCustomer, productResults, addProduct, removeItem, updateQty, updateUnitPrice, applyPromo, removePromo, subtotal, discountFromPromo, discountFromManual, discount, deliveryCost, total, validate, handleSubmit, inputCls, selectCls }
}
