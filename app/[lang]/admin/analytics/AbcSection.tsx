import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatEuro } from '@/lib/utils'
import { AnalyticsPagination, GRADE_STYLES, XYZ_STYLES, type AbcGrade, type AbcRow, type XyzGrade, Empty, LoadError } from './analytics-shared'
import type { ReactElement } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { Input } from '@/components/ui/input'
import { ChevronDown } from 'lucide-react'

type AbcPeriod = '30d' | '90d' | '365d' | 'all'
type MatrixCell = { count: number; revenue: number }
type AbcResponse = { rows: AbcRow[]; total: number; page: number; pageSize: number; summary: Record<AbcGrade, MatrixCell>; matrix: Partial<Record<`${AbcGrade}${XyzGrade}`, MatrixCell>>; period?: AbcPeriod; xyzWindow?: string }
const DEFAULT_PAGE_SIZE = 25
const EXPLANATION_STORAGE_KEY = 'admin-analytics-abc-explanation-open'
const EMPTY_SUMMARY: AbcResponse['summary'] = { A: { count: 0, revenue: 0 }, B: { count: 0, revenue: 0 }, C: { count: 0, revenue: 0 } }
const EMPTY_MATRIX: AbcResponse['matrix'] = {}
const MATRIX_CELL_STYLES: Record<`${AbcGrade}${XyzGrade}`, string> = {
  AX: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40',
  AY: 'border-teal-200 bg-teal-50 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/30 dark:hover:bg-teal-900/40',
  AZ: 'border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-900/40',
  BX: 'border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:hover:bg-sky-900/40',
  BY: 'border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:hover:bg-blue-900/40',
  BZ: 'border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-900/40',
  CX: 'border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:hover:bg-violet-900/40',
  CY: 'border-fuchsia-200 bg-fuchsia-50 hover:bg-fuchsia-100 dark:border-fuchsia-800 dark:bg-fuchsia-950/30 dark:hover:bg-fuchsia-900/40',
  CZ: 'border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:hover:bg-rose-900/40',
}

