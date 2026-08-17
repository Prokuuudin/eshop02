'use client'

import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus } from 'lucide-react'
import type { Order } from '@/lib/orders-store'
import { getPeriodComparison, type AnalyticsPeriod } from '@/lib/analytics-service'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

export default function PeriodComparison({ orders }: { orders: Order[] }): React.ReactElement {
  const { language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const comparison = useMemo(() => getPeriodComparison(orders, period), [orders, period])
  const l = (ru: string, en: string, lv: string): string => language === 'ru' ? ru : language === 'lv' ? lv : en

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" />
            {l('Сравнение периодов', 'Period comparison', 'Periodu salīdzinājums')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {l('Текущий период относительно предыдущего', 'Current period compared with the previous one', 'Pašreizējais periods salīdzinājumā ar iepriekšējo')}
          </p>
        </div>
        <div className="grid grid-cols-3 rounded-lg bg-muted p-1" aria-label={l('Выбор периода', 'Select period', 'Perioda izvēle')}>
          {(['month', 'quarter', 'year'] as AnalyticsPeriod[]).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={period === item}
              onClick={() => setPeriod(item)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${period === item ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item === 'month' ? l('Месяц', 'Month', 'Mēnesis') : item === 'quarter' ? l('Квартал', 'Quarter', 'Ceturksnis') : l('Год', 'Year', 'Gads')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ComparisonCard
          label={l('Расходы', 'Spending', 'Izdevumi')}
          current={formatEuro(comparison.currentSpent, locale)}
          previous={formatEuro(comparison.previousSpent, locale)}
          change={comparison.spentChangePercent}
          previousLabel={l('В предыдущем периоде', 'Previous period', 'Iepriekšējā periodā')}
        />
        <ComparisonCard
          label={l('Количество заказов', 'Number of orders', 'Pasūtījumu skaits')}
          current={String(comparison.currentOrders)}
          previous={String(comparison.previousOrders)}
          change={comparison.ordersChangePercent}
          previousLabel={l('В предыдущем периоде', 'Previous period', 'Iepriekšējā periodā')}
        />
      </div>
    </section>
  )
}

function ComparisonCard({ label, current, previous, change, previousLabel }: {
  label: string
  current: string
  previous: string
  change: number | null
  previousLabel: string
}): React.ReactElement {
  const positive = change !== null && change > 0
  const negative = change !== null && change < 0
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus

  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <p className="text-2xl font-bold text-foreground">{current}</p>
        {change !== null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${positive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : negative ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-background text-muted-foreground'}`}>
            <Icon className="h-3.5 w-3.5" />
            {`${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{previousLabel}: <span className="font-medium text-foreground">{previous}</span></p>
    </div>
  )
}
