import React, { useState, useEffect, useMemo } from 'react'
import { Checkbox } from './ui/checkbox'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { isProductOnSale, type Product } from '../data/products'
import { useTranslation } from '@/lib/use-translation'
import { getCategoryProductIdsOverrideById } from '@/data/categories'
import { useCategoriesConfig } from '@/lib/use-categories-config'
import { useBrandsConfig } from '@/lib/use-brands-config'

const PURPOSE_KEYS: Record<string, { key: string; fallback: string }> = {
  'Для увлажнения': { key: 'product.purpose.moisturizing', fallback: 'For moisturizing' },
  'Для роста': { key: 'product.purpose.growth', fallback: 'For growth' },
  'Для омоложения': { key: 'product.purpose.rejuvenation', fallback: 'For rejuvenation' },
  'Для восстановления': { key: 'product.purpose.restoration', fallback: 'For restoration' },
  'Для питания': { key: 'product.purpose.nourishment', fallback: 'For nourishment' },
  'Для очищения': { key: 'product.purpose.cleansing', fallback: 'For cleansing' },
  'Для маскировки': { key: 'product.purpose.concealing', fallback: 'For concealing' },
  'Для сушки': { key: 'product.purpose.drying', fallback: 'For drying' },
  'Для блеска': { key: 'product.purpose.shine', fallback: 'For shine' },
  'Для обновления кожи': { key: 'product.purpose.skinRenewal', fallback: 'For skin renewal' },
  'Для глубокой чистки': { key: 'product.purpose.deepCleansing', fallback: 'For deep cleansing' },
  'Для смягчения': { key: 'product.purpose.softening', fallback: 'For softening' },
  'Восстановление ночью': { key: 'product.purpose.nightRecovery', fallback: 'Night recovery' },
  'Сильная фиксация': { key: 'product.purpose.strongHold', fallback: 'Strong hold' },
  'Матирование': { key: 'product.purpose.mattifying', fallback: 'Mattifying' }
}

const getPurposeLabel = (purpose: string, t: (key: string, defaultValue?: string) => string): string => {
  const entry = PURPOSE_KEYS[purpose]
  if (!entry) return purpose
  return t(entry.key)
}

const getBrandName = (brandId: string, brands: Array<{ id: string; name: string }>): string => {
  const brand = brands.find(b => b.id === brandId)
  return brand ? brand.name : brandId
}

type ProductFiltersState = {
  group: string
  onSale: boolean
  purposes: string[]
  brands: string[]
  minPrice: string
  maxPrice: string
  order: string
}

type ProductFilterProps = {
  onFilter: (filters: ProductFiltersState) => void
  initialFilters?: Partial<ProductFiltersState>
  products?: Product[]
}

