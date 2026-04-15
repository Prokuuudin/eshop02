'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { PurchaseAnalytics } from '@/lib/analytics-service'

interface TopCategoriesProps {
  analytics: PurchaseAnalytics
  limit?: number
}

export default function TopCategories({
  analytics,
  limit = 5
}: TopCategoriesProps) {
  const { language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const topItems = analytics.topCategories.slice(0, limit)

  if (topItems.length === 0) {
    return (
      <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Категории
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          Нет данных о покупках
        </p>
      </Card>
    )
  }

  const maxRevenue = topItems[0]?.revenue || 1
  const categories = analytics.topCategories

  return (
    <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        📊 Топ категории
      </h3>

      <div className="space-y-4">
        {topItems.map((cat) => {
          const percentage = (cat.revenue / maxRevenue) * 100
          const categoryTotal = categories.reduce((sum, c) => sum + c.revenue, 0)
          const categoryShare = (cat.revenue / categoryTotal) * 100

          return (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {cat.category}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {categoryShare.toFixed(1)}%
                </p>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {cat.quantity} шт. · {formatEuro(cat.revenue, locale)}
              </p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        {Math.min(limit, topItems.length)} из {categories.length} категорий
      </div>
    </Card>
  )
}
