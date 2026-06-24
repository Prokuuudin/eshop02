'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/use-translation'
import type { VariantGroup, SelectedVariant } from '@/data/products'

interface ProductVariantSelectorProps {
  groups: VariantGroup[]
  selected: SelectedVariant[]
  onChange: (next: SelectedVariant[]) => void
}

export const ProductVariantSelector: React.FC<ProductVariantSelectorProps> = ({
  groups,
  selected,
  onChange,
}) => {
  const { t } = useTranslation()

  const handleSelect = (group: VariantGroup, value: string): void => {
    const option = group.options.find((o) => o.value === value)
    const next = selected.filter((s) => s.groupName !== group.name)
    next.push({ groupName: group.name, value, priceAdjustment: option?.priceAdjustment })
    onChange(next)
  }

  return (
    <div className="product-detail__variants mt-4 space-y-3">
      {groups.map((group) => {
        const current = selected.find((s) => s.groupName === group.name)
        return (
          <div key={group.name}>
            <label className="block text-sm font-medium mb-1 text-foreground">
              {group.name}
              {group.required && <span className="text-red-500"> *</span>}
            </label>
            <Select value={current?.value ?? ''} onValueChange={(value) => handleSelect(group, value)}>
              <SelectTrigger className="w-full bg-card border-border text-foreground">
                <SelectValue placeholder={t('product.selectVariantRequired')} />
              </SelectTrigger>
              <SelectContent>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
    </div>
  )
}
