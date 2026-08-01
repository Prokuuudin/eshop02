import { useMemo, useState } from 'react'
import { useOrders } from '@/lib/orders-store'
import { monthDiff, monthLabel, retentionColor, toMonthKey, Empty } from './analytics-shared'
import type { ReactElement } from 'react'

export default function CohortSection(): ReactElement {
  const orders = useOrders((s) => s.orders)
  const [showPct, setShowPct] = useState(true)

  const { cohortMonths, matrix, cohortSizes, maxOffset } = useMemo(() => {
    if (orders.length === 0) return { cohortMonths: [], matrix: new Map(), cohortSizes: new Map(), maxOffset: 0 }

    // Find each customer's first purchase month
    const firstMonth = new Map<string, string>()
    orders.forEach((o) => {
      if (!o.email) return
      const mk = toMonthKey(o.createdAt)
      const existing = firstMonth.get(o.email)
      if (!existing || mk < existing) firstMonth.set(o.email, mk)
    })

    // Build matrix: cohortMonth → offset → Set<email>
    const mat = new Map<string, Map<number, Set<string>>>()
    orders.forEach((o) => {
      if (!o.email) return
      const cohort = firstMonth.get(o.email)
      if (!cohort) return
      const offset = monthDiff(cohort, toMonthKey(o.createdAt))
      if (offset < 0) return

      if (!mat.has(cohort)) mat.set(cohort, new Map())
      const row = mat.get(cohort)!
      if (!row.has(offset)) row.set(offset, new Set())
      row.get(offset)!.add(o.email)
    })

    // Cohort sizes (= size of offset 0)
    const sizes = new Map<string, number>()
    firstMonth.forEach((cohort) => {
      sizes.set(cohort, (sizes.get(cohort) ?? 0) + 1)
    })

    const sortedCohorts = Array.from(mat.keys()).sort()
    let max = 0
    mat.forEach((row) => {
      row.forEach((_, offset) => { if (offset > max) max = offset })
    })

    return {
      cohortMonths: sortedCohorts,
      matrix: mat,
      cohortSizes: sizes,
      maxOffset: Math.min(max, 11),
    }
  }, [orders])

  if (orders.length === 0) {
    return <Empty text="Нет данных о заказах." />
  }
  if (cohortMonths.length === 0) {
    return <Empty text="Недостаточно данных для когортного анализа." />
  }

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Строки — месяц первой покупки когорты. Столбцы — месяцев с момента первой покупки.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            М+0 = месяц первой покупки, М+1 = следующий месяц и т.д.
          </p>
        </div>
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

      <div className="overflow-auto rounded-xl border border-border">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-muted">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted z-10 border-r border-border">
                Когорта
              </th>
              <th className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-nowrap">
                Клиентов
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
                <tr key={cohort} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap sticky left-0 bg-card z-10 border-r border-border">
                    {monthLabel(cohort)}
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground font-medium">
                    {size}
                  </td>
                  {offsets.map((offset) => {
                    const count = row?.get(offset)?.size ?? 0
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
