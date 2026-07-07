'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VariantGroup, VariantOption, SelectedVariant } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'
import { formatEuro } from '@/lib/utils'

type ProductVariantSelectorProps = {
  groups: VariantGroup[]
  selected: SelectedVariant[]
  onChange: (next: SelectedVariant[]) => void
}

function PriceAdjustmentLabel({ adjustment, locale }: { adjustment?: number; locale: string }) {
  if (!adjustment) return null
  const sign = adjustment > 0 ? '+' : '−'
  return (
    <span className={`text-xs whitespace-nowrap ${adjustment > 0 ? 'text-muted-foreground' : 'text-green-700 dark:text-green-400'}`}>
      {sign}{formatEuro(Math.abs(adjustment), locale)}
    </span>
  )
}

function ImageSquaresGroup({
  group,
  currentValue,
  locale,
  onSelect,
}: {
  group: VariantGroup
  currentValue?: string
  locale: string
  onSelect: (option: VariantOption) => void
}) {
  return (
    <div className="product-variant-selector__squares flex flex-wrap gap-2" role="radiogroup" aria-label={group.name}>
      {group.options.map((option) => {
        const isSelected = option.value === currentValue
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            title={option.value}
            onClick={() => onSelect(option)}
            className={`product-variant-selector__square flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-colors ${
              isSelected
                ? 'border-primary ring-2 ring-primary bg-primary/5'
                : 'border-border bg-card hover:border-primary/50'
            }`}
          >
            {option.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={option.image}
                alt={option.value}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                className="w-14 h-14 object-contain rounded"
              />
            ) : (
              <span className="w-14 h-14 flex items-center justify-center text-xs text-muted-foreground">
                {option.value}
              </span>
            )}
            <span className="text-xs font-medium text-foreground max-w-16 truncate">{option.value}</span>
            <PriceAdjustmentLabel adjustment={option.priceAdjustment} locale={locale} />
          </button>
        )
      })}
    </div>
  )
}

export function ProductVariantSelector({ groups, selected, onChange }: ProductVariantSelectorProps): React.JSX.Element {
  const { t, language } = useTranslation()
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const handleSelect = (group: VariantGroup, option: VariantOption | undefined, value: string) => {
    const next = selected.filter((s) => s.groupName !== group.name)
    next.push({ groupName: group.name, value, priceAdjustment: option?.priceAdjustment })
    onChange(next)
  }

  return (
    <div className="product-variant-selector flex flex-col gap-3 my-3">
      {groups.map((group) => {
        const currentValue = selected.find((s) => s.groupName === group.name)?.value
        const asSquares = group.displayType === 'imageSquares'
        return (
          <div key={group.name} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              {group.name}
              {group.required && <span className="text-red-600 ml-1">*</span>}
              {asSquares && currentValue && (
                <span className="ml-2 text-muted-foreground font-normal">{currentValue}</span>
              )}
            </label>
            {asSquares ? (
              <ImageSquaresGroup
                group={group}
                currentValue={currentValue}
                locale={locale}
                onSelect={(option) => handleSelect(group, option, option.value)}
              />
            ) : (
              <Select
                value={currentValue}
                onValueChange={(value) =>
                  handleSelect(group, group.options.find((o) => o.value === value), value)
                }
              >
                <SelectTrigger className="w-full bg-card border-border text-foreground">
                  <SelectValue placeholder={t('product.selectVariantRequired')} />
                </SelectTrigger>
                <SelectContent>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        {option.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={option.image}
                            alt=""
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                            className="w-6 h-6 object-contain rounded shrink-0"
                          />
                        )}
                        <span>{option.value}</span>
                        <PriceAdjustmentLabel adjustment={option.priceAdjustment} locale={locale} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      })}
    </div>
  )
}
