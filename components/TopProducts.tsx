'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { PurchaseAnalytics } from '@/lib/analytics-service'

interface TopProductsProps {
  analytics: PurchaseAnalytics
  limit?: number
}

export default function TopProducts({
  analytics,
  limit = 5
}: TopProductsProps) {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const topItems = analytics.topProducts.slice(0, limit)

  if (topItems.length === 0) {
    return (
      <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {t('account.topProducts.title')}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {t('account.topProducts.noData')}
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        {t('account.topProducts.titleWithIcon')}
      </h3>

      <div className="space-y-3">
        {topItems.map((product, index) => (
          <div
            key={product.productId}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="text-lg font-bold text-gray-400 dark:text-gray-500 w-6">
                #{index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {product.productTitle}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {product.quantity} {t('product.pieces')}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {formatEuro(product.revenue, locale)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        {t('account.topProducts.shownOfTotal', undefined, {
          shown: Math.min(limit, topItems.length),
          total: analytics.topProducts.length
        })}
      </div>
    </Card>
  )
}