export default function ProductFilter({ onFilter, initialFilters = {}, products }: ProductFilterProps) {
        const handlePurposeChange = (p: string) => {
          if (purposes.includes(p)) {
            onFilter({ group, onSale, purposes: purposes.filter(x => x !== p), brands, minPrice, maxPrice, order });
          } else {
            onFilter({ group, onSale, purposes: [...purposes, p], brands, minPrice, maxPrice, order });
          }
        };
      const handleBrandChange = (brandId: string) => {
        if (brands.includes(brandId)) {
          onFilter({ group, onSale, purposes, brands: brands.filter((id) => id !== brandId), minPrice, maxPrice, order });
          return
        }
        onFilter({ group, onSale, purposes, brands: [...brands, brandId], minPrice, maxPrice, order });
      }
      const handleReset = () => {
        onFilter({ group: '', onSale: false, purposes: [], brands: [], minPrice: '', maxPrice: '', order: '' });
      };
    const sourceProducts = products ?? [];
    const availableBrands = React.useMemo(() => {
      return Array.from(new Set(sourceProducts.map((product) => product.brand)));
    }, [sourceProducts]);
    const availablePurposes = React.useMemo(
      () => Array.from(new Set(sourceProducts.map((product) => product.purpose).filter(Boolean) as string[])),
      [sourceProducts]
    );
  const { t, language } = useTranslation();
  const { categories } = useCategoriesConfig()
  const { brands: configuredBrands } = useBrandsConfig()
  // Controlled filter values from props
  const group = initialFilters.group ?? '';
  const onSale = initialFilters.onSale ?? false;
  const purposes = initialFilters.purposes ?? [];
  const brands = initialFilters.brands ?? [];
  const minPrice = initialFilters.minPrice ?? '';
  const maxPrice = initialFilters.maxPrice ?? '';
  const order = initialFilters.order ?? '';

  // Use CATEGORY_CARDS for accurate translation of category name
  const getGroupLabel = (groupId: string): string => {
    if (!groupId) return '';
    const item = categories.find((entry) => entry.id === groupId)
    if (!item) return groupId
    return item.titleKey ? t(item.titleKey, item.labels[language]) : item.labels[language]
  }

  const matchesFilters = (product: Product, current: ProductFiltersState): boolean => {
    const categoryOverrideIds = current.group ? getCategoryProductIdsOverrideById(current.group) : null
    const matchCategory = !current.group
      || (categoryOverrideIds
        ? categoryOverrideIds.has(product.id)
        : product.category === current.group)
    const matchOnSale = !current.onSale || isProductOnSale(product)
    const matchPurpose = current.purposes.length === 0 || current.purposes.includes(product.purpose ?? '')
    const matchBrand = current.brands.length === 0 || current.brands.includes(product.brand)
    const minValue = current.minPrice ? Number(current.minPrice) : null
    const maxValue = current.maxPrice ? Number(current.maxPrice) : null
    const matchMinPrice = minValue === null || product.price >= minValue
    const matchMaxPrice = maxValue === null || product.price <= maxValue

    return matchCategory && matchOnSale && matchPurpose && matchBrand && matchMinPrice && matchMaxPrice
  }

  const getCountByFilters = (override: Partial<ProductFiltersState>): number => {
    const nextFilters: ProductFiltersState = {
      group: Object.prototype.hasOwnProperty.call(override, 'group') ? (override.group ?? '') : group,
      onSale: Object.prototype.hasOwnProperty.call(override, 'onSale') ? (override.onSale ?? false) : onSale,
      purposes: Object.prototype.hasOwnProperty.call(override, 'purposes') ? (override.purposes ?? []) : purposes,
      brands: Object.prototype.hasOwnProperty.call(override, 'brands') ? (override.brands ?? []) : brands,
      minPrice: Object.prototype.hasOwnProperty.call(override, 'minPrice') ? (override.minPrice ?? '') : minPrice,
      maxPrice: Object.prototype.hasOwnProperty.call(override, 'maxPrice') ? (override.maxPrice ?? '') : maxPrice,
      order: Object.prototype.hasOwnProperty.call(override, 'order') ? (override.order ?? '') : order
    }

    return sourceProducts.filter((product) => matchesFilters(product, nextFilters)).length
  }

  const activeFilters: Array<{ id: string; label: string; onRemove: () => void }> = [];
  if (group) {
    activeFilters.push({
      id: 'group',
      label: getGroupLabel(group),
      onRemove: () => onFilter({ group: '', onSale, purposes, brands, minPrice, maxPrice, order })
    });
  }
  if (onSale) {
    activeFilters.push({
      id: 'onSale',
      label: t('categories.onSale'),
      onRemove: () => onFilter({ group, onSale: false, purposes, brands, minPrice, maxPrice, order })
    });
  }
  purposes.forEach((purpose) => {
    activeFilters.push({
      id: `purpose-${purpose}`,
      label: `${t('product.purpose')}: ${getPurposeLabel(purpose, t)}`,
      onRemove: () => onFilter({ group, onSale, purposes: purposes.filter((value) => value !== purpose), brands, minPrice, maxPrice, order })
    });
  });
  brands.forEach((brandId) => {
    activeFilters.push({
      id: `brand-${brandId}`,
      label: `${t('product.brand')}: ${getBrandName(brandId, configuredBrands)}`,
      onRemove: () => onFilter({ group, onSale, purposes, brands: brands.filter((id) => id !== brandId), minPrice, maxPrice, order })
    });
  });
  if (minPrice || maxPrice) {
    const priceLabel = minPrice && maxPrice
      ? `€${Number(minPrice).toLocaleString()} – €${Number(maxPrice).toLocaleString()}`
      : minPrice
        ? `${t('catalog.filters.from')} €${Number(minPrice).toLocaleString()}`
        : `${t('catalog.filters.to')} €${Number(maxPrice).toLocaleString()}`;
    activeFilters.push({
      id: 'price',
      label: `${t('product.price')}: ${priceLabel}`,
      onRemove: () => onFilter({ group, onSale, purposes, brands, minPrice: '', maxPrice: '', order })
    });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow p-4 mb-6 space-y-4">
      <div>
        <label className="block text-sm mb-1 text-gray-900 dark:text-gray-100">{t('catalog.filters.orderBy', 'Упорядочить по')}</label>
        <Select value={order || 'default'} onValueChange={(value) => onFilter({ group, onSale, purposes, brands, minPrice, maxPrice, order: value === 'default' ? '' : value })}>
          <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700">
            <SelectValue placeholder={t('catalog.filters.orderBy.default', 'По умолчанию')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t('catalog.filters.orderBy.default', 'По умолчанию')}</SelectItem>
            <SelectItem value="price-asc">{t('catalog.filters.orderBy.priceAsc', 'Сначала дешёвые')}</SelectItem>
            <SelectItem value="price-desc">{t('catalog.filters.orderBy.priceDesc', 'Сначала дорогие')}</SelectItem>
            <SelectItem value="name-asc">{t('catalog.filters.orderBy.nameAsc', 'По названию A-Я')}</SelectItem>
            <SelectItem value="name-desc">{t('catalog.filters.orderBy.nameDesc', 'По названию Я-A')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-900 dark:text-gray-100">{t('categories.title')}</label>
        <Select value={group || 'all'} onValueChange={(value) => onFilter({ group: value === 'all' ? '' : value, onSale, purposes, brands, minPrice, maxPrice, order })}>
          <SelectTrigger className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700">
            <SelectValue placeholder={`${t('common.viewAll')} (${getCountByFilters({ group: '' })})`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.viewAll')} ({getCountByFilters({ group: '' })})</SelectItem>
            {categories.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.titleKey ? t(g.titleKey, g.labels[language]) : g.labels[language]} ({getCountByFilters({ group: g.id })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Checkbox
          className="w-full"
          label={`${t('categories.onSale')} (${getCountByFilters({ onSale: true })})`}
          checked={onSale}
          onCheckedChange={(checked) => onFilter({ group, onSale: checked, purposes, brands, minPrice, maxPrice, order })}
        />
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-900 dark:text-gray-100">{t('product.purpose')}</label>
        <div className="flex flex-col gap-2">
          {availablePurposes.map(p => (
            <Checkbox
              key={p}
              className="w-full"
              label={`${getPurposeLabel(p, t)} (${getCountByFilters({ purposes: purposes.includes(p) ? purposes : [...purposes, p] })})`}
              checked={purposes.includes(p)}
              onCheckedChange={() => handlePurposeChange(p)}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-900 dark:text-gray-100">{t('product.brand')}</label>
        <div className="flex flex-col gap-2">
          {availableBrands.map((brandId) => {
            const brandCount = getCountByFilters({ brands: [brandId] })

            return (
              <Checkbox
                key={brandId}
                className="w-full"
                label={`${getBrandName(brandId, configuredBrands)} (${brandCount})`}
                checked={brands.includes(brandId)}
                onCheckedChange={() => handleBrandChange(brandId)}
              />
            )
          })}
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1 text-gray-900 dark:text-gray-100">{t('product.price')}</label>
        <div className="flex gap-2">
          <Input type="number" className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" placeholder={t('common.min')} value={minPrice} onChange={e => onFilter({ group, onSale, purposes, brands, minPrice: e.target.value, maxPrice, order })} />
          <Input type="number" className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700" placeholder={t('common.max')} value={maxPrice} onChange={e => onFilter({ group, onSale, purposes, brands, minPrice, maxPrice: e.target.value, order })} />
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('catalog.filters.selected', 'Выбранные фильтры')}
          </p>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <Badge key={filter.id} variant="outline" className="gap-1 pr-1 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700">
                <span>{filter.label}</span>
                <button
                  type="button"
                  onClick={filter.onRemove}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
                  aria-label={`${t('catalog.filters.remove')} ${filter.label}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
      <button 
        type="button" 
        onClick={handleReset}
        className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 rounded px-4 py-2 transition-colors border border-gray-300 dark:border-gray-700"
      >
        {t('common.reset')}
      </button>
    </div>
  )
}
