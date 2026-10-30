import { revalidateTag } from 'next/cache'

// Storefront caches whose campaign offers depend on product-line membership.
export const BRAND_LINE_STOREFRONT_TAGS = ['storefront-sale-products', 'storefront-bestsellers'] as const

/**
 * Must run in a Next.js request context (route handler) and only after the change
 * has committed; library code that may run in scripts or tests never calls it.
 */
export function revalidateBrandLineStorefront(): void {
  for (const tag of BRAND_LINE_STOREFRONT_TAGS) revalidateTag(tag, { expire: 0 })
}
