import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatEuro } from '@/lib/utils'
import { AnalyticsPagination, GRADE_STYLES, type AbcGrade, type AbcRow, Empty, LoadError } from './analytics-shared'
import type { ReactElement } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { Input } from '@/components/ui/input'

type AbcPeriod = '30d' | '90d' | '365d' | 'all'
type AbcResponse = { rows: AbcRow[]; total: number; page: number; pageSize: number; summary: Record<AbcGrade, { count: number; revenue: number }>; period?: AbcPeriod }
const PAGE_SIZE = 25
const EMPTY_SUMMARY: AbcResponse['summary'] = { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } }

export default function AbcSection(): ReactElement {
  const { l, locale } = useAdminLocale()
  const [filter, setFilter] = useState<AbcGrade | 'all'>('all')
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<AbcResponse | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState<AbcPeriod>('all')

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), period })
    if (filter !== 'all') params.set('grade', filter)
    if (query.trim()) params.set('search', query.trim())
    fetch(`/api/admin/analytics/abc?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((json: AbcResponse) => { setLoaded(json); setError(false) })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setLoaded({ rows: [], total: 0, page, pageSize: PAGE_SIZE, summary: EMPTY_SUMMARY }); setError(true) } })
    }, query.trim() ? 250 : 0)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [filter, page, period, query, reloadKey])

  const rows = loaded?.rows ?? []
  const summary = loaded?.summary ?? EMPTY_SUMMARY
  const totalRevenue = Object.values(summary).reduce((sum, item) => sum + item.revenue, 0)

  if (loaded === null) {
    return <Empty text={l('Загрузка…', 'Loading…', 'Ielāde…')} />
  }
  if (error) {
    return <LoadError text={l('Не удалось загрузить ABC-анализ.', 'Failed to load ABC analysis.', 'Neizdevās ielādēt ABC analīzi.')} retryLabel={l('Повторить', 'Retry', 'Mēģināt vēlreiz')} onRetry={() => { setLoaded(null); setError(false); setReloadKey((key) => key + 1) }} />
  }
  if (rows.length === 0 && filter === 'all' && !query.trim()) {
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
            onClick={() => { setFilter(filter === g ? 'all' : g); setPage(1); setLoaded(null) }}
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
              <span className="text-sm text-muted-foreground">{summary[g].count} {l('товаров', 'products', 'produkti')}</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatEuro(summary[g].revenue, locale)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalRevenue > 0 ? Math.round((summary[g].revenue / totalRevenue) * 100) : 0}% {l('выручки', 'of revenue', 'no ieņēmumiem')}
            </p>
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground -mt-2">
        {l('A — 80% выручки · B — следующие 15% · C — оставшиеся 5%', 'A — 80% of revenue · B — next 15% · C — remaining 5%', 'A — 80% ieņēmumu · B — nākamie 15% · C — atlikušie 5%')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1) }}
        placeholder={l('Поиск по товару или бренду…', 'Search by product or brand…', 'Meklēt pēc produkta vai zīmola…')}
        className="max-w-sm"
      />
      <div className="flex items-center gap-2">
        <select aria-label={l('Период ABC-анализа', 'ABC analysis period', 'ABC analīzes periods')} value={period} onChange={(event) => { setPeriod(event.target.value as AbcPeriod); setPage(1); setLoaded(null) }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="30d">{l('30 дней', '30 days', '30 dienas')}</option><option value="90d">{l('90 дней', '90 days', '90 dienas')}</option><option value="365d">{l('365 дней', '365 days', '365 dienas')}</option><option value="all">{l('Всё время', 'All time', 'Viss periods')}</option>
        </select>
        <a href={`/api/admin/analytics/abc?period=${period}&grade=${filter === 'all' ? '' : filter}&search=${encodeURIComponent(query.trim())}&export=csv`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">{l('Экспорт CSV', 'Export CSV', 'Eksportēt CSV')}</a>
      </div>
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
            {rows.map((r, index) => (
              <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${GRADE_STYLES[r.grade].row}`}>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{(page - 1) * PAGE_SIZE + index + 1}</td>
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
        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {query.trim()
              ? l('Ничего не найдено', 'Nothing found', 'Nekas netika atrasts')
              : `${l('Нет товаров в группе', 'No products in group', 'Grupā nav produktu')} ${filter}`}
          </div>
        )}
      </div>
      <AnalyticsPagination page={page} pageSize={PAGE_SIZE} total={loaded?.total ?? 0} loading={loaded === null} labels={{ previous: l('Назад', 'Previous', 'Atpakaļ'), next: l('Вперёд', 'Next', 'Tālāk'), page: l('Страница', 'Page', 'Lapa'), of: l('из', 'of', 'no') }} onPageChange={(nextPage) => { setPage(nextPage); setLoaded(null) }} />
    </div>
  )
}
