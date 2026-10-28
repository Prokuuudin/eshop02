import { stores } from '@/data/stores'
import { translations } from '@/data/translations'
import { acceptedDeliveryMethodIds, isCourierDeliveryMethod, isDeliveryAvailable, isLegacyCourierMethod, type DeliveryCountry } from './delivery'
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

/**
 * Resolve untrusted destination fields into one server-owned destination.
 * `existingMethod` is set only when an admin edits an existing order: a historical order
 * may keep its legacy courier method (`courier` / `courier_latvia`) unchanged, but no new
 * or edited order can switch to one — those methods are never available.
 */
export function validateOrderDelivery(input: {
  deliveryMethod?: unknown; country?: unknown; address?: unknown; city?: unknown;
  postalCode?: unknown; deliveryLocationId?: unknown; pickupStoreId?: unknown;
}, settings: CommerceSettings, options: { existingMethod?: string | null } = {}): ValidatedOrderDelivery {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const method = text(input.deliveryMethod)
  if (!(acceptedDeliveryMethodIds as readonly string[]).includes(method)) throw new OrderDeliveryError('invalid_delivery_method')
  if (isCourierDeliveryMethod(method) && input.country === undefined) throw new OrderDeliveryError('invalid_delivery_country')
  // Missing country retains the historical LV contract; explicit values never fall back.
  const country = (input.country === undefined ? 'LV' : input.country) as DeliveryCountry
  if (!['LV', 'LT', 'EE'].includes(country)) throw new OrderDeliveryError('invalid_delivery_country')
  // Incomplete home address first, so a missing city is reported as such, not as "outside the area".
  if (isCourierDeliveryMethod(method) && (!text(input.address) || !text(input.city) || !text(input.postalCode))) throw new OrderDeliveryError('missing_delivery_address')
  const keepsHistoricalCourier = isLegacyCourierMethod(method) && options.existingMethod === method
  if (!keepsHistoricalCourier && !isDeliveryAvailable(method, country, settings, { city: text(input.city) })) throw new OrderDeliveryError('delivery_unavailable')
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
