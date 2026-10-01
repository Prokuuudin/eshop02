export type CatalogGridEntry<T, P> =
  | { kind: 'product'; item: T }
  | { kind: 'promo'; promo: P }

const FIRST_PROMO_AFTER = 3
const PROMO_EVERY = 8

/**
 * Spreads promo tiles through a product grid: the first after three products,
 * then one after every eight, each promo shown at most once. A short result
 * still gets one promo at its end; an empty result gets none.
 */
export function interleavePromoTiles<T, P>(items: T[], promos: P[]): CatalogGridEntry<T, P>[] {
  const entries: CatalogGridEntry<T, P>[] = []
  let promoIndex = 0
  items.forEach((item, index) => {
    const isSlot = index >= FIRST_PROMO_AFTER && (index - FIRST_PROMO_AFTER) % PROMO_EVERY === 0
    if (isSlot && promoIndex < promos.length) entries.push({ kind: 'promo', promo: promos[promoIndex++] })
    entries.push({ kind: 'product', item })
  })
  if (items.length > 0 && items.length <= FIRST_PROMO_AFTER && promos.length > 0) {
    entries.push({ kind: 'promo', promo: promos[0] })
  }
  return entries
}