export default function AbcSection(): ReactElement {
  const { l, locale } = useAdminLocale()
  const [filter, setFilter] = useState<AbcGrade | 'all'>('all')
  const [xyzFilter, setXyzFilter] = useState<XyzGrade | 'all'>('all')
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<AbcResponse | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [page, setPage] = useState(1)
  const [period, setPeriod] = useState<AbcPeriod>('all')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [urlReady, setUrlReady] = useState(false)
  const [explanationOpen, setExplanationOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setExplanationOpen(window.localStorage.getItem(EXPLANATION_STORAGE_KEY) !== 'false')
    })
    return () => { cancelled = true }
  }, [])

  const toggleExplanation = () => {
    setExplanationOpen((open) => {
      const next = !open
      window.localStorage.setItem(EXPLANATION_STORAGE_KEY, String(next))
      return next
    })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlPage = Number(params.get('abcPage'))
    const urlSize = Number(params.get('abcPageSize'))
    const urlGrade = params.get('abcGrade')
    const urlXyz = params.get('xyzGrade')
    const urlPeriod = params.get('abcPeriod')
    queueMicrotask(() => {
      if (urlPage > 0) setPage(urlPage)
      if ([25, 50, 100].includes(urlSize)) setPageSize(urlSize)
      if (urlGrade === 'A' || urlGrade === 'B' || urlGrade === 'C') setFilter(urlGrade)
      if (urlXyz === 'X' || urlXyz === 'Y' || urlXyz === 'Z') setXyzFilter(urlXyz)
      if (urlPeriod === '30d' || urlPeriod === '90d' || urlPeriod === '365d' || urlPeriod === 'all') setPeriod(urlPeriod)
      setQuery(params.get('abcSearch') ?? '')
      setUrlReady(true)
    })
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const url = new URL(window.location.href)
    ;[['abcPage', String(page)], ['abcPageSize', String(pageSize)], ['abcGrade', filter], ['xyzGrade', xyzFilter], ['abcPeriod', period], ['abcSearch', query.trim()]].forEach(([key, value]) => value && value !== 'all' ? url.searchParams.set(key, value) : url.searchParams.delete(key))
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [filter, page, pageSize, period, query, urlReady, xyzFilter])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
    if (!urlReady) return () => controller.abort()
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), period })
    if (filter !== 'all') params.set('grade', filter)
    if (xyzFilter !== 'all') params.set('xyz', xyzFilter)
    if (query.trim()) params.set('search', query.trim())
    fetch(`/api/admin/analytics/abc?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((json: AbcResponse) => { const lastPage = Math.max(1, Math.ceil(json.total / pageSize)); if (page > lastPage) { setPage(lastPage); return; } setLoaded(json); setError(false) })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setLoaded({ rows: [], total: 0, page, pageSize, summary: EMPTY_SUMMARY, matrix: EMPTY_MATRIX }); setError(true) } })
    }, query.trim() ? 250 : 0)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [filter, page, pageSize, period, query, reloadKey, urlReady, xyzFilter])

  const rows = loaded?.rows ?? []
  const summary = loaded?.summary ?? EMPTY_SUMMARY
  const totalRevenue = Object.values(summary).reduce((sum, item) => sum + item.revenue, 0)
  const matrix = loaded?.matrix ?? EMPTY_MATRIX

  if (loaded === null) {
    return <Empty text={l('Загрузка…', 'Loading…', 'Ielāde…')} />
  }
  if (error) {
    return <LoadError text={l('Не удалось загрузить ABC-анализ.', 'Failed to load ABC analysis.', 'Neizdevās ielādēt ABC analīzi.')} retryLabel={l('Повторить', 'Retry', 'Mēģināt vēlreiz')} onRetry={() => { setLoaded(null); setError(false); setReloadKey((key) => key + 1) }} />
  }
  if (rows.length === 0 && filter === 'all' && xyzFilter === 'all' && !query.trim()) {
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="font-semibold text-foreground">{l('Матрица ABC/XYZ', 'ABC/XYZ matrix', 'ABC/XYZ matrica')}</h2><p className="text-xs text-muted-foreground">{l('X — CV ≤ 10% · Y — CV 10–25% · Z — CV > 25% или нет продаж в анализируемом периоде', 'X — CV ≤ 10% · Y — CV 10–25% · Z — CV > 25% or no sales in the analyzed period', 'X — CV ≤ 10% · Y — CV 10–25% · Z — CV > 25% vai analizētajā periodā nav pārdošanas')}</p></div>
          {(filter !== 'all' || xyzFilter !== 'all') && <button type="button" onClick={() => { setFilter('all'); setXyzFilter('all'); setPage(1); setLoaded(null) }} className="text-xs text-primary hover:underline">{l('Показать все группы', 'Show all groups', 'Rādīt visas grupas')}</button>}
        </div>
        <div className="rounded-lg border border-border bg-muted/40 text-sm text-foreground">
          <button type="button" onClick={toggleExplanation} aria-expanded={explanationOpen} className="group flex w-full items-baseline gap-2 px-4 py-3 text-left">
            <span className="text-sm font-semibold leading-5">{l('Как читать матрицу', 'How to read the matrix', 'Kā lasīt matricu')}</span>
            <span className="text-xs font-medium leading-5 text-primary underline-offset-4 group-hover:underline">
              {explanationOpen
                ? l('Свернуть пояснения', 'Hide explanation', 'Paslēpt skaidrojumu')
                : l('Показать пояснения', 'Show explanation', 'Rādīt skaidrojumu')}
            </span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 self-center text-primary transition-transform ${explanationOpen ? 'rotate-180' : ''}`} />
          </button>
          {explanationOpen && <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="text-muted-foreground">
            {l(
              'Первая буква показывает вклад товара в выручку: A — самые важные товары, которые вместе дают первые 80% выручки; B — следующие 15%; C — оставшиеся 5%.',
              'The first letter shows the product’s revenue contribution: A — the most important products making up the first 80% of revenue; B — the next 15%; C — the remaining 5%.',
              'Pirmais burts rāda preces ieguldījumu ieņēmumos: A — svarīgākās preces, kas veido pirmos 80% ieņēmumu; B — nākamie 15%; C — atlikušie 5%.'
            )}
          </p>
          <p className="mt-2 text-muted-foreground">
            {l(
              'Вторая буква показывает предсказуемость спроса: X — продажи стабильны; Y — заметно колеблются; Z — нерегулярны или сильно меняются. CV — коэффициент вариации: чем он меньше, тем легче прогнозировать продажи. Учитываются только завершённые дни, недели или месяцы. Товары без единой продажи в ABC/XYZ не попадают.',
              'The second letter shows demand predictability: X — stable sales; Y — noticeable fluctuations; Z — irregular or highly variable sales. CV is the coefficient of variation: the lower it is, the easier sales are to forecast. Only completed days, weeks or months are included. Products with no sales do not appear in ABC/XYZ.',
              'Otrais burts rāda pieprasījuma prognozējamību: X — stabili pārdošanas apjomi; Y — pamanāmas svārstības; Z — neregulāri vai ļoti mainīgi pārdošanas apjomi. CV ir variācijas koeficients: jo tas ir mazāks, jo vieglāk prognozēt pārdošanu. Tiek ņemtas vērā tikai pabeigtas dienas, nedēļas vai mēneši. Preces bez pārdošanas ABC/XYZ matricā neparādās.'
            )}
          </p>
          <p className="mt-2 text-muted-foreground">
            {l(
              'Практически: AX держите постоянно в наличии; AY планируйте с учётом колебаний; AZ контролируйте вручную. Для групп B применяйте умеренный запас, а товары C заказывайте осторожно — особенно CZ, чтобы не замораживать деньги в остатках.',
              'In practice: keep AX continuously in stock; plan AY with fluctuations in mind; review AZ manually. Use moderate stock for B groups and order C products cautiously — especially CZ — to avoid tying up cash in inventory.',
              'Praksē: AX pastāvīgi turiet krājumā; AY plānojiet, ņemot vērā svārstības; AZ pārskatiet manuāli. B grupām uzturiet mērenu krājumu, bet C preces pasūtiet piesardzīgi — īpaši CZ — lai neiesaldētu naudu krājumos.'
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {l('Нажмите на ячейку, например AX или CZ, чтобы показать соответствующие товары в таблице.', 'Select a cell, such as AX or CZ, to show the matching products in the table.', 'Noklikšķiniet uz šūnas, piemēram, AX vai CZ, lai tabulā parādītu atbilstošās preces.')}
          </p>
          </div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['A', 'B', 'C'] as AbcGrade[]).flatMap((abc) => (['X', 'Y', 'Z'] as XyzGrade[]).map((xyz) => {
            const key = `${abc}${xyz}` as `${AbcGrade}${XyzGrade}`
            const cell = matrix[key] ?? { count: 0, revenue: 0 }
            const active = filter === abc && xyzFilter === xyz
            return <button key={key} type="button" aria-pressed={active} onClick={() => { setFilter(active ? 'all' : abc); setXyzFilter(active ? 'all' : xyz); setPage(1); setLoaded(null) }} className={`rounded-xl border p-3 text-left shadow-sm transition-all ${MATRIX_CELL_STYLES[key]} ${active ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:-translate-y-0.5 hover:shadow-md'}`}><div className="flex items-center justify-between"><span className="font-bold">{key}</span><span className="text-sm tabular-nums">{cell.count}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatEuro(cell.revenue, locale)}</p></button>
          }))}
        </div>
        {period === 'all' && <p className="text-xs text-muted-foreground">{l('XYZ рассчитан по последним 12 завершённым месяцам; ABC — за всё время.', 'XYZ uses the latest 12 completed months; ABC uses all time.', 'XYZ izmanto pēdējos 12 pabeigtos mēnešus; ABC — visu periodu.')}</p>}
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
        <a href={`/api/admin/analytics/abc?period=${period}&grade=${filter === 'all' ? '' : filter}&xyz=${xyzFilter === 'all' ? '' : xyzFilter}&search=${encodeURIComponent(query.trim())}&export=csv`} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">{l('Экспорт CSV', 'Export CSV', 'Eksportēt CSV')}</a>
      </div>
      </div>

      {/* Table */}
      <div id="abc-results" className="scroll-mt-4 overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap sm:table-cell">#</th>
              <th className="sticky left-0 z-20 min-w-52 bg-muted px-4 py-3 text-left font-medium text-muted-foreground">{l('Товар', 'Product', 'Produkts')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{l('Бренд', 'Brand', 'Zīmols')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Кол-во', 'Qty', 'Daudzums')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Выручка', 'Revenue', 'Ieņēmumi')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('% от итога', '% of total', '% no kopējā')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{l('Накопл. %', 'Cumulative %', 'Kumulatīvie %')}</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">{l('Группа', 'Group', 'Grupa')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">CV, %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((r, index) => (
              <tr key={r.id} className={`group hover:bg-gray-50 dark:hover:bg-gray-800/50 ${GRADE_STYLES[r.grade].row}`}>
                <td className="hidden px-4 py-2.5 text-muted-foreground tabular-nums sm:table-cell">{(page - 1) * pageSize + index + 1}</td>
                <td className="sticky left-0 bg-card px-4 py-2.5 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50">
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
                  <span className={`rounded-l-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLES[r.grade].badge}`}>{r.grade}</span><span className={`rounded-r-full px-2 py-0.5 text-xs font-bold ${XYZ_STYLES[r.xyzGrade]}`}>{r.xyzGrade}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.variationCoeff == null ? '—' : `${(r.variationCoeff * 100).toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {query.trim()
              ? l('Ничего не найдено', 'Nothing found', 'Nekas netika atrasts')
              : `${l('Нет товаров в группе', 'No products in group', 'Grupā nav produktu')} ${filter === 'all' ? '' : filter}${xyzFilter === 'all' ? '' : xyzFilter}`}
          </div>
        )}
      </div>
      <AnalyticsPagination page={page} pageSize={pageSize} total={loaded?.total ?? 0} loading={loaded === null} labels={{ previous: l('Назад', 'Previous', 'Atpakaļ'), next: l('Вперёд', 'Next', 'Tālāk'), page: l('Страница', 'Page', 'Lapa'), of: l('из', 'of', 'no'), rows: l('Строк:', 'Rows:', 'Rindas:') }} onPageChange={(nextPage) => { setPage(nextPage); setLoaded(null) }} onPageSizeChange={(size) => { setPageSize(size); setPage(1); setLoaded(null) }} scrollTargetId="abc-results" />
    </div>
  )
}
