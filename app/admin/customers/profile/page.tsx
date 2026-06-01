'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AdminGate from '@/components/admin/AdminGate'
import { useOrders } from '@/lib/orders-store'
import { useAdminStore } from '@/lib/admin-store'
import { useReturnsStore } from '@/lib/returns-store'
import { formatDate, formatEuro } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Segment = 'VIP' | 'Постоянный' | 'Новый' | 'Неактивный'

function getSegment(totalOrders: number, totalSpent: number, lastOrderDate: Date | null): Segment {
  const days = lastOrderDate
    ? (Date.now() - new Date(lastOrderDate).getTime()) / 86400_000
    : Infinity
  if (totalSpent > 500) return 'VIP'
  if (totalOrders > 3) return 'Постоянный'
  if (days > 180 || totalOrders === 0) return 'Неактивный'
  return 'Новый'
}

const SEGMENT_BADGE: Record<Segment, string> = {
  VIP:        'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800',
  Постоянный: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  Новый:      'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800',
  Неактивный: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Новый', confirmed: 'Подтверждён', shipped: 'Отправлен',
  delivered: 'Доставлен', cancelled: 'Отменён',
}
const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  shipped:   'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const LOC = 'ru-RU'

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const searchParams = useSearchParams()
  const email = decodeURIComponent(searchParams.get('email') ?? '')

  const allOrders = useOrders((s) => s.orders)
  const { getOrderStatus, getOrderNote } = useAdminStore()
  const { returns } = useReturnsStore()

  const [tab, setTab] = useState<'orders' | 'returns' | 'products'>('orders')

  // ── Customer orders ───────────────────────────────────────────────────────

  const customerOrders = useMemo(
    () => allOrders
      .filter((o) => o.email.toLowerCase() === email.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allOrders, email]
  )

  const customerReturns = useMemo(
    () => returns.filter((r) => r.email.toLowerCase() === email.toLowerCase()),
    [returns, email]
  )

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalOrders = customerOrders.length
    const totalSpent = customerOrders.reduce((s, o) => s + o.total, 0)
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0
    const lastOrderDate = customerOrders[0] ? new Date(customerOrders[0].createdAt) : null
    const segment = getSegment(totalOrders, totalSpent, lastOrderDate)
    const firstName = customerOrders[0]?.firstName ?? ''
    const lastName = customerOrders[0]?.lastName ?? ''
    const phone = customerOrders[0]?.phone ?? ''
    return { totalOrders, totalSpent, aov, lastOrderDate, segment, firstName, lastName, phone }
  }, [customerOrders])

  // ── Top products ──────────────────────────────────────────────────────────

  const topProducts = useMemo(() => {
    const map = new Map<string, { title: string; brand: string; qty: number; revenue: number; image?: string }>()
    customerOrders.forEach((o) => {
      o.items.forEach((item) => {
        const e = map.get(item.id) ?? { title: item.title, brand: (item as { brand?: string }).brand ?? '—', qty: 0, revenue: 0, image: item.image }
        map.set(item.id, { ...e, qty: e.qty + item.quantity, revenue: e.revenue + item.price * item.quantity })
      })
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  }, [customerOrders])

  const initials = [stats.firstName[0], stats.lastName[0]].filter(Boolean).join('').toUpperCase() || email[0]?.toUpperCase() || '?'

  if (!email) {
    return (
      <AdminGate>
        <main className="w-full py-4 text-center">
          <p className="text-gray-500">Email клиента не указан.</p>
          <Link href="/admin/customers/segments" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">
            ← К сегментам
          </Link>
        </main>
      </AdminGate>
    )
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">

        {/* Back */}
        <Link href="/admin/customers/segments" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          ← Клиенты
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-start gap-5">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {[stats.firstName, stats.lastName].filter(Boolean).join(' ') || email}
              </h1>
              <span className={`rounded-full border px-3 py-0.5 text-sm font-medium ${SEGMENT_BADGE[stats.segment]}`}>
                {stats.segment}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              <a href={`mailto:${email}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">{email}</a>
              {stats.phone && <span>{stats.phone}</span>}
            </div>
          </div>

          <div className="flex gap-2">
            <a href={`mailto:${email}`}>
              <button type="button" className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Написать письмо
              </button>
            </a>
            <Link href={`/admin/orders?q=${encodeURIComponent(email)}`}>
              <button type="button" className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 text-sm text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                Все заказы ↗
              </button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Kpi label="Заказов" value={String(stats.totalOrders)} />
          <Kpi label="Потрачено" value={formatEuro(stats.totalSpent, LOC)} />
          <Kpi label="Средний чек" value={formatEuro(stats.aov, LOC)} />
          <Kpi
            label="Последний заказ"
            value={stats.lastOrderDate ? formatDate(stats.lastOrderDate, LOC) : '—'}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700">
          {([
            { key: 'orders' as const, label: `Заказы (${customerOrders.length})` },
            { key: 'returns' as const, label: `Возвраты (${customerReturns.length})` },
            { key: 'products' as const, label: `Покупки (${topProducts.length})` },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Orders tab */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {customerOrders.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">Заказов нет</div>
            )}
            {customerOrders.map((order) => {
              const status = getOrderStatus(order.id)
              const note = getOrderNote(order.id)
              return (
                <div key={order.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-400">{order.id}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${ORDER_STATUS_COLORS[status]}`}>
                          {ORDER_STATUS_LABELS[status] ?? status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(order.createdAt, LOC)}
                        {' · '}
                        {order.items.length} {order.items.length === 1 ? 'позиция' : 'позиций'}
                        {' · '}
                        {order.deliveryMethod === 'courier' ? 'Курьер' : order.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Почта'}
                      </p>
                      {/* Items preview */}
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {order.items.map((i) => `${i.title} ×${i.quantity}`).join(', ')}
                      </p>
                      {note && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 italic">📝 {note}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatEuro(order.total, LOC)}</p>
                      <p className="text-xs text-gray-400">{order.paymentMethod}</p>
                      <Link
                        href={`/admin/orders?q=${encodeURIComponent(order.id)}`}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block"
                      >
                        Открыть →
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Returns tab */}
        {tab === 'returns' && (
          <div className="space-y-3">
            {customerReturns.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">Возвратов нет</div>
            )}
            {customerReturns.map((ret) => (
              <div key={ret.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">{ret.id}</span>
                      <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {ret.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Заказ: <span className="font-mono">{ret.orderId}</span>
                      {' · '}
                      {formatDate(ret.createdAt, LOC)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ret.reason}</p>
                  </div>
                  <p className="text-base font-bold text-red-600 dark:text-red-400 shrink-0">
                    {formatEuro(ret.refundAmount, LOC)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Products tab */}
        {tab === 'products' && (
          <div className="space-y-2">
            {topProducts.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">Нет данных</div>
            )}
            {topProducts.map((p, i) => (
              <div key={p.title} className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
                {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm text-gray-400 w-5 shrink-0 tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400">{p.brand}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatEuro(p.revenue, LOC)}</p>
                  <p className="text-xs text-gray-400">{p.qty} шт</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
