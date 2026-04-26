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
}: OrderHistoryProps) {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const monthlyData = analytics.ordersByMonth

  if (monthlyData.length === 0) {
    return (
      <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 col-span-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {t('account.orderHistory.title')}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {t('account.orderHistory.noData')}
        </p>
      </Card>
    )
  }

  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue))

  return (
    <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 col-span-2">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        {t('account.orderHistory.titleWithIcon')}
      </h3>

      <div className="overflow-x-auto">
        <div className="min-w-max flex items-end gap-2 pb-4" style={{ minHeight: '200px' }}>
          {monthlyData.map((month, idx) => {
            const percentage = (month.revenue / maxRevenue) * 100
            return (
              <div
                key={idx}
                className="flex-1 min-w-[40px] flex flex-col items-center"
                title={t('account.orderHistory.barTitle', undefined, {
                  month: month.month,
                  count: month.count,
                  revenue: formatEuro(month.revenue, locale)
                })}
              >
                <div className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t hover:opacity-80 transition-opacity cursor-pointer" style={{ height: `${percentage}%` }} />
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center whitespace-nowrap transform -rotate-45 origin-left" style={{ width: '80px', transformOrigin: 'left', marginLeft: '-30px' }}>
                  {month.month.split(' ')[0]}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('account.orderHistory.totalMonths')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{monthlyData.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('account.orderHistory.averageOrdersPerMonth')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {(analytics.totalOrders / monthlyData.length).toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t('account.orderHistory.maxPerMonth')}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatEuro(maxRevenue, locale)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
