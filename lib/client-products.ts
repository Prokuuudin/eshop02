import type { Product } from '@/data/products'

type ProductsPage = { data?: { products?: Product[]; total?: number } }

/**
 * @param limit Stop once this many products have been fetched, instead of paging
 * through the entire catalog. Omit to fetch everything (the original behavior).
 */
export async function fetchAllProducts(category?: string, limit?: number): Promise<Product[]> {
  const take = 200
  const products: Product[] = []
  let total = Number.POSITIVE_INFINITY

  while (products.length < total && (limit === undefined || products.length < limit)) {
    const params = new URLSearchParams({ skip: String(products.length), take: String(take) })
    if (category) params.set('category', category)
    const response = await fetch(`/api/products?${params}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`products_page_failed:${response.status}`)
    const payload = (await response.json()) as ProductsPage
    const page = payload.data?.products ?? []
    total = payload.data?.total ?? page.length
    products.push(...page)
    if (page.length === 0 || page.length < take) break
  }
  return limit === undefined ? products : products.slice(0, limit)
}
