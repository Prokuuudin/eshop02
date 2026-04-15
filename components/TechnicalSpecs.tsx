'use client'

import React from 'react'
import { Product } from '@/data/products'

type TechnicalSpecsProps = {
  product: Product
}

export default function TechnicalSpecs({ product }: TechnicalSpecsProps) {
  if (!product.technicalSpecs || Object.keys(product.technicalSpecs).length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Технические характеристики</h3>
      
      <div className="space-y-3">
        {Object.entries(product.technicalSpecs).map(([key, value]) => (
          <div key={key} className="flex justify-between items-start gap-4 pb-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{key}</span>
            <span className="text-sm text-gray-900 dark:text-gray-100 text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* SKU if available */}
      {product.sku && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">Артикул</p>
          <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{product.sku}</p>
        </div>
      )}
    </div>
  )
}
