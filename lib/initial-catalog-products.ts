import 'server-only'

import { isProductOnSale, type Product } from '@/data/products'
import type { Language } from '@/data/translations'
import { brandSlug } from '@/lib/brand-slug'
import {
  getDbProductsPaginated,
  getMergedProductsByIds,
  getStorefrontBrandNames,
  getStorefrontFacetProducts,
} from '@/lib/product-overrides-store'
import { redactProductPrices } from '@/lib/product-price-visibility'
import { getServerUser } from '@/lib/server-auth'
import { sortBrandProductsNewestFirst } from '@/lib/catalog-product-sort'
import productSubcategories from '@/data/product-subcategories.json'

export const CATALOG_PAGE_SIZE = 24

type InitialCatalogFilters = {
  language: Language
  category?: string
  subcategories?: string[]
  brands?: string[]
  search?: string
  minPrice?: number
  maxPrice?: number
  onSale?: boolean
  order?: string
  page?: number
}

function matchesSubcategories(product: Product, subcategories: string[]): boolean {
  return subcategories.length === 0 || (product.subcategory !== undefined && subcategories.includes(product.subcategory))
}

function sortProducts(products: Product[], order: string | undefined, language: Language, hasBrandFilter: boolean): Product[] {
  if (!order) return hasBrandFilter ? sortBrandProductsNewestFirst(products) : products
  // Not-for-sale products carry no price (see lib/product-sellability.ts) and sort last.
  if (order === 'price-asc') return [...products].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  if (order === 'price-desc') return [...products].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
  if (order === 'name-asc') {
    return [...products].sort((a, b) => localizedTitle(a, language).localeCompare(localizedTitle(b, language)))
  }
  if (order === 'name-desc') {
    return [...products].sort((a, b) => localizedTitle(b, language).localeCompare(localizedTitle(a, language)))
  }
  return products
}

export type InitialCatalogPage = {
  products: Product[]
  page: number
  pageSize: number
  totalProducts: number
  totalPages: number
}

function localizedTitle(product: Product, language: Language): string {
  if (language === 'en' && product.titleEn) return product.titleEn
  if (language === 'lv' && product.titleLv) return product.titleLv
  return product.title
}

export async function getInitialCatalogProducts({
  language,
  category,
  subcategories = [],
  brands = [],
  search = '',
  minPrice,
  maxPrice,
  onSale = false,
  order,
  page = 1,
}: InitialCatalogFilters): Promise<InitialCatalogPage> {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1
  const offset = (normalizedPage - 1) * CATALOG_PAGE_SIZE
  const requiresSemanticScan = onSale
    || minPrice !== undefined
    || maxPrice !== undefined
    || order === 'price-asc'
    || order === 'price-desc'
    || order === 'name-asc'
    || order === 'name-desc'

  if (!requiresSemanticScan) {
    const subcategoryIds = subcategories.length
      ? Object.entries(productSubcategories as Record<string, string>)
          .filter(([, subcategory]) => subcategories.includes(subcategory))
          .map(([id]) => id)
      : undefined
    const allBrandNames = brands.length ? await getStorefrontBrandNames() : []
    const brandNames = brands.length
      ? allBrandNames.filter((brand) => brands.includes(brandSlug(brand)))
      : undefined
    const orderBy = order === 'price-asc'
      ? { price: 'asc' as const }
      : order === 'price-desc'
        ? { price: 'desc' as const }
        : { createdAt: 'desc' as const }
    const [{ products, total }, user] = await Promise.all([
      getDbProductsPaginated({
        category,
        ids: subcategoryIds,
        brandNames,
        search,
        searchLanguage: language,
        searchExtendedFields: false,
        orderBy,
        skip: offset,
        take: CATALOG_PAGE_SIZE,
        projection: 'card',
      }),
      getServerUser(),
    ])
    return {
      products: user ? products : redactProductPrices(products),
      page: normalizedPage,
      pageSize: CATALOG_PAGE_SIZE,
      totalProducts: total,
      totalPages: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
    }
  }

  // Campaign membership and locale collation are application-level semantics.
  // Scan only their narrow index fields, then fetch full rows for the selected page.
  const [products, user] = await Promise.all([getStorefrontFacetProducts(), getServerUser()])
  const normalizedSearch = search.trim().toLocaleLowerCase()

  const filtered = products.filter((product) => {
    if (category && product.category !== category) return false
    if (!matchesSubcategories(product, subcategories)) return false
    if (brands.length > 0 && !brands.includes(brandSlug(product.brand))) return false
    if (minPrice !== undefined && !(product.price >= minPrice)) return false
    if (maxPrice !== undefined && !(product.price <= maxPrice)) return false
    if (onSale && !isProductOnSale(product)) return false

    if (normalizedSearch) {
      const searchable = [localizedTitle(product, language), product.title, product.brand]
        .join(' ')
        .toLocaleLowerCase()
      if (!searchable.includes(normalizedSearch)) return false
    }

    return true
  })

  const sorted = sortProducts(filtered, order, language, brands.length > 0)

  const totalProducts = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalProducts / CATALOG_PAGE_SIZE))
  const pageIds = sorted.slice(offset, offset + CATALOG_PAGE_SIZE).map((product) => product.id)
  const pageProducts = await getMergedProductsByIds(pageIds)

  return {
    products: user ? pageProducts : redactProductPrices(pageProducts),
    page: normalizedPage,
    pageSize: CATALOG_PAGE_SIZE,
    totalProducts,
    totalPages,
  }
}

