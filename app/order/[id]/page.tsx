'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { useTranslation } from '@/lib/use-translation'
import { formatDate, formatEuro, getLocaleFromLanguage } from '@/lib/utils'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default function OrderPage({ params }: PageProps) {
  const { id } = React.use(params)
  const { t, language } = useTranslation()
  const { getOrder } = useOrders()
  const { getOrderStatus } = useAdminStore()
  const order = getOrder(id)
  const locale = getLocaleFromLanguage(language)

  const getDeliveryLabel = (deliveryMethod: string): string => {
    if (deliveryMethod === 'courier') return t('order.delivery.courier')
    if (deliveryMethod === 'pickup') return t('order.delivery.pickup')
    return t('order.delivery.post')
  }

  const getPaymentLabel = (paymentMethod: string): string => {
    if (paymentMethod === 'card') return t('order.payment.card')
    if (paymentMethod === 'bank') return t('order.payment.bank')
    return t('order.payment.cash')
  }

  const formatCurrency = (value: number): string => formatEuro(value, locale)

  const getStatusLabel = (status: string): string => {
    if (status === 'confirmed') return t('order.status.confirmed')
    if (status === 'shipped') return t('order.status.shipped')
    if (status === 'delivered') return t('order.status.delivered')
    if (status === 'cancelled') return t('order.status.cancelled')
    return t('order.status.pending')
  }

  const getStatusClasses = (status: string): string => {
    if (status === 'confirmed') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
    if (status === 'shipped') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
    if (status === 'delivered') return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
    if (status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200'
  }

  if (!order) {
    return (
      <main className="w-full px-4 py-12">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('order.notFoundTitle')}</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{t('order.notFoundDescription')}</p>
          <Link href="/catalog">
            <Button>{t('order.backToCatalog')}</Button>
          </Link>
        </div>
      </main>
    )
  }

  const status = getOrderStatus(order.id)
  const timelineSteps = [
    { id: 'pending', label: t('order.status.pending') },
    { id: 'confirmed', label: t('order.status.confirmed') },
    { id: 'shipped', label: t('order.status.shipped') },
    { id: 'delivered', label: t('order.status.delivered') }
  ]

  const statusOrder: Record<string, number> = {
    pending: 0,
    confirmed: 1,
    shipped: 2,
    delivered: 3,
    cancelled: -1
  }

  const currentStatusIndex = statusOrder[status] ?? 0

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Success message */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">✓</div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">{t('order.successTitle')}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t('order.successDescription')}</p>
        </div>

        {/* Order details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Main info */}
          <div className="md:col-span-2 space-y-6">
            {/* Order ID and date */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{t('order.orderId')}</p>
                  <p className="text-xl font-bold text-indigo-600">{order.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{t('order.dateLabel')}</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{formatDate(order.createdAt, locale)}</p>
                </div>
              </div>
              <div className="mt-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(status)}`}>
                  {getStatusLabel(status)}
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">{t('order.timelineTitle')}</h2>
              {status === 'cancelled' ? (
                <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-200">
                  {t('order.status.cancelled')}
                </div>
              ) : (
                <div className="space-y-3">
                  {timelineSteps.map((step, index) => {
                    const done = index <= currentStatusIndex
                    const isCurrent = index === currentStatusIndex

                    return (
                      <div key={step.id} className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${done ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                        <p className={`text-sm ${done ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-300'}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <span className="text-xs text-indigo-600 dark:text-indigo-300">• {t('order.currentStep')}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Delivery info */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">{t('order.deliveryAddress')}</h2>
              <div className="space-y-2 text-gray-700 dark:text-gray-300">
                <p>
                  <span className="font-medium">{t('order.recipient')}:</span> {order.firstName} {order.lastName}
                </p>
                <p>
                  <span className="font-medium">{t('order.address')}:</span> {order.address}, {order.city}
                </p>
                {order.postalCode && (
                  <p>
                    <span className="font-medium">{t('order.postalCode')}:</span> {order.postalCode}
                  </p>
                )}
                <p>
                  <span className="font-medium">{t('order.phone')}:</span> {order.phone}
                </p>
                <p>
                  <span className="font-medium">{t('order.email')}:</span> {order.email}
                </p>
              </div>
            </div>

            {/* Delivery and payment */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold mb-2 text-gray-900 dark:text-gray-100">{t('order.deliveryMethod')}</h3>
                <p className="text-gray-700 dark:text-gray-300">{getDeliveryLabel(order.deliveryMethod)}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="font-bold mb-2 text-gray-900 dark:text-gray-100">{t('order.paymentMethod')}</h3>
                <p className="text-gray-700 dark:text-gray-300">{getPaymentLabel(order.paymentMethod)}</p>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">{t('order.itemsInOrder')}</h2>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      <Link href={`/product/${item.id}`} className="flex-shrink-0">
                        <Image
                          src={item.image}
                          alt={item.title}
                          width={80}
                          height={80}
                          className="rounded object-cover"
                        />
                      </Link>
                      <div className="flex-1">
                        <Link href={`/product/${item.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-300">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.title}</h3>
                        </Link>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{item.brand}</p>
                        <div className="mt-2 flex justify-between items-center">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{t('order.quantity')}: {item.quantity}</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary sidebar */}
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 sticky top-24">
              <h2 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">{t('order.summaryTitle')}</h2>
              <div className="space-y-2 text-sm mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                <div className="flex justify-between">
                  <span>{t('order.items')}:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-300">
                    <span>{t('checkout.summary.discount')}:</span>
                    <span className="font-medium">-{formatCurrency(order.discount)}</span>
                  </div>
                )}
                {(order.bonusSpent ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-300">
                    <span>{t('order.bonusSpent')}:</span>
                    <span className="font-medium">-{formatCurrency(order.bonusSpent ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{t('order.taxVat')}:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(order.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('order.shipping')}:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{order.delivery === 0 ? t('order.free') : formatCurrency(order.delivery)}</span>
                </div>
              </div>
              <div className="mb-4 text-lg font-bold flex justify-between border-b border-gray-200 dark:border-gray-700 pb-4 text-gray-900 dark:text-gray-100">
                <span>{t('order.total')}:</span>
                <span className="text-indigo-600">{formatCurrency(order.total)}</span>
              </div>

              {order.promoCode && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm">
                  <p className="font-medium text-green-700 dark:text-green-200">{t('order.promoApplied')}</p>
                  <p className="text-green-600 dark:text-green-300">{order.promoCode}</p>
                </div>
              )}

              {(order.bonusEarned ?? 0) > 0 && (
                <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded text-sm">
                  <p className="font-medium text-indigo-700 dark:text-indigo-200">{t('order.bonusEarned')}</p>
                  <p className="text-indigo-600 dark:text-indigo-300">+{order.bonusEarned ?? 0}</p>
                </div>
              )}

              <div className="space-y-2">
                <Button className="w-full">{t('order.downloadInvoice')}</Button>
                <Link href="/catalog" className="block">
                  <Button variant="outline" className="w-full">
                    {t('order.continueShopping')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Help section */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
          <h3 className="font-bold mb-2 text-gray-900 dark:text-gray-100">{t('order.helpTitle')}</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{t('order.helpText')}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('order.workHours')}</p>
        </div>
      </div>
    </main>
  )
}
