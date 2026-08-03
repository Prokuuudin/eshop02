import 'server-only'

import type { Product } from '@/data/products'
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
  page?: number
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

    if (normalizedSearch) {
      const searchable = [localizedTitle(product, language), product.title, product.brand]
        .join(' ')
        .toLocaleLowerCase()
      if (!searchable.includes(normalizedSearch)) return false
    }

    return true
  })

  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1
  const totalProducts = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalProducts / CATALOG_PAGE_SIZE))
  const offset = (normalizedPage - 1) * CATALOG_PAGE_SIZE
  const pageProducts = filtered.slice(offset, offset + CATALOG_PAGE_SIZE)

  return {
    products: user ? pageProducts : redactProductPrices(pageProducts),
    page: normalizedPage,
    pageSize: CATALOG_PAGE_SIZE,
    totalProducts,
    totalPages,
  }
}
