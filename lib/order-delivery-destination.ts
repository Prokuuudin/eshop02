import { stores } from '@/data/stores'
import type { Order } from './orders-store'

export type OrderDeliveryDestination = {
  carrier?: string
  name: string
  address: string
  city: string
  postalCode?: string
}

export function getOrderDeliveryDestination(order: Pick<Order, 'deliveryMethod' | 'deliveryLocation' | 'pickupStoreId' | 'address' | 'city' | 'postalCode'>): OrderDeliveryDestination | null {
  if (order.deliveryLocation) return {
    carrier: order.deliveryLocation.provider,
    name: order.deliveryLocation.name,
    address: order.deliveryLocation.address,
    city: order.deliveryLocation.city,
    postalCode: order.deliveryLocation.postalCode || undefined,
  }
  if (order.deliveryMethod === 'pickup' && order.pickupStoreId) {
    const store = stores.find(item => item.id === order.pickupStoreId)
    if (store) return { name: store.id, address: store.address.lv, city: store.city.lv }
  }
  return null
}
