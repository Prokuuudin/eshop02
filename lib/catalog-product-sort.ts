import type { Product } from '@/data/products'

function createdAtTimestamp(product: Product): number {
  if (!product.createdAt) return Number.NEGATIVE_INFINITY

  const timestamp = new Date(product.createdAt).getTime()
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

/**
 * Default ordering for a catalog result filtered by brand.
 * Products most recently added to the catalog are shown first; products
 * without a creation date retain their relative position at the end.
 */
export function sortBrandProductsNewestFirst(products: Product[]): Product[] {
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => {
      const dateDifference = createdAtTimestamp(b.product) - createdAtTimestamp(a.product)
      return dateDifference || a.index - b.index
    })
    .map(({ product }) => product)
}
