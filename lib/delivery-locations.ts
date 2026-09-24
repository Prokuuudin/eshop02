import directory from '@/data/delivery-locations.json'
import { requiresDeliveryLocation, type DeliveryCountry } from './delivery'

export type DeliveryLocation = {
  id: string
  provider: 'omniva' | 'venipak' | 'unisend'
  type: 'locker' | 'pickup'
  country: DeliveryCountry
  name: string
  address: string
  city: string
  postalCode: string
  latitude?: number
  longitude?: number
  comment?: string
}
const locations = directory.locations as DeliveryLocation[]

export { requiresDeliveryLocation } from './delivery'

export function getDeliveryLocations(method: string, country: DeliveryCountry): DeliveryLocation[] {
  if (!requiresDeliveryLocation(method)) return []
  const provider = method === 'post' ? 'omniva' : method
  // Pickup outlets have no separate confirmed tariff; retain them in the directory for future use.
  return locations.filter(location => location.provider === provider && location.country === country && location.type === 'locker')
}

export function resolveDeliveryLocation(method: string, country: DeliveryCountry, id?: string): DeliveryLocation | null {
  return getDeliveryLocations(method, country).find(location => location.id === id) ?? null
}
