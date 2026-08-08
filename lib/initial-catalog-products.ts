import 'server-only'

import { isProductOnSale, type Product } from '@/data/products'
import type { Language } from '@/data/translations'
import { brandSlug } from '@/lib/brand-slug'
import { getMergedProducts } from '@/lib/product-overrides-store'
import { redactProductPrices } from '@/lib/product-price-visibility'
import { getServerUser } from '@/lib/server-auth'

export const CATALOG_PAGE_SIZE = 24

type InitialCatalogFilters = {
  language: Language
  category?: string
  subcategory?: string
  brands?: string[]
  search?: string
  minPrice?: number
  maxPrice?: number
  onSale?: boolean
  order?: string
  page?: number
}

function sortProducts(products: Product[], order: string | undefined, language: Language): Product[] {
  if (!order) return products
  if (order === 'price-asc') return [...products].sort((a, b) => a.price - b.price)
  if (order === 'price-desc') return [...products].sort((a, b) => b.price - a.price)
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
  subcategory,
  brands = [],
  search = '',
  minPrice,
  maxPrice,
  onSale = false,
  order,
  page = 1,
}: InitialCatalogFilters): Promise<InitialCatalogPage> {
  const [products, user] = await Promise.all([getMergedProducts(), getServerUser()])
  const normalizedSearch = search.trim().toLocaleLowerCase()

  const filtered = products.filter((product) => {
    if (category && product.category !== category) return false
    if (subcategory && product.subcategory !== subcategory) return false
    if (brands.length > 0 && !brands.includes(brandSlug(product.brand))) return false
    if (minPrice !== undefined && product.price < minPrice) return false
    if (maxPrice !== undefined && product.price > maxPrice) return false
    if (onSale && !isProductOnSale(product)) return false

    if (normalizedSearch) {
      const searchable = [localizedTitle(product, language), product.title, product.brand]
        .join(' ')
        .toLocaleLowerCase()
      if (!searchable.includes(normalizedSearch)) return false
    }

    return true
  })

  const sorted = sortProducts(filtered, order, language)

  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1
  const totalProducts = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalProducts / CATALOG_PAGE_SIZE))
  const offset = (normalizedPage - 1) * CATALOG_PAGE_SIZE
  const pageProducts = sorted.slice(offset, offset + CATALOG_PAGE_SIZE)

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
  subcategory,
  brands = [],
  search = '',
  minPrice,
  maxPrice,
  onSale = false,
}: CatalogFacetFilters): Promise<CatalogFacets> {
  const products = await getMergedProducts()
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
      (!subcategory || p.subcategory === subcategory)
  )
  const onSaleCount = onSaleBase.filter(isProductOnSale).length

  // Brand facet: base = group/subcat/onSale/price/search, brand selection itself ignored.
  const brandBase = products.filter(
    (p) =>
      matchesSearch(p) &&
      matchesPrice(p) &&
      (!onSale || isProductOnSale(p)) &&
      (!category || p.category === category) &&
      (!subcategory || p.subcategory === subcategory)
  )
  const availableBrands = Array.from(new Set(brandBase.map((p) => brandSlug(p.brand))))
  const brandCounts: Record<string, number> = {}
  for (const brandId of availableBrands) {
    const nextBrands = brands.includes(brandId) ? [brandId] : [...brands, brandId]
    brandCounts[brandId] = brandBase.filter((p) => nextBrands.includes(brandSlug(p.brand))).length
  }

  return { groupCounts, subcatCounts, onSaleCount, availableBrands, brandCounts }
}
