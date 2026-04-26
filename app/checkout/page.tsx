'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert'
import { useCart } from '@/lib/cart-store'
import { useOrders, DeliveryMethod } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { validatePromoCode, calculateDiscount } from '@/lib/promo-codes'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useToast } from '@/lib/toast-context'
import { canPlaceOrders, getCurrentUser } from '@/lib/auth'
import { calculatePrice, getWholesaleOrderGuard } from '@/lib/customer-segmentation'
import { useInvoicesStore } from '@/lib/invoices-store'
import { logAuditAction } from '@/lib/audit-log-store'
import { useCompanyStore } from '@/lib/company-store'

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const generateOrderId = (): string => {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string; price: number }> = [
  { id: 'courier', labelKey: 'checkout.delivery.courier', price: 500 },
  { id: 'pickup', labelKey: 'checkout.delivery.pickup', price: 0 },
  { id: 'post', labelKey: 'checkout.delivery.post', price: 300 }
]

export default function CheckoutPage() {
  const { t, language } = useTranslation()
  const { showToast } = useToast()
  const searchParams = useSearchParams()
  const { items, replaceWithItems } = useCart()
  const { addOrder, updateOrderPayment } = useOrders()
  const { bonusProgram } = useAdminStore()
  const currentUser = getCurrentUser()
  const isCheckoutAllowedForRole = canPlaceOrders(currentUser)
  const { getCompany } = useCompanyStore()
  const currentUserEmail = currentUser?.email.trim().toLowerCase() ?? ''
  const locale = getLocaleFromLanguage(language)
  const formatCurrency = (value: number): string => formatEuro(value, locale)
  const company = currentUser?.companyId ? getCompany(currentUser.companyId) : undefined
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    paymentMethod: 'card'
  })
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('courier')
  const [promoCode, setPromoCode] = useState('')
  const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined)
  const [promoError, setPromoError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const selectedItemIds = React.useMemo(() => {
    const raw = searchParams.get('items')
    if (!raw) return null

    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  }, [searchParams])

  const checkoutItems = React.useMemo(() => {
    if (!selectedItemIds) return items

    const selectedSet = new Set(selectedItemIds)
    return items.filter((item) => selectedSet.has(item.id))
  }, [items, selectedItemIds])

  const subtotal = React.useMemo(
    () => checkoutItems.reduce((sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity, 0),
    [checkoutItems]
  )

  React.useEffect(() => {
    const firstName = searchParams.get('firstName')
    const lastName = searchParams.get('lastName')
    const email = searchParams.get('email')
    const phone = searchParams.get('phone')
    const address = searchParams.get('address')
    const city = searchParams.get('city')
    const postalCode = searchParams.get('postalCode')

    if (!firstName && !lastName && !email && !phone && !address && !city && !postalCode) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      firstName: firstName ?? prev.firstName,
      lastName: lastName ?? prev.lastName,
      email: email ?? prev.email,
      phone: phone ?? prev.phone,
      address: address ?? prev.address,
      city: city ?? prev.city,
      postalCode: postalCode ?? prev.postalCode
    }))
  }, [searchParams])

  if (items.length === 0) {
    return (
      <main className="w-full px-4 py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('checkout.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{t('checkout.empty')}</p>
        <Link href="/catalog">
          <Button>{t('checkout.backToCatalog')}</Button>
        </Link>
      </main>
    )
  }

  if (selectedItemIds && checkoutItems.length === 0) {
    return (
      <main className="w-full px-4 py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('checkout.title')}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{t('checkout.noSelected')}</p>
        <Link href="/cart">
          <Button>{t('checkout.backToCart')}</Button>
        </Link>
      </main>
    )
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
    if (errors[e.target.name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[e.target.name]
        return newErrors
      })
    }
  }

  const handleApplyPromo = (): void => {
    setPromoError('')
    if (!promoCode.trim()) {
      const message = t('checkout.promo.enter')
      setPromoError(message)
      showToast(message, 'error')
      return
    }

    const promo = validatePromoCode(promoCode, subtotal)
    if (!promo) {
      const message = t('checkout.promo.invalid')
      setPromoError(message)
      showToast(message, 'error')
      return
    }

    setAppliedPromo(promoCode)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsSubmitting(true)

    if (!isCheckoutAllowedForRole) {
      showToast('Для роли менеджера оформление заказа недоступно', 'error')
      setIsSubmitting(false)
      return
    }

    const newErrors: Record<string, string> = {}

    if (!formData.firstName.trim()) newErrors.firstName = t('checkout.errors.firstName')
    if (!formData.lastName.trim()) newErrors.lastName = t('checkout.errors.lastName')
    if (!formData.email.trim()) {
      newErrors.email = t('checkout.errors.email')
    } else if (!validateEmail(formData.email)) {
      newErrors.email = t('checkout.errors.emailInvalid')
    }
    if (!formData.phone.trim()) newErrors.phone = t('checkout.errors.phone')
    if (!formData.address.trim()) newErrors.address = t('checkout.errors.address')
    if (!formData.city.trim()) newErrors.city = t('checkout.errors.city')

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setIsSubmitting(false)
      return
    }

    const wholesaleGuard = getWholesaleOrderGuard(subtotal)
    if (!wholesaleGuard.isMinimumReached) {
      const message = `${t('checkout.minimumOrder')} ${t('checkout.wholesale.requiredAmount')}: ${formatCurrency(wholesaleGuard.minOrderAmount)}`
      showToast(message, 'error')
      setIsSubmitting(false)
      return
    }

    // Calculate totals
    const deliveryOption = DELIVERY_OPTIONS.find((d) => d.id === deliveryMethod)
    const deliveryFee = deliveryOption?.price || 500
    const discountPromo = appliedPromo ? validatePromoCode(appliedPromo, subtotal) : null
    const discount = discountPromo ? calculateDiscount(subtotal, discountPromo.discount) : 0
    const subtotalAfterDiscount = subtotal - discount
    const normalizedCheckoutEmail = formData.email.trim().toLowerCase()

    const taxAmount = Math.round(subtotalAfterDiscount * 0.18)
    const grandTotal = subtotalAfterDiscount + taxAmount + deliveryFee

    // Create order
    const orderId = generateOrderId()
    const order = {
      id: orderId,
      createdAt: new Date(),
      items: checkoutItems.map((item) => ({
        ...item,
        price: calculatePrice(item, item.quantity)
      })),
      subtotal,
      tax: taxAmount,
      delivery: deliveryFee,
      deliveryMethod,
      promoCode: appliedPromo,
      discount,
      total: grandTotal,
      paymentStatus: formData.paymentMethod === 'card' ? 'pending' : 'unpaid',
      paymentProvider: formData.paymentMethod === 'card' ? 'stripe' : 'manual',
      ...formData
    }

    addOrder(order)

    // Keep a server-side copy of the order so payment webhooks can update canonical status.
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            ...order,
            createdAt: order.createdAt.toISOString()
          }
        })
      })
    } catch {
      // Checkout should still proceed even if server order persistence is temporarily unavailable.
    }

    let stripeCheckoutUrl: string | undefined

    if (formData.paymentMethod === 'card') {
      try {
        const response = await fetch('/api/payments/stripe/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orderId,
            email: formData.email,
            grandTotal,
            items: checkoutItems.map((item) => ({
              id: item.id,
              title: t(`products.${item.id}.title`, item.title),
              quantity: item.quantity,
              price: calculatePrice(item, item.quantity)
            }))
          })
        })

        if (!response.ok) {
          updateOrderPayment(orderId, {
            paymentStatus: 'failed',
            paymentProvider: 'stripe'
          })
          showToast('Не удалось инициализировать онлайн-оплату. Попробуйте снова.', 'error')
          setIsSubmitting(false)
          return
        }

        const payload = (await response.json()) as { url?: string; sessionId?: string }
        if (!payload.url) {
          updateOrderPayment(orderId, {
            paymentStatus: 'failed',
            paymentProvider: 'stripe'
          })
          showToast('Платежная сессия не была создана. Попробуйте снова.', 'error')
          setIsSubmitting(false)
          return
        }

        updateOrderPayment(orderId, {
          paymentStatus: 'pending',
          paymentProvider: 'stripe',
          paymentSessionId: payload.sessionId
        })
        stripeCheckoutUrl = payload.url
      } catch {
        updateOrderPayment(orderId, {
          paymentStatus: 'failed',
          paymentProvider: 'stripe'
        })
        showToast('Ошибка при запуске оплаты. Попробуйте снова.', 'error')
        setIsSubmitting(false)
        return
      }
    }

    // B2B: Generate invoice if customer has payment terms
    const paymentTermDays = company?.paymentTermDays ?? 0
    if (paymentTermDays > 0 && currentUser?.companyId) {
      const createInvoice = useInvoicesStore.getState().createInvoice
      const issuedDate = new Date()
      const dueDate = new Date(issuedDate)
      dueDate.setDate(dueDate.getDate() + paymentTermDays)
      
      const invoiceId = createInvoice({
        companyId: currentUser.companyId,
        orderId,
        subtotal,
        taxRate: 18,
        taxAmount,
        total: grandTotal,
        status: 'issued',
        issuedDate,
        dueDate,
        paidDate: undefined,
        notes: `Заказ #${orderId} от ${issuedDate.toLocaleDateString('ru-RU')}`
      })
      
      // Log invoice creation
      logAuditAction(
        currentUser.companyId,
        currentUser.id,
        'invoice_issued',
        {
          invoiceId,
          orderId,
          amount: grandTotal,
          dueDate: dueDate.toISOString()
        },
        { userName: currentUser.name, userEmail: currentUser.email }
      )
    }

    const selectedSet = new Set(checkoutItems.map((item) => item.id))
    const remainingItems = items.filter((item) => !selectedSet.has(item.id))
    replaceWithItems(remainingItems)
    setSubmitted(true)

    // Redirect to confirmation page
    setTimeout(() => {
      if (formData.paymentMethod === 'card' && stripeCheckoutUrl) {
        window.location.href = stripeCheckoutUrl
        return
      }

      setIsSubmitting(false)
      window.location.href = `/order/${orderId}`
    }, 500)
  }

  if (submitted) {
    return (
      <main className="w-full px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <div className="text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">{t('checkout.success.title')}</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{t('checkout.success.redirect')}</p>
        </div>
      </main>
    )
  }

  if (!isCheckoutAllowedForRole) {
    return (
      <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-900/30">
          <h1 className="text-2xl font-bold mb-2">Оформление недоступно для текущей роли</h1>
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
            Пользователь с ролью менеджера может работать с заказами и RFQ, но не оформляет покупки.
            Для покупки используйте аккаунт с ролью buyer/admin или отдельный клиентский профиль.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link href="/cart">
              <Button variant="outline">Вернуться в корзину</Button>
            </Link>
            <Link href="/account">
              <Button>Перейти в аккаунт</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const deliveryOption = DELIVERY_OPTIONS.find((d) => d.id === deliveryMethod)
  const deliveryFee = deliveryOption?.price || 500
  const discountPromo = appliedPromo ? validatePromoCode(appliedPromo, subtotal) : null
  const discount = discountPromo ? calculateDiscount(subtotal, discountPromo.discount) : 0
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.round(subtotalAfterDiscount * 0.18)
  const grandTotal = subtotalAfterDiscount + taxAmount + deliveryFee
  const wholesaleGuard = getWholesaleOrderGuard(subtotal)

  return (
    <main className="w-full px-4 py-8 text-gray-900 dark:text-gray-100">
      <h1 className="checkout__title text-3xl font-bold mb-8">{t('checkout.title')}</h1>

      <div className="checkout__layout grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Форма */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
          <div className="checkout__section bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="checkout__section-title font-bold text-lg mb-4">{t('checkout.delivery.title')}</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                  {t('checkout.firstName')} <span className="text-red-600">*</span>
                </label>
                <Input
                  type="text"
                  name="firstName"
                  placeholder={t('checkout.firstName')}
                  value={formData.firstName}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.firstName ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                  aria-required="true"
                  aria-invalid={!!errors.firstName}
                />
                {errors.firstName && <p className="text-red-600 text-xs mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                  {t('checkout.lastName')} <span className="text-red-600">*</span>
                </label>
                <Input
                  type="text"
                  name="lastName"
                  placeholder={t('checkout.lastName')}
                  value={formData.lastName}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.lastName ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                  aria-required="true"
                  aria-invalid={!!errors.lastName}
                />
                {errors.lastName && <p className="text-red-600 text-xs mt-1">{errors.lastName}</p>}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                {t('checkout.email')} <span className="text-red-600">*</span>
              </label>
              <Input
                type="email"
                name="email"
                placeholder={t('checkout.email')}
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.email ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                aria-required="true"
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                {t('checkout.phone')} <span className="text-red-600">*</span>
              </label>
              <Input
                type="tel"
                name="phone"
                placeholder={t('checkout.phone')}
                value={formData.phone}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.phone ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                aria-required="true"
                aria-invalid={!!errors.phone}
              />
              {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                {t('checkout.address')} <span className="text-red-600">*</span>
              </label>
              <Input
                type="text"
                name="address"
                placeholder={t('checkout.address')}
                value={formData.address}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.address ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                aria-required="true"
                aria-invalid={!!errors.address}
              />
              {errors.address && <p className="text-red-600 text-xs mt-1">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
                  {t('checkout.city')} <span className="text-red-600">*</span>
                </label>
                <Input
                  type="text"
                  name="city"
                  placeholder={t('checkout.city')}
                  value={formData.city}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700 ${errors.city ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`}
                  aria-required="true"
                  aria-invalid={!!errors.city}
                />
                {errors.city && <p className="text-red-600 text-xs mt-1">{errors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">{t('checkout.postalCode')}</label>
                <Input
                  type="text"
                  name="postalCode"
                  placeholder={t('checkout.postalCode')}
                  value={formData.postalCode}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                />
              </div>
            </div>
          </div>

          {/* Delivery options */}
          <div className="checkout__section bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="checkout__section-title font-bold text-lg mb-4">{t('checkout.delivery.method')}</h2>
            <RadioGroup value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)} className="space-y-3">
              {DELIVERY_OPTIONS.map((option) => (
                <label key={option.id} className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700" htmlFor={`delivery-${option.id}`}>
                  <RadioGroupItem
                    id={`delivery-${option.id}`}
                    value={option.id}
                    className="mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{t(option.labelKey)}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-300">{option.price === 0 ? t('checkout.delivery.free') : formatCurrency(option.price)}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="checkout__section bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="checkout__section-title font-bold text-lg mb-4">{t('checkout.payment.title')}</h2>
            <RadioGroup
              value={formData.paymentMethod}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, paymentMethod: value }))
              }}
              className="space-y-3"
            >
              <label className="flex items-center text-gray-900 dark:text-gray-100" htmlFor="payment-card">
                <RadioGroupItem id="payment-card" value="card" className="mr-3" />
                <span>{t('checkout.payment.card')}</span>
              </label>
              <label className="flex items-center text-gray-900 dark:text-gray-100" htmlFor="payment-bank">
                <RadioGroupItem id="payment-bank" value="bank" className="mr-3" />
                <span>{t('checkout.payment.bank')}</span>
              </label>
              <label className="flex items-center text-gray-900 dark:text-gray-100" htmlFor="payment-cash">
                <RadioGroupItem id="payment-cash" value="cash" className="mr-3" />
                <span>{t('checkout.payment.cash')}</span>
              </label>
            </RadioGroup>
          </div>

          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={!wholesaleGuard.isMinimumReached || isSubmitting}>
              {t('checkout.submit')}
            </Button>
            <Link href="/cart">
              <Button type="button" variant="outline">
                {t('checkout.backToCart')}
              </Button>
            </Link>
          </div>
        </form>

        {/* Сумма и промокод */}
        <aside className="checkout__summary sticky top-20 h-fit">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">{t('checkout.summary.title')}</h2>

            <div className="space-y-2 border-b border-gray-200 dark:border-gray-700 pb-4 max-h-48 overflow-y-auto mb-4">
              {checkoutItems.map((item) => {
                const localizedTitle = t(`products.${item.id}.title`, item.title)
                const unitPrice = calculatePrice(item, item.quantity)
                return (
                  <div key={item.id} className="text-sm flex justify-between">
                    <span>
                      {localizedTitle} × {item.quantity}
                    </span>
                    <span>{formatCurrency(unitPrice * item.quantity)}</span>
                  </div>
                )
              })}
            </div>

            {/* Promo code */}
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">{t('checkout.promo.label')}</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={t('checkout.promo.placeholder')}
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value)
                    setPromoError('')
                  }}
                  disabled={!!appliedPromo}
                  className="flex-1 px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700"
                />
                <Button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={!!appliedPromo}
                  className="px-3 py-2 text-sm"
                  variant={appliedPromo ? 'outline' : 'default'}
                >
                  {appliedPromo ? '✓' : t('checkout.promo.apply')}
                </Button>
              </div>
              {promoError && <p className="text-red-600 text-xs mt-1">{promoError}</p>}
              {appliedPromo && (
                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-200">
                  {t('checkout.promo.applied')} ({appliedPromo} -{discountPromo?.discount}%)
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedPromo(undefined)
                      setPromoCode('')
                    }}
                    className="ml-2 underline"
                  >
                    {t('checkout.promo.remove')}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <span>{t('checkout.summary.items')}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t('checkout.summary.discount')}</span>
                  <span className="font-medium">-{formatCurrency(discount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>{t('checkout.summary.tax')}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('checkout.summary.delivery')}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{deliveryFee === 0 ? t('checkout.delivery.free') : formatCurrency(deliveryFee)}</span>
              </div>
            </div>

            <div className="text-lg font-bold flex justify-between">
              <span>{t('checkout.summary.total')}</span>
              <span className="text-indigo-600">{formatCurrency(grandTotal)}</span>
            </div>

            {!wholesaleGuard.isMinimumReached && (
              <WholesaleMinimumAlert
                className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
                minOrderAmount={wholesaleGuard.minOrderAmount}
                shortage={wholesaleGuard.shortage}
                formatCurrency={formatCurrency}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
