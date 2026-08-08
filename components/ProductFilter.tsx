import React from 'react'
import { ChevronDown } from 'lucide-react'
import { Checkbox } from './ui/checkbox'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from './ui/dropdown-menu'
import { isProductOnSale, type Product } from '../data/products'
import { useTranslation } from '@/lib/use-translation'
import { useCategoriesConfig } from '@/lib/use-categories-config'
import { useBrandsConfig } from '@/lib/use-brands-config'
import { brandSlug } from '@/lib/brand-slug'
import type { CatalogFacets } from '@/lib/initial-catalog-products'

const getBrandName = (brandId: string, brands: Array<{ id: string; name: string }>): string => {
  const brand = brands.find(b => b.id === brandId)
  return brand ? brand.name : brandId
}

type ProductFiltersState = {
  group: string
  subcat: string
  onSale: boolean
  brands: string[]
  minPrice: string
  maxPrice: string
  order: string
}

type ProductFilterProps = {
  onFilter: (filters: ProductFiltersState) => void
  initialFilters?: Partial<ProductFiltersState>
  products?: Product[]
  facets?: CatalogFacets
}

export default function ProductFilter({ onFilter, initialFilters = {}, products, facets }: ProductFilterProps): React.ReactElement {
      const handleBrandChange = (brandId: string) => {
        if (brands.includes(brandId)) {
          onFilter({ group, subcat, onSale, brands: brands.filter((id) => id !== brandId), minPrice, maxPrice, order });
          return
        }
        onFilter({ group, subcat, onSale, brands: [...brands, brandId], minPrice, maxPrice, order });
      }
      const handleReset = () => {
        onFilter({ group: '', subcat: '', onSale: false, brands: [], minPrice: '', maxPrice: '', order: '' });
      };
    const sourceProducts = React.useMemo(() => products ?? [], [products]);
    const priceRange = React.useMemo(() => {
      const prices = sourceProducts.map(p => p.price).filter(p => p > 0);
      if (!prices.length) return { min: 0, max: 0 };
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [sourceProducts]);
  const { t, language } = useTranslation();
  const { categories } = useCategoriesConfig()
  const { brands: configuredBrands } = useBrandsConfig()
  const availableBrands = React.useMemo(() => {
    // Without server facets, fall back to brands seen in the currently loaded
    // products (correct only when the full matching set is already local,
    // e.g. non-paginated pages).
    const ids = facets ? [...facets.availableBrands] : Array.from(new Set(sourceProducts.map((product) => brandSlug(product.brand))));
    return ids.sort((a, b) => getBrandName(a, configuredBrands).localeCompare(getBrandName(b, configuredBrands), language));
  }, [facets, sourceProducts, configuredBrands, language]);
  // Controlled filter values from props
  const group = initialFilters.group ?? '';
  const subcat = initialFilters.subcat ?? '';
  const onSale = initialFilters.onSale ?? false;
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

  // Сабкатегории текущей категории (конфиг с сервера уже без пустых)
  const groupSubcategories = (() => {
    if (!group) return []
    return categories.find((entry) => entry.id === group)?.subcategories ?? []
  })()

  const getSubcatLabel = (slug: string): string => {
    if (!slug) return ''
    const item = groupSubcategories.find((entry) => entry.slug === slug)
      ?? categories.flatMap((entry) => entry.subcategories).find((entry) => entry.slug === slug)
    if (!item) return slug
    return item.key ? t(item.key, item.labels[language]) : item.labels[language]
  }

  const matchesFilters = (product: Product, current: ProductFiltersState): boolean => {
    // Price fields are stripped from the payload for guests (see
    // redactProductPrices) — product.price is undefined for them at runtime
    // even though the type says number. Trust server-side filtering instead
    // of excluding the product from counts/results.
    const priceHidden = product.price === undefined
    const matchCategory = !current.group || product.category === current.group
    const matchSubcat = !current.subcat || product.subcategory === current.subcat
    const matchOnSale = !current.onSale || priceHidden || isProductOnSale(product)
    const matchBrand = current.brands.length === 0 || current.brands.includes(brandSlug(product.brand))
    const minValue = current.minPrice ? Number(current.minPrice) : null
    const maxValue = current.maxPrice ? Number(current.maxPrice) : null
    const matchMinPrice = minValue === null || priceHidden || product.price >= minValue
    const matchMaxPrice = maxValue === null || priceHidden || product.price <= maxValue

    return matchCategory && matchSubcat && matchOnSale && matchBrand && matchMinPrice && matchMaxPrice
  }

  const getCountByFilters = (override: Partial<ProductFiltersState>): number => {
    const nextFilters: ProductFiltersState = {
      group: Object.prototype.hasOwnProperty.call(override, 'group') ? (override.group ?? '') : group,
      subcat: Object.prototype.hasOwnProperty.call(override, 'subcat') ? (override.subcat ?? '') : subcat,
      onSale: Object.prototype.hasOwnProperty.call(override, 'onSale') ? (override.onSale ?? false) : onSale,
      brands: Object.prototype.hasOwnProperty.call(override, 'brands') ? (override.brands ?? []) : brands,
      minPrice: Object.prototype.hasOwnProperty.call(override, 'minPrice') ? (override.minPrice ?? '') : minPrice,
      maxPrice: Object.prototype.hasOwnProperty.call(override, 'maxPrice') ? (override.maxPrice ?? '') : maxPrice,
      order: Object.prototype.hasOwnProperty.call(override, 'order') ? (override.order ?? '') : order
    }

    return sourceProducts.filter((product) => matchesFilters(product, nextFilters)).length
  }

  // Prefer server-computed facet counts (whole matching catalog) when available;
  // fall back to the local product-array count otherwise (non-paginated pages
  // where the full matching set is already loaded client-side).
  const groupCount = (id: string): number =>
    facets ? (facets.groupCounts[id] ?? 0) : getCountByFilters({ group: id, subcat: '' })
  const subcatCount = (slug: string): number =>
    facets ? (facets.subcatCounts[slug] ?? 0) : getCountByFilters({ subcat: slug })
  const onSaleCount = (): number => (facets ? facets.onSaleCount : getCountByFilters({ onSale: true }))
  const brandCount = (brandId: string, nextBrands: string[]): number =>
    facets ? (facets.brandCounts[brandId] ?? 0) : getCountByFilters({ brands: nextBrands })

  const activeFilters: Array<{ id: string; label: string; onRemove: () => void }> = [];
  if (group) {
    activeFilters.push({
      id: 'group',
      label: getGroupLabel(group),
      onRemove: () => onFilter({ group: '', subcat: '', onSale, brands, minPrice, maxPrice, order })
    });
  }
  if (subcat) {
    activeFilters.push({
      id: 'subcat',
      label: getSubcatLabel(subcat),
      onRemove: () => onFilter({ group, subcat: '', onSale, brands, minPrice, maxPrice, order })
    });
  }
  if (onSale) {
    activeFilters.push({
      id: 'onSale',
      label: t('categories.onSale'),
      onRemove: () => onFilter({ group, subcat, onSale: false, brands, minPrice, maxPrice, order })
    });
  }
  brands.forEach((brandId) => {
    activeFilters.push({
      id: `brand-${brandId}`,
      label: `${t('product.brand')}: ${getBrandName(brandId, configuredBrands)}`,
      onRemove: () => onFilter({ group, subcat, onSale, brands: brands.filter((id) => id !== brandId), minPrice, maxPrice, order })
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
      onRemove: () => onFilter({ group, subcat, onSale, brands, minPrice: '', maxPrice: '', order })
    });
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow p-4 mb-6 space-y-4">
      <div>
        <label className="block text-sm mb-1 text-foreground">{t('catalog.filters.orderBy', 'Упорядочить по')}</label>
        <Select value={order || 'default'} onValueChange={(value) => onFilter({ group, subcat, onSale, brands, minPrice, maxPrice, order: value === 'default' ? '' : value })}>
          <SelectTrigger className="w-full bg-card text-foreground border-border">
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
        <label className="block text-sm mb-1 text-foreground">{t('categories.title')}</label>
        <Select value={group || 'all'} onValueChange={(value) => onFilter({ group: value === 'all' ? '' : value, subcat: '', onSale, brands, minPrice, maxPrice, order })}>
          <SelectTrigger className="w-full bg-card text-foreground border-border">
            <SelectValue placeholder={`${t('common.viewAll')} (${groupCount('')})`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.viewAll')} ({groupCount('')})</SelectItem>
            {categories.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.titleKey ? t(g.titleKey, g.labels[language]) : g.labels[language]} ({groupCount(g.id)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {group && groupSubcategories.length > 0 && (
        <div className="product-filter__subcat">
          <label className="block text-sm mb-1 text-foreground">
            {t('catalog.filters.subcategory', 'Подкатегория')}
          </label>
          <Select value={subcat || 'all'} onValueChange={(value) => onFilter({ group, subcat: value === 'all' ? '' : value, onSale, brands, minPrice, maxPrice, order })}>
            <SelectTrigger className="w-full bg-card text-foreground border-border">
              <SelectValue placeholder={`${t('common.viewAll')} (${subcatCount('')})`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.viewAll')} ({subcatCount('')})</SelectItem>
              {groupSubcategories.map((sub) => (
                <SelectItem key={sub.slug} value={sub.slug}>
                  {sub.key ? t(sub.key, sub.labels[language]) : sub.labels[language]} ({subcatCount(sub.slug)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Checkbox
          className="w-full"
          label={`${t('categories.onSale')} (${onSaleCount()})`}
          checked={onSale}
          onCheckedChange={(checked) => onFilter({ group, subcat, onSale: checked, brands, minPrice, maxPrice, order })}
        />
      </div>
      <div className="product-filter__brand">
        <label className="product-filter__brand-label block text-sm mb-1 text-foreground">{t('product.brand')}</label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="product-filter__brand-trigger w-full justify-between bg-card text-foreground border-border font-normal"
            >
              <span className="product-filter__brand-trigger-text truncate">
                {brands.length === 0
                  ? t('common.viewAll')
                  : brands.map((id) => getBrandName(id, configuredBrands)).join(', ')}
              </span>
              <ChevronDown className="product-filter__brand-trigger-icon h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="product-filter__brand-menu max-h-72 w-72 overflow-y-auto">
            {availableBrands.map((brandId) => {
              const nextBrands = brands.includes(brandId)
                ? [brandId]
                : [...brands, brandId]
              const count = brandCount(brandId, nextBrands)

              return (
                <DropdownMenuCheckboxItem
                  key={brandId}
                  className="product-filter__brand-option"
                  checked={brands.includes(brandId)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => handleBrandChange(brandId)}
                >
                  {getBrandName(brandId, configuredBrands)} ({count})
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div>
        <label className="block text-sm mb-1 text-foreground">{t('product.price')}</label>
        <div className="flex gap-2">
          <Input type="number" className="w-full bg-card text-foreground border-border" placeholder={priceRange.min ? `${t('common.min')} ${priceRange.min}` : t('common.min')} value={minPrice} onChange={e => onFilter({ group, subcat, onSale, brands, minPrice: e.target.value, maxPrice, order })} />
          <Input type="number" className="w-full bg-card text-foreground border-border" placeholder={priceRange.max ? `${t('common.max')} ${priceRange.max}` : t('common.max')} value={maxPrice} onChange={e => onFilter({ group, subcat, onSale, brands, minPrice, maxPrice: e.target.value, order })} />
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {t('catalog.filters.selected', 'Выбранные фильтры')}
          </p>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <Badge key={filter.id} variant="outline" className="gap-1 pr-1 text-foreground border-border">
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
        className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 rounded px-4 py-2 transition-colors border border-border"
      >
        {t('common.reset')}
      </button>
    </div>
  )
}
