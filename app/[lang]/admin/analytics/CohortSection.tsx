import { useEffect, useMemo, useState } from 'react'
import { monthLabel, retentionColor, Empty, LoadError } from './analytics-shared'
import type { ReactElement } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { ChevronDown } from 'lucide-react'

type CohortsResponse = {
  cohortSizes: { cohort: string; size: number }[]
  cells: { cohort: string; offset: number; count: number }[]
  summary?: { m1: number | null; m3: number | null; m6: number | null; cohortGrowth: number | null }
}

const COHORT_EXPLANATION_STORAGE_KEY = 'admin-analytics-cohort-explanation-open'

export default function CohortSection(): ReactElement {
  const { l, locale } = useAdminLocale()
  const [showPct, setShowPct] = useState(true)
  const [loaded, setLoaded] = useState<CohortsResponse | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [months, setMonths] = useState(12)
  const [urlReady, setUrlReady] = useState(false)
  const [explanationOpen, setExplanationOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setExplanationOpen(window.localStorage.getItem(COHORT_EXPLANATION_STORAGE_KEY) !== 'false')
    })
    return () => { cancelled = true }
  }, [])

  const toggleExplanation = () => {
    setExplanationOpen((open) => {
      const next = !open
      window.localStorage.setItem(COHORT_EXPLANATION_STORAGE_KEY, String(next))
      return next
    })
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlMonths = Number(params.get('cohortMonths'))
    queueMicrotask(() => {
      if ([6, 12, 24, 36].includes(urlMonths)) setMonths(urlMonths)
      setShowPct(params.get('cohortMode') !== 'count')
      setUrlReady(true)
    })
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const url = new URL(window.location.href)
    url.searchParams.set('cohortMonths', String(months))
    if (showPct) url.searchParams.delete('cohortMode'); else url.searchParams.set('cohortMode', 'count')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [months, showPct, urlReady])

  useEffect(() => {
    const controller = new AbortController()
    if (!urlReady) return () => controller.abort()
    fetch(`/api/admin/analytics/cohorts?months=${months}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status_${res.status}`))))
      .then((json: CohortsResponse) => { setLoaded(json); setError(false) })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { setLoaded({ cohortSizes: [], cells: [] }); setError(true) } })
    return () => controller.abort()
  }, [months, reloadKey, urlReady])

  const { cohortMonths, matrix, cohortSizes, maxOffset } = useMemo(() => {
    if (!loaded || loaded.cohortSizes.length === 0) {
      return { cohortMonths: [] as string[], matrix: new Map<string, Map<number, number>>(), cohortSizes: new Map<string, number>(), maxOffset: 0 }
    }

    const sizes = new Map(loaded.cohortSizes.map((r) => [r.cohort, r.size]))

    const mat = new Map<string, Map<number, number>>()
    let max = 0
    loaded.cells.forEach((cell) => {
      if (!mat.has(cell.cohort)) mat.set(cell.cohort, new Map())
      mat.get(cell.cohort)!.set(cell.offset, cell.count)
      if (cell.offset > max) max = cell.offset
    })

    return {
      cohortMonths: Array.from(sizes.keys()).sort(),
      matrix: mat,
      cohortSizes: sizes,
      maxOffset: Math.min(max, months - 1),
    }
  }, [loaded, months])

  if (loaded === null) {
    return <Empty text={l('Загрузка…', 'Loading…', 'Ielāde…')} />
  }
  if (error) {
    return <LoadError text={l('Не удалось загрузить когортный анализ.', 'Failed to load cohort analysis.', 'Neizdevās ielādēt kohortu analīzi.')} retryLabel={l('Повторить', 'Retry', 'Mēģināt vēlreiz')} onRetry={() => { setLoaded(null); setError(false); setReloadKey((key) => key + 1) }} />
  }
  if (cohortMonths.length === 0) {
    return <Empty text={l('Недостаточно данных для когортного анализа.', 'Not enough data for cohort analysis.', 'Kohortu analīzei nepietiek datu.')} />
  }

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: 'M+1', value: loaded.summary?.m1 }, { label: 'M+3', value: loaded.summary?.m3 }, { label: 'M+6', value: loaded.summary?.m6 }, { label: l('Рост когорты', 'Cohort growth', 'Kohortas pieaugums'), value: loaded.summary?.cohortGrowth }].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{metric.value == null ? '—' : `${metric.value > 0 && metric.label !== 'M+1' && metric.label !== 'M+3' && metric.label !== 'M+6' ? '+' : ''}${metric.value}%`}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-muted/40 text-sm text-foreground">
        <button type="button" onClick={toggleExplanation} aria-expanded={explanationOpen} className="group flex w-full items-baseline gap-2 px-4 py-3 text-left">
          <span className="text-sm font-semibold leading-5">{l('Как читать когортный анализ', 'How to read cohort analysis', 'Kā lasīt kohortu analīzi')}</span>
          <span className="text-xs font-medium leading-5 text-primary underline-offset-4 group-hover:underline">
            {explanationOpen
              ? l('Свернуть пояснения', 'Hide explanation', 'Paslēpt skaidrojumu')
              : l('Показать пояснения', 'Show explanation', 'Rādīt skaidrojumu')}
          </span>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 self-center text-primary transition-transform ${explanationOpen ? 'rotate-180' : ''}`} />
        </button>
        {explanationOpen && <div className="space-y-2 border-t border-border px-4 pb-4 pt-3 text-muted-foreground">
          <p>{l(
            'Когорта — это клиенты, которые впервые купили в одном месяце. Каждая строка показывает отдельную когорту, а число «Клиентов» — сколько новых покупателей в неё вошло.',
            'A cohort is a group of customers who made their first purchase in the same month. Each row represents one cohort, and “Customers” is the number of new buyers in it.',
            'Kohorta ir klienti, kuri pirmo pirkumu veica vienā mēnesī. Katra rinda rāda atsevišķu kohortu, bet “Klienti” — tajā iekļauto jauno pircēju skaitu.'
          )}</p>
          <p>{l(
            'M+0 — месяц первой покупки, M+1 — следующий месяц, M+3 — третий месяц после первой покупки. Процент показывает, какая доля исходной когорты снова купила в этом месяце. Переключатель «#» показывает количество таких клиентов вместо процента.',
            'M+0 is the first-purchase month, M+1 is the following month, and M+3 is the third month after the first purchase. The percentage shows how much of the original cohort purchased again that month. The “#” view shows the customer count instead of a percentage.',
            'M+0 ir pirmā pirkuma mēnesis, M+1 — nākamais mēnesis, bet M+3 — trešais mēnesis pēc pirmā pirkuma. Procenti rāda, kāda sākotnējās kohortas daļa šajā mēnesī iepirkās atkārtoti. Skats “#” procentu vietā rāda klientu skaitu.'
          )}</p>
          <p>{l(
            'Чем насыщеннее зелёный цвет, тем выше повторные покупки. Сравнивайте одинаковые столбцы у разных когорт: например, M+3 показывает, улучшается ли удержание клиентов через три месяца. Пустые будущие ячейки ещё не имеют данных и не означают потерю клиентов.',
            'A stronger green color means more repeat purchases. Compare the same column across cohorts: for example, M+3 shows whether three-month retention is improving. Empty future cells do not have data yet and do not mean customers were lost.',
            'Jo piesātinātāka zaļā krāsa, jo vairāk atkārtotu pirkumu. Salīdziniet vienu un to pašu kolonnu dažādām kohortām: piemēram, M+3 rāda, vai trīs mēnešu noturēšana uzlabojas. Tukšajās nākotnes šūnās datu vēl nav, un tās nenozīmē klientu zaudēšanu.'
          )}</p>
          <p>{l(
            'Верхние показатели M+1, M+3 и M+6 кратко показывают удержание через 1, 3 и 6 месяцев. «Рост когорты» сравнивает число новых покупателей в двух последних завершённых месяцах. Выбранный период определяет количество когорт и доступных столбцов M+.',
            'The M+1, M+3 and M+6 cards summarize retention after 1, 3 and 6 months. “Cohort growth” compares new customer counts in the latest two completed months. The selected period determines the number of cohorts and available M+ columns.',
            'M+1, M+3 un M+6 kartītes apkopo noturēšanu pēc 1, 3 un 6 mēnešiem. “Kohortas pieaugums” salīdzina jauno klientu skaitu pēdējos divos pabeigtajos mēnešos. Izvēlētais periods nosaka kohortu skaitu un pieejamās M+ kolonnas.'
          )}</p>
        </div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {l('Строки — месяц первой покупки когорты. Столбцы — месяцы с момента первой покупки.', 'Rows show the cohort’s first-purchase month. Columns show months since the first purchase.', 'Rindās ir kohortas pirmā pirkuma mēnesis. Kolonnās — mēneši kopš pirmā pirkuma.')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {l('М+0 = месяц первой покупки, М+1 = следующий месяц и т.д.', 'M+0 = first-purchase month, M+1 = the following month, etc.', 'M+0 = pirmā pirkuma mēnesis, M+1 = nākamais mēnesis utt.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="cohort-months">{l('Период', 'Period', 'Periods')}</label>
          <select id="cohort-months" value={months} onChange={(event) => { setMonths(Number(event.target.value)); setLoaded(null) }} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
            {[6, 12, 24, 36].map((value) => <option key={value} value={value}>{value} {l('мес.', 'months', 'mēn.')}</option>)}
          </select>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['pct', 'count'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setShowPct(m === 'pct')}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                (m === 'pct') === showPct
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {m === 'pct' ? '%' : '#'}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="text-xs border-collapse">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-30 [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:shadow-sm">
            <tr className="bg-muted">
              <th className="!z-40 left-0 whitespace-nowrap border-r border-border bg-muted px-3 py-2.5 text-left font-medium text-muted-foreground">
                {l('Когорта', 'Cohort', 'Kohorta')}
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                {l('Клиентов', 'Customers', 'Klienti')}
              </th>
              {offsets.map((o) => (
                <th key={o} className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[64px]">
                  М+{o}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortMonths.map((cohort) => {
              const row = matrix.get(cohort)
              const size = cohortSizes.get(cohort) ?? 0

              return (
                <tr key={cohort} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap sticky left-0 bg-card z-10 border-r border-border">
                    {monthLabel(cohort, locale)}
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground font-medium">
                    {size}
                  </td>
                  {offsets.map((offset) => {
                    const count = row?.get(offset) ?? 0
                    const p = size > 0 ? Math.round((count / size) * 100) : 0

                    // Don't show future months
                    const cohortDate = new Date(cohort + '-01')
                    const expectedDate = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + offset, 1)
                    const isFuture = expectedDate > new Date()

                    return (
                      <td
                        key={offset}
                        className={`px-3 py-2 text-center tabular-nums font-medium ${
                          isFuture ? 'text-gray-200 dark:text-gray-700' : retentionColor(p)
                        }`}
                      >
                        {isFuture ? '·' : showPct ? (count > 0 ? `${p}%` : '—') : (count > 0 ? count : '—')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: '60%+', cls: 'bg-emerald-600' },
          { label: '40–60%', cls: 'bg-emerald-400' },
          { label: '25–40%', cls: 'bg-emerald-200' },
          { label: '10–25%', cls: 'bg-emerald-100' },
          { label: '<10%', cls: 'bg-gray-50 border border-gray-200' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-muted-foreground">
            <span className={`inline-block h-3 w-3 rounded-sm ${l.cls}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}
