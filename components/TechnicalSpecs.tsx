'use client'

import React from 'react'
import { Product } from '@/data/products'
import { isIngredientKey } from '@/lib/product-ingredients'

type TechnicalSpecsProps = {
  product: Product
}

export default function TechnicalSpecs({ product }: TechnicalSpecsProps) {
  // __-prefixed keys are internal (e.g. __variantGroupsJson holds raw JSON for the
  // color/size picker) — not meant for display in this key:value list.
  // Ingredient keys are shown in the "Состав" tab of ProductDescription instead.
  const specs = Object.entries(product.technicalSpecs ?? {}).filter(
    ([key]) => !key.startsWith('__') && !isIngredientKey(key)
  )
  if (specs.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Технические характеристики</h3>

      <div className="space-y-3">
        {specs.map(([key, value]) => (
          <div key={key} className="flex justify-between items-start gap-4 pb-3 border-b border-border last:border-0">
            <span className="text-sm text-muted-foreground font-medium">{key}</span>
            <span className="text-sm text-foreground text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* SKU if available */}
      {product.sku && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Артикул</p>
          <p className="font-mono text-sm text-foreground">{product.sku}</p>
        </div>
      )}
    </div>
  )
}
