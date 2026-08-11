import { stores } from '@/data/stores'
import type { Order } from '@/lib/orders-store'

function normalizeLatvianPlaceName(value: string): string {
  return value.replace(/Riga/gi, 'Rīga').replace(/Рига/gi, 'Rīga')
}

/** Known company/store addresses are always rendered from their Latvian source.
 * Customer-entered street names are preserved, with known Riga spellings fixed. */
export function formatOrderAddressLatvian(
  order: Pick<Order, 'deliveryMethod' | 'pickupStoreId' | 'address' | 'city' | 'postalCode'>
): string {
  if (order.deliveryMethod === 'pickup') {
    const store = order.pickupStoreId
      ? stores.find((candidate) => candidate.id === order.pickupStoreId)
      : stores.find((candidate) => {
          const postalCode = order.address.match(/LV-\d{4}/)?.[0]
          return postalCode !== undefined && candidate.address.lv.includes(postalCode)
        })

    if (store) return store.address.lv
  }

  return [order.address, order.city, order.postalCode]
    .filter(Boolean)
    .map((part) => normalizeLatvianPlaceName(String(part)))
    .join(', ')
}
