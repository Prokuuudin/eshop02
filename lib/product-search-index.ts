import 'server-only'
import type { Product } from '@/data/products'
import { getStorefrontFacetProducts } from '@/lib/product-overrides-store'

/**
 * Header autocomplete fires on every pause in typing, so it must not re-read the whole storefront
 * index (~2k rows + overrides + campaigns) each time. The long-lived server.js process keeps it for
 * a minute; catalog edits reach suggestions within that window. Concurrent callers share one load,
 * and a failed load is never cached.
 */
export const PRODUCT_SEARCH_INDEX_TTL_MS = 60_000

let cached: { loadedAt: number; products: Promise<Product[]> } | null = null

export function getProductSearchIndex(now: number = Date.now()): Promise<Product[]> {
  if (!cached || now - cached.loadedAt >= PRODUCT_SEARCH_INDEX_TTL_MS) {
    const products = getStorefrontFacetProducts()
    const entry = { loadedAt: now, products }
    cached = entry
    products.catch(() => {
      if (cached === entry) cached = null
    })
  }
  return cached.products
}
