'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VariantGroup, SelectedVariant } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'

type ProductVariantSelectorProps = {
  groups: VariantGroup[]
  selected: SelectedVariant[]
  onChange: (next: SelectedVariant[]) => void
}

export function ProductVariantSelector({ groups, selected, onChange }: ProductVariantSelectorProps) {
  const { t } = useTranslation()

  const handleSelect = (group: VariantGroup, value: string) => {
    const option = group.options.find((o) => o.value === value)
    const next = selected.filter((s) => s.groupName !== group.name)
    next.push({ groupName: group.name, value, priceAdjustment: option?.priceAdjustment })
    onChange(next)
  }

  return (
    <div className="product-variant-selector flex flex-col gap-3 my-3">
      {groups.map((group) => {
        const currentValue = selected.find((s) => s.groupName === group.name)?.value
        return (
          <div key={group.name} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              {group.name}
              {group.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            <Select value={currentValue} onValueChange={(value) => handleSelect(group, value)}>
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
