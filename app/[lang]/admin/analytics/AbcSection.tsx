import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useOrders } from '@/lib/orders-store'
import { formatEuro } from '@/lib/utils'
import { GRADE_STYLES, type AbcGrade, type AbcRow, Empty } from './analytics-shared'
import type { ReactElement } from 'react'

export default function AbcSection(): ReactElement {
  const orders = useOrders((s) => s.orders)
  const [filter, setFilter] = useState<AbcGrade | 'all'>('all')

  const rows = useMemo<AbcRow[]>(() => {
    const map = new Map<string, { title: string; brand: string; qty: number; revenue: number }>()

    orders.forEach((o) => {
      o.items.forEach((item) => {
        const e = map.get(item.id) ?? {
          title: item.title,
          brand: (item as { brand?: string }).brand ?? '—',
          qty: 0,
          revenue: 0,
        }
        map.set(item.id, {
          ...e,
          qty: e.qty + item.quantity,
          revenue: e.revenue + item.price * item.quantity,
        })
      })
    })

    const sorted = Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)

    const total = sorted.reduce((s, r) => s + r.revenue, 0)
    if (total === 0) return []

    let cum = 0
    return sorted.map((r) => {
      const revenuePct = r.revenue / total
      cum += revenuePct
      const grade: AbcGrade = cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C'
      return { ...r, revenuePct, cumPct: cum, grade }
    })
  }, [orders])

  const counts = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    rows.forEach((r) => c[r.grade]++)
    return c
  }, [rows])

  const revenue = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 }
    rows.forEach((r) => { c[r.grade] += r.revenue })
    return c
  }, [rows])

  const total = rows.reduce((s, r) => s + r.revenue, 0)
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.grade === filter)

  if (orders.length === 0) {
    return <Empty text="Нет данных о заказах. ABC-анализ строится на истории продаж." />
  }

  return (
    <div className="space-y-6">

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(['A', 'B', 'C'] as AbcGrade[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setFilter(filter === g ? 'all' : g)}
            className={[
              'rounded-xl border p-4 text-left transition-colors cursor-pointer',
              filter === g
                ? 'border-primary/70 dark:border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border bg-card hover:border-gray-300',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${GRADE_STYLES[g].badge}`}>
                {g}
              </span>
              <span className="text-sm text-muted-foreground">{counts[g]} товаров</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatEuro(revenue[g], 'ru-RU')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total > 0 ? Math.round((revenue[g] / total) * 100) : 0}% выручки
            </p>
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground -mt-2">
        A — 80% выручки · B — следующие 15% · C — оставшиеся 5%
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Товар</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Бренд</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Кол-во</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Выручка</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">% от итога</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Накопл. %</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Группа</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {filtered.map((r) => (
              <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${GRADE_STYLES[r.grade].row}`}>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{rows.indexOf(r) + 1}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/products/${r.id}`}
                    className="text-foreground hover:text-primary dark:hover:text-primary/80 hover:underline"
                  >
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.brand}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{r.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                  {formatEuro(r.revenue, 'ru-RU')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {(r.revenuePct * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span className={r.cumPct > 0.95 ? 'text-red-500' : r.cumPct > 0.8 ? 'text-yellow-600' : 'text-emerald-600'}>
                    {(r.cumPct * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_STYLES[r.grade].badge}`}>
                    {r.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">Нет товаров в группе {filter}</div>
        )}
      </div>
    </div>
  )
}
