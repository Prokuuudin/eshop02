'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import AdminGate from '@/components/admin/AdminGate'
import type { Order } from '@/lib/orders-store'
import type { ReturnRequest } from '@/lib/returns-store'
import { formatDate, formatEuro } from '@/lib/utils'
import { fetchCustomerReturns } from './fetchCustomerReturns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ServerSegment = 'vip' | 'regular' | 'new' | 'inactive'
type Segment = 'VIP' | 'Постоянный' | 'Новый' | 'Неактивный'

const SEGMENT_LABEL: Record<ServerSegment, Segment> = {
  vip: 'VIP',
  regular: 'Постоянный',
  new: 'Новый',
  inactive: 'Неактивный',
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
  shipped:   'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary/60',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

const LOC = 'ru-RU'

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage(): React.ReactElement {
  const searchParams = useSearchParams()
  const email = decodeURIComponent(searchParams.get('email') ?? '')

  const [tab, setTab] = useState<'orders' | 'returns' | 'products'>('orders')
  const [summary, setSummary] = useState<{
    firstName: string; lastName: string; totalOrders: number; totalSpent: number
    lastOrderDate: string | null; segment: ServerSegment
  } | null>(null)
  const [customerOrders, setCustomerOrders] = useState<Order[]>([])
  const [orderStatuses, setOrderStatuses] = useState<Record<string, string>>({})
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({})
  const [customerReturns, setCustomerReturns] = useState<ReturnRequest[]>([])
  const [returnsLoading, setReturnsLoading] = useState(true)

  // Customer-wide totals/segment come from the same server-side aggregation
  // already used by /admin/customers/segments, instead of being recomputed
  // here from a full client-side order sync.
  useEffect(() => {
    if (!email) return
    fetch(`/api/admin/customers?email=${encodeURIComponent(email)}&pageSize=1`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((data: { customers?: Array<{ email: string; firstName: string; lastName: string; totalOrders: number; totalSpent: number; lastOrderDate: string | null; segment: ServerSegment }> }) => {
        const customer = data.customers?.find((item) => item.email.toLowerCase() === email.toLowerCase())
        if (customer) setSummary(customer)
      })
      .catch(() => {})
  }, [email])

  // Individual order rows (for the Заказы/Покупки tabs) are fetched scoped to
  // this one customer, not synced wholesale from the admin order table.
  useEffect(() => {
    if (!email) return
    const controller = new AbortController()
    fetch(`/api/admin/orders?search=${encodeURIComponent(email)}&take=200`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((data: { orders?: (Omit<Order, 'createdAt'> & { createdAt: string })[]; statuses?: Record<string, string>; notes?: Record<string, string> }) => {
        const rows = (data.orders ?? [])
          .filter((o) => o.email.toLowerCase() === email.toLowerCase())
          .map((o) => ({ ...o, createdAt: new Date(o.createdAt) }))
        setCustomerOrders(rows)
        setOrderStatuses(data.statuses ?? {})
        setOrderNotes(data.notes ?? {})
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setCustomerOrders([]); setOrderStatuses({}); setOrderNotes({}) } })
    return () => controller.abort()
  }, [email])

  // Returns are not part of the globally-hydrated store (that's only populated
  // by the separate /admin/returns page's own effect) — fetch this customer's
  // returns directly, scoped server-side, so the tab works cold.
  useEffect(() => {
    if (!email) return
    let cancelled = false
    setReturnsLoading(true)
    fetchCustomerReturns(email)
      .then((data) => { if (!cancelled) setCustomerReturns(data) })
      .catch(() => { if (!cancelled) setCustomerReturns([]) })
      .finally(() => { if (!cancelled) setReturnsLoading(false) })
    return () => { cancelled = true }
  }, [email])

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalOrders = summary?.totalOrders ?? customerOrders.length
    const totalSpent = summary?.totalSpent ?? customerOrders.reduce((s, o) => s + o.total, 0)
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0
    const lastOrderDate = summary?.lastOrderDate
      ? new Date(summary.lastOrderDate)
      : customerOrders[0] ? new Date(customerOrders[0].createdAt) : null
    const segment = SEGMENT_LABEL[summary?.segment ?? 'inactive']
    const firstName = summary?.firstName ?? customerOrders[0]?.firstName ?? ''
    const lastName = summary?.lastName ?? customerOrders[0]?.lastName ?? ''
    const phone = customerOrders[0]?.phone ?? ''
    return { totalOrders, totalSpent, aov, lastOrderDate, segment, firstName, lastName, phone }
  }, [summary, customerOrders])

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
          <p className="text-muted-foreground">Email клиента не указан.</p>
          <Link href="/admin/customers/segments" className="text-primary hover:underline text-sm mt-2 inline-block">
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
        <Link href="/admin/customers/segments" className="text-sm text-primary hover:underline">
          ← Клиенты
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-start gap-5">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-primary dark:text-primary">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {[stats.firstName, stats.lastName].filter(Boolean).join(' ') || email}
              </h1>
              <span className={`rounded-full border px-3 py-0.5 text-sm font-medium ${SEGMENT_BADGE[stats.segment]}`}>
                {stats.segment}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-1.5 text-sm text-muted-foreground">
              <a href={`mailto:${email}`} className="hover:text-primary dark:hover:text-primary/80 hover:underline">{email}</a>
              {stats.phone && <span>{stats.phone}</span>}
            </div>
          </div>

          <div className="flex gap-2">
            <a href={`/api/admin/customers/export?email=${encodeURIComponent(email)}`} download>
              <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-gray-50 hover:text-foreground dark:hover:bg-gray-800 transition-colors">
                Отчёт о данных клиента (PDF)
              </button>
            </a>
            <a href={`mailto:${email}`}>
              <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Написать письмо
              </button>
            </a>
            <Link href={`/admin/orders?q=${encodeURIComponent(email)}`}>
              <button type="button" className="rounded-lg border border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/10 px-3 py-1.5 text-sm text-primary dark:text-primary hover:bg-primary/10 dark:hover:bg-primary/40 transition-colors">
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
        <div className="flex gap-0 border-b border-border">
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
                  ? 'border-primary text-primary dark:border-primary/70'
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
              <div className="py-10 text-center text-sm text-muted-foreground">Заказов нет</div>
            )}
            {customerOrders.map((order) => {
              const status = orderStatuses[order.id] ?? 'pending'
              const note = orderNotes[order.id]
              return (
                <div key={order.id} className="rounded-xl border border-border bg-card px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${ORDER_STATUS_COLORS[status]}`}>
                          {ORDER_STATUS_LABELS[status] ?? status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(order.createdAt, LOC)}
                        {' · '}
                        {order.items.length} {order.items.length === 1 ? 'позиция' : 'позиций'}
                        {' · '}
                        {order.deliveryMethod === 'courier' ? 'Курьер' : order.deliveryMethod === 'pickup' ? 'Самовывоз' : 'Почта'}
                      </p>
                      {/* Items preview */}
                      <p className="text-xs text-muted-foreground truncate max-w-xs">
                        {order.items.map((i) => `${i.title} ×${i.quantity}`).join(', ')}
                      </p>
                      {note && (
                        <p className="text-xs text-primary italic">📝 {note}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-foreground">{formatEuro(order.total, LOC)}</p>
                      <p className="text-xs text-muted-foreground">{order.paymentMethod}</p>
                      <Link
                        href={`/admin/orders?q=${encodeURIComponent(order.id)}`}
                        className="text-xs text-primary hover:underline mt-1 inline-block"
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
            {returnsLoading && (
              <div className="py-10 text-center text-sm text-muted-foreground">Загрузка…</div>
            )}
            {!returnsLoading && customerReturns.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">Возвратов нет</div>
            )}
            {customerReturns.map((ret) => (
              <div key={ret.id} className="rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{ret.id}</span>
                      <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-muted text-foreground">
                        {ret.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Заказ: <span className="font-mono">{ret.orderId}</span>
                      {' · '}
                      {formatDate(ret.createdAt, LOC)}
                    </p>
                    <p className="text-xs text-muted-foreground">{ret.reason}</p>
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
              <div className="py-10 text-center text-sm text-muted-foreground">Нет данных</div>
            )}
            {topProducts.map((p, i) => (
              <div key={p.title} className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                {p.image && <Image unoptimized src={p.image} alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-cover shrink-0" />}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.brand}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">{formatEuro(p.revenue, LOC)}</p>
                  <p className="text-xs text-muted-foreground">{p.qty} шт</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
