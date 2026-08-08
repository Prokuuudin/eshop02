import type { Product } from '@/data/products'

type ProductsPage = { data?: { products?: Product[]; total?: number } }

export async function fetchAllProducts(category?: string): Promise<Product[]> {
  const take = 200
  const products: Product[] = []
  let total = Number.POSITIVE_INFINITY

  while (products.length < total) {
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
  return products
}