export type CatalogFacets = {
  groupCounts: Record<string, number>
  subcatCounts: Record<string, number>
  onSaleCount: number
  availableBrands: string[]
  brandCounts: Record<string, number>
}

type CatalogFacetFilters = Omit<InitialCatalogFilters, 'order' | 'page'>

/**
 * Sidebar filter counts, computed over the whole matching catalog (not the
 * current 24-item page). Each count mirrors the "what if I changed just this
 * one facet, keeping the others as they are" semantics the filter UI uses —
 * see the matching getCountByFilters call sites in ProductFilter.tsx.
 */
export async function getCatalogFacets({
  language,
  category,
  subcategories = [],
  brands = [],
  search = '',
  minPrice,
  maxPrice,
  onSale = false,
}: CatalogFacetFilters): Promise<CatalogFacets> {
  const products = await getStorefrontFacetProducts()
  const normalizedSearch = search.trim().toLocaleLowerCase()

  const matchesSearch = (product: Product): boolean => {
    if (!normalizedSearch) return true
    const searchable = [localizedTitle(product, language), product.title, product.brand]
      .join(' ')
      .toLocaleLowerCase()
    return searchable.includes(normalizedSearch)
  }
  const matchesPrice = (product: Product): boolean =>
    (minPrice === undefined || product.price >= minPrice) && (maxPrice === undefined || product.price <= maxPrice)
  const matchesBrandsList = (product: Product, list: string[]): boolean =>
    list.length === 0 || list.includes(brandSlug(product.brand))

  // Group counts: vary group (subcat cleared), keep onSale/brands/price/search as-is.
  const groupBase = products.filter(
    (p) => matchesSearch(p) && matchesPrice(p) && matchesBrandsList(p, brands) && (!onSale || isProductOnSale(p))
  )
  const groupCounts: Record<string, number> = { '': groupBase.length }
  for (const p of groupBase) {
    groupCounts[p.category] = (groupCounts[p.category] ?? 0) + 1
  }

  // Subcat counts: keep current group, vary subcat, keep other filters.
  const subcatBase = groupBase.filter((p) => !category || p.category === category)
  const subcatCounts: Record<string, number> = { '': subcatBase.length }
  for (const p of subcatBase) {
    if (!p.subcategory) continue
    subcatCounts[p.subcategory] = (subcatCounts[p.subcategory] ?? 0) + 1
  }

  // onSale count: keep group/subcat/brands/price/search, force onSale true.
  const onSaleBase = products.filter(
    (p) =>
      matchesSearch(p) &&
      matchesPrice(p) &&
      matchesBrandsList(p, brands) &&
      (!category || p.category === category) &&
      matchesSubcategories(p, subcategories)
  )
  const onSaleCount = onSaleBase.filter(isProductOnSale).length

  // Brand facet: base = group/subcat/onSale/price/search, brand selection itself ignored.
  const brandBase = products.filter(
    (p) =>
      matchesSearch(p) &&
      matchesPrice(p) &&
      (!onSale || isProductOnSale(p)) &&
      (!category || p.category === category) &&
      matchesSubcategories(p, subcategories)
  )
  const availableBrands = Array.from(new Set(brandBase.map((p) => brandSlug(p.brand))))
  const brandCounts: Record<string, number> = {}
  for (const brandId of availableBrands) {
    const nextBrands = brands.includes(brandId) ? [brandId] : [...brands, brandId]
    brandCounts[brandId] = brandBase.filter((p) => nextBrands.includes(brandSlug(p.brand))).length
  }

  return { groupCounts, subcatCounts, onSaleCount, availableBrands, brandCounts }
}
