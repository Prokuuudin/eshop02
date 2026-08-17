'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { PurchaseAnalytics } from '@/lib/analytics-service'

interface OrderHistoryProps {
  analytics: PurchaseAnalytics
}

export default function OrderHistory({
  analytics
}: OrderHistoryProps): React.ReactElement {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const monthlyData = analytics.ordersByMonth

  if (monthlyData.length === 0) {
    return (
      <Card className="p-6 bg-card border border-border col-span-2">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('account.orderHistory.title')}
        </h3>
        <p className="text-muted-foreground text-center py-8">
          {t('account.orderHistory.noData')}
        </p>
      </Card>
    )
  }

  const visibleMonths = monthlyData.slice(-12)
  const maxRevenue = Math.max(...visibleMonths.map(m => m.revenue))

  return (
    <Card className="p-6 bg-card border border-border col-span-2">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t('account.orderHistory.titleWithIcon')}
      </h3>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2" aria-label={t('account.orderHistory.title')}>
        <div className="flex h-52 flex-col justify-between pb-7 text-right text-[10px] text-muted-foreground">
          <span>{formatEuro(maxRevenue, locale)}</span>
          <span>{formatEuro(maxRevenue / 2, locale)}</span>
          <span>{formatEuro(0, locale)}</span>
        </div>

        <div className="relative h-52 min-w-0">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <div className="pointer-events-none absolute inset-x-0 top-[43%] border-t border-dashed border-border" />
          <div className="pointer-events-none absolute inset-x-0 bottom-7 border-t border-border" />

          <div className="absolute inset-x-0 bottom-0 top-0 grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(0, 1fr))` }}>
            {visibleMonths.map((month) => {
              const percentage = maxRevenue > 0 ? (month.revenue / maxRevenue) * 100 : 0
              const tooltip = t('account.orderHistory.barTitle', undefined, {
                month: month.month,
                count: month.count,
                revenue: formatEuro(month.revenue, locale)
              })

              return (
                <div key={month.month} className="flex h-full min-w-0 flex-col justify-end" title={tooltip}>
                  <div className="flex h-[calc(100%-1.75rem)] items-end justify-center">
                    <div
                      className="w-full max-w-8 min-h-1 rounded-t bg-emerald-500 transition-colors hover:bg-emerald-400"
                      style={{ height: `${percentage}%` }}
                      role="img"
                      aria-label={tooltip}
                    />
                  </div>
                  <span className="h-7 truncate pt-1 text-center text-[9px] capitalize text-muted-foreground sm:text-[10px]">
                    {month.shortMonth}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-border">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('account.orderHistory.totalMonths')}</p>
            <p className="text-lg font-bold text-foreground">{monthlyData.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('account.orderHistory.averageOrdersPerMonth')}</p>
            <p className="text-lg font-bold text-foreground">
              {(analytics.totalOrders / monthlyData.length).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('account.orderHistory.maxPerMonth')}</p>
            <p className="text-lg font-bold text-foreground">
              {formatEuro(maxRevenue, locale)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
