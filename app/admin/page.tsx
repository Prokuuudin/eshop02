'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { Button } from '@/components/ui/button'
import { PRODUCTS } from '@/data/products'
import { formatDate, formatEuro } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import AdminGate from '@/components/admin/AdminGate'
import { logout } from '@/lib/auth'

export default function AdminPage() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const { orders } = useOrders()
  const { getOrderStatus, setOrderStatus, bonusProgram, updateBonusProgram } = useAdminStore()
  const [bonusDraft, setBonusDraft] = useState(bonusProgram)
  const [bonusSaved, setBonusSaved] = useState(false)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0)
  const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)

  const statusColors: Record<OrderStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    shipped: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  }

  const statusLabels: Record<OrderStatus, string> = {
    pending: t('order.status.pending'),
    confirmed: t('order.status.confirmed'),
    shipped: t('order.status.shipped'),
    delivered: t('order.status.delivered'),
    cancelled: t('order.status.cancelled')
  }

  const saveBonusProgram = (): void => {
    updateBonusProgram(bonusDraft)
    setBonusSaved(true)
    setTimeout(() => setBonusSaved(false), 1500)
  }

  return (
    <AdminGate>
    <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('admin.dashboard')}</h1>
          <Button
            variant="outline"
            onClick={() => {
              logout()
              router.push('/')
            }}
          >
            {t('auth.logout')}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">B2B RFQ</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Управление заявками на спецпредложения</p>
            <Link href="/admin/rfq">
              <Button variant="outline" size="sm">Открыть RFQ панель</Button>
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Клиентские баркоды</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Выдача, редактирование и привязка баркодов компаний</p>
            <Link href="/admin/client-barcodes">
              <Button variant="outline" size="sm">Открыть баркоды</Button>
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">B2B Webhooks</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Проверка endpoint и истории доставок</p>
            <Link href="/account/integrations/webhooks">
              <Button variant="outline" size="sm">Открыть Webhooks</Button>
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Блог</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Создание, редактирование и удаление статей</p>
            <Link href="/admin/blog">
              <Button variant="outline" size="sm">Открыть управление блогом</Button>
            </Link>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Контент сайта</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Редактирование текстов и изображений без правки кода</p>
            <Link href="/admin/content">
              <Button variant="outline" size="sm">Открыть контент-панель</Button>
            </Link>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">📦 {t('admin.stats.totalOrders')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{orders.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💰 {t('admin.stats.totalRevenue')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(totalRevenue, locale)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">💵 {t('admin.stats.averageOrder')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{formatEuro(avgOrderValue, locale)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-gray-600 dark:text-gray-300 text-sm">📋 {t('admin.stats.itemsSold')}</p>
            <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-gray-100">{totalItems}</p>
          </div>
        </div>

        {/* Orders Section */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t('admin.orders')}</h2>

          {orders.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {orders.map((order) => {
                const status = getOrderStatus(order.id)
                const isExpanded = expandedOrder === order.id

                return (
                  <div key={order.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                      className="w-full text-left cursor-pointer flex justify-between items-start"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm text-gray-600 dark:text-gray-300">{order.id}</p>
                        <div className="flex gap-3 mt-2 text-sm">
                          <span>👤 {order.firstName} {order.lastName}</span>
                          <span>📧 {order.email}</span>
                          <span>💰 {formatEuro(order.total, locale)}</span>
                        </div>
                      </div>

                      <div className={`px-3 py-1 rounded text-sm font-medium ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('admin.deliveryAddress')}</p>
                            <p className="text-sm mt-1">{order.address}, {order.city}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('checkout.delivery.method')}</p>
                            <p className="text-sm mt-1">
                              {order.deliveryMethod === 'courier' ? t('checkout.delivery.courier') : order.deliveryMethod === 'pickup' ? t('checkout.delivery.pickup') : t('checkout.delivery.post')}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('checkout.payment.title')}</p>
                            <p className="text-sm mt-1">{order.paymentMethod}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">{t('admin.date')}</p>
                            <p className="text-sm mt-1">{formatDate(order.createdAt, locale)}</p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{t('admin.products')}</p>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-sm space-y-1">
                            {order.items.map((item) => (
                              <p key={item.id}>
                                {item.title} × {item.quantity} = {formatEuro(item.price * item.quantity, locale)}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          {(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                            <Button
                              key={s}
                              onClick={() => setOrderStatus(order.id, s)}
                              variant={status === s ? 'default' : 'outline'}
                              size="sm"
                              className={status === s ? 'bg-indigo-600' : ''}
                            >
                              {statusLabels[s]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-300 text-center py-8">{t('admin.noOrders')}</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-8">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('admin.bonus.title')}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.enabled')}</span>
              <select
                value={bonusDraft.enabled ? 'yes' : 'no'}
                onChange={(e) => setBonusDraft((prev) => ({ ...prev, enabled: e.target.value === 'yes' }))}
                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
              >
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.earnRate')}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={bonusDraft.earnRatePercent}
                onChange={(e) => setBonusDraft((prev) => ({ ...prev, earnRatePercent: Number(e.target.value) }))}
                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.maxSpend')}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={bonusDraft.maxSpendPercent}
                onChange={(e) => setBonusDraft((prev) => ({ ...prev, maxSpendPercent: Number(e.target.value) }))}
                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 dark:text-gray-300 mb-1">{t('admin.bonus.minOrderForEarn')}</span>
              <input
                type="number"
                min={0}
                value={bonusDraft.minOrderForEarn}
                onChange={(e) => setBonusDraft((prev) => ({ ...prev, minOrderForEarn: Number(e.target.value) }))}
                className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={saveBonusProgram}>{t('common.save')}</Button>
            {bonusSaved && <span className="text-sm text-green-700">{t('admin.bonus.saved')}</span>}
          </div>
        </div>

        {/* Products Section */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t('admin.products')} ({PRODUCTS.length})</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">{t('product.title')}</th>
                  <th className="text-left py-2 px-2">{t('product.brand')}</th>
                  <th className="text-right py-2 px-2">{t('product.price')}</th>
                  <th className="text-right py-2 px-2">{t('admin.stock')}</th>
                  <th className="text-right py-2 px-2">{t('product.rating')}</th>
                </tr>
              </thead>
              <tbody className="divide-y max-h-64 overflow-y-auto">
                {PRODUCTS.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 px-2 font-mono text-xs">{product.id}</td>
                    <td className="py-2 px-2">{product.title}</td>
                    <td className="py-2 px-2 text-gray-600 dark:text-gray-300">{product.brand}</td>
                    <td className="py-2 px-2 text-right font-medium">{formatEuro(product.price, locale)}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={product.stock === 0 ? 'text-red-600 font-bold' : ''}>{product.stock}</span>
                    </td>
                    <td className="py-2 px-2 text-right">{product.rating.toFixed(1)} ★</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
    </AdminGate>
  )
}
