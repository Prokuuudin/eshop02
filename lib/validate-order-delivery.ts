import { stores } from '@/data/stores'
import { translations } from '@/data/translations'
import { checkoutDeliveryMethodIds, isDeliveryAvailable, type DeliveryCountry } from './delivery'
import { requiresDeliveryLocation, resolveDeliveryLocation, type DeliveryLocation } from './delivery-locations'
import type { CommerceSettings } from './commerce-settings'

export class OrderDeliveryError extends Error {}

type ValidatedOrderDelivery = {
  country: DeliveryCountry
  deliveryMethod: string
  pickupStoreId?: string
  deliveryLocation?: DeliveryLocation
  address: string
  city: string
  postalCode?: string
}

/** Resolve untrusted destination fields into one server-owned destination. */
export function validateOrderDelivery(input: {
  deliveryMethod?: unknown; country?: unknown; address?: unknown; city?: unknown;
  postalCode?: unknown; deliveryLocationId?: unknown; pickupStoreId?: unknown;
}, settings: CommerceSettings): ValidatedOrderDelivery {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const method = text(input.deliveryMethod)
  if (!(checkoutDeliveryMethodIds as readonly string[]).includes(method)) throw new OrderDeliveryError('invalid_delivery_method')
  if (method === 'courier' && input.country === undefined) throw new OrderDeliveryError('invalid_delivery_country')
  // Missing country retains the historical LV contract; explicit values never fall back.
  const country = (input.country === undefined ? 'LV' : input.country) as DeliveryCountry
  if (!['LV', 'LT', 'EE'].includes(country)) throw new OrderDeliveryError('invalid_delivery_country')
  if (!isDeliveryAvailable(method, country, settings)) throw new OrderDeliveryError('delivery_unavailable')
  if (method === 'courier' && (!text(input.address) || !text(input.city) || !text(input.postalCode))) throw new OrderDeliveryError('missing_delivery_address')
  const deliveryLocation = resolveDeliveryLocation(method, country, text(input.deliveryLocationId))
  if (requiresDeliveryLocation(method) && !deliveryLocation) throw new OrderDeliveryError('invalid_delivery_location')
  const store = method === 'pickup' ? stores.find(item => item.id === input.pickupStoreId) : undefined
  if (method === 'pickup' && !store) throw new OrderDeliveryError('invalid_pickup_store')
  return {
    country, deliveryMethod: method,
    pickupStoreId: store?.id,
    deliveryLocation: deliveryLocation ?? undefined,
    address: store ? `${translations.lv[`stores.${store.id}.name`]} — ${store.address.lv}` : deliveryLocation?.address ?? text(input.address),
    city: store?.city.lv ?? deliveryLocation?.city ?? text(input.city),
    postalCode: store ? undefined : deliveryLocation ? deliveryLocation.postalCode || undefined : text(input.postalCode) || undefined,
  }
}
