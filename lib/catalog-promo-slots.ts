export type CatalogGridEntry<T, P> =
  | { kind: 'product'; item: T }
  | { kind: 'promo'; promo: P }

const FIRST_PROMO_SLOT = 3
const PROMO_SLOT_STEP = 2

/**
 * Shows each promo exactly once, in grid slots 3, 5, 7, … (1-based) until the
 * promos run out; every other slot holds a product. When the filter leaves too
 * few products to reach a promo's slot, the leftover promos follow the products.
 */
export function interleavePromoTiles<T, P>(items: T[], promos: P[]): CatalogGridEntry<T, P>[] {
  const entries: CatalogGridEntry<T, P>[] = []
  let productIndex = 0
  let promoIndex = 0
  while (productIndex < items.length) {
    const slot = entries.length + 1
    const isPromoSlot = slot >= FIRST_PROMO_SLOT && (slot - FIRST_PROMO_SLOT) % PROMO_SLOT_STEP === 0
    if (isPromoSlot && promoIndex < promos.length) entries.push({ kind: 'promo', promo: promos[promoIndex++] })
    else entries.push({ kind: 'product', item: items[productIndex++] })
  }
  while (promoIndex < promos.length) entries.push({ kind: 'promo', promo: promos[promoIndex++] })
  return entries
}
