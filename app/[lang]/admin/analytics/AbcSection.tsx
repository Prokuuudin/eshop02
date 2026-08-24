import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatEuro } from '@/lib/utils'
import { GRADE_STYLES, type AbcGrade, type AbcRow, Empty } from './analytics-shared'
import type { ReactElement } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'

type RawAbcRow = { id: string; title: string; brand: string; qty: number; revenue: number; revenuePct: number; cumPct: number }

export default function AbcSection(): ReactElement {
  const { l, locale } = useAdminLocale()
  const [filter, setFilter] = useState<AbcGrade | 'all'>('all')
  const [loaded, setLoaded] = useState<RawAbcRow[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/analytics/abc', { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((json: { rows: RawAbcRow[] }) => setLoaded(json.rows))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setLoaded([]) })
    return () => controller.abort()
  }, [])

  const rows = useMemo<AbcRow[]>(() => {
    return (loaded ?? []).map((r) => {
      const grade: AbcGrade = r.cumPct <= 0.8 ? 'A' : r.cumPct <= 0.95 ? 'B' : 'C'
      return { ...r, grade }
    })
  }, [loaded])

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

  if (loaded === null) {
    return <Empty text={l('Загрузка…', 'Loading…', 'Ielāde…')} />
  }
  if (rows.length === 0) {
    return <Empty text={l('Нет данных о заказах. ABC-анализ строится на истории продаж.', 'No order data. ABC analysis is based on sales history.', 'Nav pasūtījumu datu. ABC analīze tiek veidota no pārdošanas vēstures.')} />
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
              <span className="text-sm text-muted-foreground">{counts[g]} {l('товаров', 'products', 'produkti')}</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatEuro(revenue[g], locale)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total > 0 ? Math.round((revenue[g] / total) * 100) : 0}% {l('выручки', 'of revenue', 'no ieņēmumiem')}
            </p>
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground -mt-2">
        {l('A — 80% выручки · B — следующие 15% · C — оставшиеся 5%', 'A — 80% of revenue · B — next 15% · C — remaining 5%', 'A — 80% ieņēmumu · B — nākamie 15% · C — atlikušie 5%')}
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">#</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Товар', 'Product', 'Produkts')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Бренд', 'Brand', 'Zīmols')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Кол-во', 'Qty', 'Daudzums')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Выручка', 'Revenue', 'Ieņēmumi')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('% от итога', '% of total', '% no kopējā')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Накопл. %', 'Cumulative %', 'Kumulatīvie %')}</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">{l('Группа', 'Group', 'Grupa')}</th>
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
                  {formatEuro(r.revenue, locale)}
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
          <div className="py-10 text-center text-sm text-muted-foreground">{l('Нет товаров в группе', 'No products in group', 'Grupā nav produktu')} {filter}</div>
        )}
      </div>
    </div>
  )
}
