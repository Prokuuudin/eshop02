'use client'
import React, { useMemo } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { useOrders } from '@/lib/orders-store'

const CATEGORY_LABELS: Record<string, string> = {
  hair: 'Волосы',
  face: 'Лицо',
  body: 'Тело',
  nails: 'Ногти',
  equipment: 'Оборудование',
  new: 'Новинки'
}

function formatEur(amount: number): string {
  return `€${amount.toFixed(2)}`
}

export default function AdminMarketingAnalyticsPage() {
  const { orders } = useOrders()

  const promoOrders = useMemo(() => orders.filter((o) => o.promoCode && o.promoCode.trim() !== ''), [orders])

  const stats = useMemo(() => {
    const totalWithPromo = promoOrders.length
    const totalOrders = orders.length
    const conversionRate = totalOrders > 0 ? (totalWithPromo / totalOrders) * 100 : 0
    const totalDiscounts = promoOrders.reduce((sum, o) => sum + (o.discount || 0), 0)
    const avgDiscount = totalWithPromo > 0
      ? promoOrders.reduce((sum, o) => {
          const pct = o.subtotal > 0 ? ((o.discount || 0) / o.subtotal) * 100 : 0
          return sum + pct
        }, 0) / totalWithPromo
      : 0

    return { totalWithPromo, totalOrders, conversionRate, totalDiscounts, avgDiscount }
  }, [orders, promoOrders])

  const codeStats = useMemo(() => {
    const map = new Map<string, { count: number; totalDiscount: number; totalOrder: number }>()
    for (const o of promoOrders) {
      const code = (o.promoCode ?? '').toUpperCase()
      const prev = map.get(code) ?? { count: 0, totalDiscount: 0, totalOrder: 0 }
      map.set(code, {
        count: prev.count + 1,
        totalDiscount: prev.totalDiscount + (o.discount || 0),
        totalOrder: prev.totalOrder + (o.total || 0)
      })
    }
    return Array.from(map.entries())
      .map(([code, data]) => ({
        code,
        count: data.count,
        totalDiscount: data.totalDiscount,
        avgOrder: data.count > 0 ? data.totalOrder / data.count : 0
      }))
      .sort((a, b) => b.count - a.count)
  }, [promoOrders])

  const categoryStats = useMemo(() => {
    const map = new Map<string, { count: number; totalDiscount: number }>()
    for (const o of promoOrders) {
      for (const item of o.items) {
        const cat = (item as { category?: string }).category ?? 'unknown'
        const prev = map.get(cat) ?? { count: 0, totalDiscount: 0 }
        const perItemDiscount = o.items.length > 0 ? (o.discount || 0) / o.items.length : 0
        map.set(cat, {
          count: prev.count + (item.quantity || 1),
          totalDiscount: prev.totalDiscount + perItemDiscount * (item.quantity || 1)
        })
      }
    }
    return Array.from(map.entries())
      .map(([cat, data]) => ({
        cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        count: data.count,
        totalDiscount: data.totalDiscount
      }))
      .sort((a, b) => b.count - a.count)
  }, [promoOrders])

  const recentPromoOrders = useMemo(
    () => [...promoOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20),
    [promoOrders]
  )

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div>
          <Link href="/admin" className="text-sm text-primary hover:underline mb-1 inline-block">
            ← Назад в админку
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Аналитика продвижения</h1>
        </div>

        {promoOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-2">
            <p className="text-muted-foreground font-medium">Заказов с промокодами пока нет</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Когда покупатели начнут использовать промокоды при оформлении заказов, здесь появится статистика.
            </p>
            <Link href="/admin/marketing/discounts" className="inline-block mt-2 text-sm text-primary hover:underline">
              Управление промокодами →
            </Link>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground mb-1">Заказов с промокодом</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalWithPromo}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">из {stats.totalOrders} всего</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground mb-1">Сумма скидок</p>
                <p className="text-3xl font-bold text-primary">{formatEur(stats.totalDiscounts)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground mb-1">Средняя скидка</p>
                <p className="text-3xl font-bold text-foreground">{stats.avgDiscount.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs text-muted-foreground mb-1">Конверсия промо</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.conversionRate.toFixed(1)}%</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">заказов используют промокод</p>
              </div>
            </div>

            {/* Code usage table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Использование промокодов</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-3 font-medium">Код</th>
                      <th className="px-5 py-3 font-medium">Использований</th>
                      <th className="px-5 py-3 font-medium">Общая скидка</th>
                      <th className="px-5 py-3 font-medium">Средний чек</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {codeStats.map((row) => (
                      <tr key={row.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-5 py-3 font-mono font-semibold text-foreground">{row.code}</td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{row.count}</td>
                        <td className="px-5 py-3 text-primary font-medium">{formatEur(row.totalDiscount)}</td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{formatEur(row.avgOrder)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Categories */}
            {categoryStats.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-foreground">Покупки со скидкой по категориям</h2>
                </div>
                <div className="p-5 space-y-3">
                  {categoryStats.map((row) => {
                    const maxCount = categoryStats[0]?.count ?? 1
                    const widthPct = Math.round((row.count / maxCount) * 100)
                    return (
                      <div key={row.cat} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300 font-medium">{row.label}</span>
                          <span className="text-muted-foreground">{row.count} ед. &middot; {formatEur(row.totalDiscount)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 dark:bg-primary rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent promo orders */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Последние заказы с промокодом</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentPromoOrders.map((order) => (
                  <div key={order.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{order.email}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-sm">
                      <span className="font-mono font-semibold text-primary">{order.promoCode}</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">-{formatEur(order.discount || 0)}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(order.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </AdminGate>
  )
}
