import type { Product } from '@/data/products'

// Подбор товаров для блоков «Похожие товары» и «Часто покупают вместе».
// pool — уже отфильтрованный витринный список (isActive), поэтому ссылки на
// скрытые/удалённые товары отпадают сами при резолве.

const resolveIds = (ids: string[], byId: Map<string, Product>, excludeId: string, max: number): Product[] => {
  const seen = new Set<string>()
  const result: Product[] = []
  for (const id of ids) {
    if (id === excludeId || seen.has(id)) continue
    seen.add(id)
    const product = byId.get(id)
    if (product) result.push(product)
    if (result.length >= max) break
  }
  return result
}

export const buildProductIndex = (pool: Product[]): Map<string, Product> =>
  new Map(pool.map((p) => [p.id, p]))

/**
 * «Похожие товары»: явный список из админки/nopCommerce, иначе фолбэк —
 * тот же бренд (приоритет той же категории), добор по категории.
 */
export const pickRelated = (
  product: Product,
  pool: Product[],
  byId: Map<string, Product>,
  max = 4
): Product[] => {
  const explicit = resolveIds(product.relatedProductIds ?? [], byId, product.id, max)
  if (explicit.length > 0) return explicit

  const sameBrandSameCategory: Product[] = []
  const sameBrand: Product[] = []
  const sameCategory: Product[] = []
  for (const p of pool) {
    if (p.id === product.id) continue
    if (p.brand === product.brand && p.category === product.category) sameBrandSameCategory.push(p)
    else if (p.brand === product.brand) sameBrand.push(p)
    else if (p.category === product.category) sameCategory.push(p)
  }
  return [...sameBrandSameCategory, ...sameBrand, ...sameCategory].slice(0, max)
}

/**
 * «Часто покупают вместе»: явный список из админки/nopCommerce, иначе фолбэк —
 * co-purchase статистика из реальных заказов (запечённый JSON).
 */
export const pickBoughtTogether = (
  product: Product,
  byId: Map<string, Product>,
  copurchase: Record<string, string[]>,
  max = 4
): Product[] => {
  const explicit = resolveIds(product.oftenBoughtTogether ?? [], byId, product.id, max)
  if (explicit.length > 0) return explicit
  return resolveIds(copurchase[product.id] ?? [], byId, product.id, max)
}
