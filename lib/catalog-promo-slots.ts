export type CatalogGridEntry<T, P> =
  | { kind: 'product'; item: T }
  | { kind: 'promo'; promo: P }

const PROMO_EVERY_NTH_SLOT = 3

/**
 * Puts a promo tile in every third grid slot (product, product, promo, …),
 * cycling through the promos. A promo only takes a slot that a product
 * follows, so the grid never ends on a promo and short results get none.
 */
export function interleavePromoTiles<T, P>(items: T[], promos: P[]): CatalogGridEntry<T, P>[] {
  const entries: CatalogGridEntry<T, P>[] = []
  const productsPerPromo = PROMO_EVERY_NTH_SLOT - 1
  let promoIndex = 0
  items.forEach((item, index) => {
    if (promos.length > 0 && index > 0 && index % productsPerPromo === 0) {
      entries.push({ kind: 'promo', promo: promos[promoIndex++ % promos.length] })
    }
    entries.push({ kind: 'product', item })
  })
  return entries
}
