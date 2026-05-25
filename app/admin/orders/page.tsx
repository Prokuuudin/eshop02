'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore, type OrderStatus } from '@/lib/admin-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

type SortField = 'date' | 'total'
type SortDir = 'asc' | 'desc'

const STATUS_LIST: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Новый',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Не оплачен',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
}

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const DELIVERY_LABELS: Record<string, string> = {
  courier: 'Курьер',
  pickup: 'Самовывоз',
  post: 'Почта',
}

export default function AdminOrdersPage() {
  const { orders } = useOrders()
  const { getOrderStatus, setOrderStatus } = useAdminStore()
  const { language } = useTranslation()
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  const statsByStatus = useMemo(() => {
    return STATUS_LIST.reduce(
      (acc, s) => {
        acc[s] = orders.filter((o) => getOrderStatus(o.id) === s).length
        return acc
      },
      {} as Record<OrderStatus, number>
    )
  }, [orders, getOrderStatus])

  const totalRevenue = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const result = orders.filter((order) => {
      const matchSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        order.firstName.toLowerCase().includes(q) ||
        order.lastName.toLowerCase().includes(q) ||
        order.email.toLowerCase().includes(q) ||
        order.phone.toLowerCase().includes(q)

      const orderStatus = getOrderStatus(order.id)
      const matchStatus = statusFilter === 'all' || orderStatus === statusFilter
      const matchPayment = paymentFilter === 'all' || (order.paymentStatus ?? 'unpaid') === paymentFilter
      const matchDelivery = deliveryFilter === 'all' || order.deliveryMethod === deliveryFilter

      return matchSearch && matchStatus && matchPayment && matchDelivery
    })

    result.sort((a, b) => {
      if (sortField === 'date') {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        return sortDir === 'asc' ? diff : -diff
      }
      const diff = a.total - b.total
      return sortDir === 'asc' ? diff : -diff
    })

    return result
  }, [orders, search, statusFilter, paymentFilter, deliveryFilter, sortField, sortDir, getOrderStatus])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Заказы</h1>
        <Link href="/admin">
          <Button variant="outline">Назад в админку</Button>
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="col-span-2 md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Выручка</p>
          <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{formatEuro(totalRevenue, locale)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{orders.length} заказов всего</p>
        </div>
        {STATUS_LIST.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
              statusFilter === s
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">{STATUS_LABELS[s]}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{statsByStatus[s] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ID, имени, email, телефону..."
            className="flex-1 min-w-[220px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="all">Все статусы</option>
            {STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="all">Все оплаты</option>
            <option value="unpaid">Не оплачен</option>
            <option value="pending">Ожидает оплаты</option>
            <option value="paid">Оплачен</option>
            <option value="failed">Ошибка оплаты</option>
          </select>
          <select
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="all">Все доставки</option>
            <option value="courier">Курьер</option>
            <option value="pickup">Самовывоз</option>
            <option value="post">Почта</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="text-xs">Сортировка:</span>
          <button
            type="button"
            onClick={() => toggleSort('date')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'date'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            По дате {sortField === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
          <button
            type="button"
            onClick={() => toggleSort('total')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortField === 'total'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            По сумме {sortField === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
          </button>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {filtered.length} из {orders.length}
          </span>
        </div>
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {filtered.map((order) => {
          const status = getOrderStatus(order.id)
          const isExpanded = expandedOrder === order.id
          const payStatus = order.paymentStatus ?? 'unpaid'

          return (
            <div
              key={order.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                aria-expanded={isExpanded}
                className="w-full text-left px-5 py-4 flex flex-wrap items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">{order.id}</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}>
                      {PAYMENT_LABELS[payStatus]}
                    </span>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {order.firstName} {order.lastName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {order.email} · {order.phone}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(order.createdAt, locale)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900 dark:text-gray-100">{formatEuro(order.total, locale)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {order.items.length} {order.items.length === 1 ? 'товар' : order.items.length < 5 ? 'товара' : 'товаров'}
                  </p>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-5 space-y-5">

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(order.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Скопировать ID
                    </button>
                    <a
                      href={`mailto:${order.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Написать клиенту
                    </a>
                    <a
                      href={`tel:${order.phone}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Позвонить
                    </a>
                  </div>

                  {/* Info blocks */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Customer */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Клиент</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.firstName} {order.lastName}</p>
                      <a href={`mailto:${order.email}`} className="block text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate">{order.email}</a>
                      <a href={`tel:${order.phone}`} className="block text-sm text-gray-700 dark:text-gray-300 hover:underline">{order.phone}</a>
                    </div>

                    {/* Delivery */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Доставка</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{DELIVERY_LABELS[order.deliveryMethod] ?? order.deliveryMethod}</p>
                      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
                        <p>{order.address}</p>
                        {order.postalCode && <p>Индекс: {order.postalCode}</p>}
                        <p>{order.city}</p>
                      </div>
                    </div>

                    {/* Payment */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Оплата</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${PAYMENT_COLORS[payStatus]}`}>
                          {PAYMENT_LABELS[payStatus]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{order.paymentMethod}</p>
                      {order.paymentProvider && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Провайдер: <span className="text-gray-900 dark:text-gray-100 font-medium">{order.paymentProvider}</span></p>
                      )}
                      {order.paymentSessionId && (
                        <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Session ID</p>
                          <p className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">{order.paymentSessionId}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Состав заказа</p>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-10 h-10 object-cover rounded-md shrink-0"
                            />
                          )}
                          <p className="flex-1 min-w-0 text-sm text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.quantity} шт × {formatEuro(item.price, locale)}
                            </p>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {formatEuro(item.price * item.quantity, locale)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Amounts */}
                  <div className="flex justify-end">
                    <div className="text-sm space-y-1.5 min-w-[260px]">
                      <div className="flex justify-between gap-6">
                        <span className="text-gray-500 dark:text-gray-400">Сумма за товары</span>
                        <span className="text-gray-900 dark:text-gray-100">{formatEuro(order.subtotal, locale)}</span>
                      </div>
                      {order.discount > 0 && (
                        <div className="flex justify-between gap-6 text-green-700 dark:text-green-400">
                          <span>Скидка{order.promoCode ? ` (${order.promoCode})` : ''}</span>
                          <span>−{formatEuro(order.discount, locale)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-6">
                        <span className="text-gray-500 dark:text-gray-400">Доставка</span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {order.delivery === 0 ? 'Бесплатно' : formatEuro(order.delivery, locale)}
                        </span>
                      </div>
                      {order.tax > 0 && (
                        <div className="flex justify-between gap-6">
                          <span className="text-gray-500 dark:text-gray-400">Налог (НДС)</span>
                          <span className="text-gray-900 dark:text-gray-100">{formatEuro(order.tax, locale)}</span>
                        </div>
                      )}
                      {(order.bonusSpent ?? 0) > 0 && (
                        <div className="flex justify-between gap-6 text-amber-700 dark:text-amber-400">
                          <span>Бонусы использованы</span>
                          <span>−{order.bonusSpent}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-6 font-bold text-base pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-900 dark:text-gray-100">Итого</span>
                        <span className="text-gray-900 dark:text-gray-100">{formatEuro(order.total, locale)}</span>
                      </div>
                      <div className="flex justify-between gap-6 text-emerald-700 dark:text-emerald-400 font-medium">
                        <span>Прибыль</span>
                        <span>{formatEuro(order.total - order.tax - order.delivery, locale)}</span>
                      </div>
                      {(order.bonusEarned ?? 0) > 0 && (
                        <div className="flex justify-between gap-6 text-xs text-amber-600 dark:text-amber-400">
                          <span>Бонусов начислено</span>
                          <span>+{order.bonusEarned}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status management */}
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Изменить статус</p>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_LIST.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={status === s ? 'default' : 'outline'}
                          className={status === s ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}
                          onClick={() => setOrderStatus(order.id, s)}
                        >
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-10 bg-gray-50 dark:bg-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
            {orders.length === 0 ? 'Заказов пока нет' : 'Нет заказов по выбранным фильтрам'}
          </div>
        )}
      </div>
    </main>
  )
}
