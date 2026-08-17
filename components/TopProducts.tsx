'use client'

import React, { useState } from 'react'
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
}: TopProductsProps): React.ReactElement {
  const { t, language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const [visibleCount, setVisibleCount] = useState(limit)
  const topItems = analytics.topProducts.slice(0, visibleCount)

  if (topItems.length === 0) {
    return (
      <Card className="p-6 bg-card border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('account.topProducts.title')}
        </h3>
        <p className="text-muted-foreground text-center py-8">
          {t('account.topProducts.noData')}
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-card border border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t('account.topProducts.titleWithIcon')}
      </h3>

      <div className="space-y-3">
        {topItems.map((product, index) => (
          <div
            key={product.productId}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-muted p-3"
          >
            <div className="pt-0.5 text-lg font-bold text-gray-400 dark:text-gray-500">
                #{index + 1}
            </div>
            <div className="min-w-0">
                <p className="whitespace-normal break-words text-sm font-medium leading-5 text-foreground">
                  {product.productTitle}
                </p>
                <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{product.quantity} {t('product.pieces')}</span>
                  <span className="font-semibold text-foreground">{formatEuro(product.revenue, locale)}</span>
                </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('account.topProducts.shownOfTotal', undefined, {
            shown: topItems.length,
            total: analytics.topProducts.length
          })}</span>
          {visibleCount < analytics.topProducts.length && (
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setVisibleCount((count) => count + 5)}
            >
              {language === 'ru' ? 'Показать ещё 5' : language === 'lv' ? 'Rādīt vēl 5' : 'Show 5 more'}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
