'use client'

import React from 'react'
import { Product } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils'

type BulkPricingProps = {
  product: Product
}

export default function BulkPricing({ product }: BulkPricingProps) {
  const { language } = useTranslation()
  const locale = getLocaleFromLanguage(language)
  const formatPrice = (value: number): string => formatEuro(value, locale)

  if (!product.bulkPricingTiers || product.bulkPricingTiers.length === 0) {
    return null
  }

  // Add base price as first tier
  const tiers = [
    { quantity: 1, pricePerUnit: product.price },
    ...product.bulkPricingTiers
  ]

  return (
    <div className="rounded-lg border border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Скидки за объём</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-3 text-muted-foreground font-semibold">Количество</th>
              <th className="text-right py-3 px-3 text-muted-foreground font-semibold">Цена за единицу</th>
              <th className="text-right py-3 px-3 text-muted-foreground font-semibold">Экономия</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => {
              const savings = tier.quantity > 1 ? (product.price - tier.pricePerUnit) * tier.quantity : 0
              const savingsPercent = ((product.price - tier.pricePerUnit) / product.price * 100).toFixed(1)
              
              return (
                <tr 
                  key={idx} 
                  className={`border-b border-border last:border-0 ${
                    idx === 0 ? 'bg-muted/50' : ''
                  }`}
                >
                  <td className="py-3 px-3 text-foreground">
                    {tier.quantity === 1 ? 'От 1 шт' : `От ${tier.quantity} шт`}
                  </td>
                  <td className="text-right py-3 px-3 text-foreground font-semibold">
                    {formatPrice(tier.pricePerUnit)}
                  </td>
                  <td className="text-right py-3 px-3">
                    {savings > 0 && (
                      <div>
                        <p className="text-green-600 dark:text-green-400 font-semibold">
                          {formatPrice(savings)}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          -{savingsPercent}%
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        💡 Скидки применяются автоматически при добавлении товара в корзину
      </p>
    </div>
  )
}
