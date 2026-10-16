import importedTariffs from '@/data/delivery-tariffs.json'
import type { CommerceSettings } from './commerce-settings'

export type DeliveryCountry = 'LV' | 'LT' | 'EE'
/** Source: перевозка.xlsx, Sheet1. All tariffs include VAT. */
export const checkoutDeliveryMethodIds = ['courier_riga', 'courier_latvia', 'pickup', 'post', 'venipak', 'venipak_courier', 'unisend', 'unisend_courier', 'expresspasts', 'expresspasts_courier'] as const
export const acceptedDeliveryMethodIds = ['courier', ...checkoutDeliveryMethodIds] as const
export const productionDeliveryMethodIds = ['courier_riga', 'courier_latvia', 'pickup', 'post', 'venipak', 'unisend'] as const
export type CheckoutDeliveryMethod = (typeof acceptedDeliveryMethodIds)[number]
export const SPREADSHEET_DELIVERY_TARIFFS = {
  courier: importedTariffs.tariffs.omniva.courier,
  post: importedTariffs.tariffs.omniva.locker,
  venipak: importedTariffs.tariffs.venipak.locker,
  venipak_courier: importedTariffs.tariffs.venipak.courier,
  unisend: importedTariffs.tariffs.unisend.locker,
  unisend_courier: importedTariffs.tariffs.unisend.courier,
  expresspasts: importedTariffs.tariffs.expresspasts.locker,
  expresspasts_courier: importedTariffs.tariffs.expresspasts.courier,
  pickup: { LV: 0, LT: 0, EE: 0 },
} as const
export const DELIVERY_FEES_EUR: Record<string, number> = Object.fromEntries(Object.entries(SPREADSHEET_DELIVERY_TARIFFS).map(([method, prices]) => [method, prices.LV]))
export const DELIVERY_METHOD_LABEL_KEYS: Record<CheckoutDeliveryMethod, string> = {
  courier: 'checkout.delivery.courierLatvia', courier_riga: 'checkout.delivery.courierRiga', courier_latvia: 'checkout.delivery.courierLatvia', pickup: 'checkout.delivery.pickup', post: 'checkout.delivery.omniva', venipak: 'checkout.delivery.venipak',
  venipak_courier: 'checkout.delivery.venipakCourier', unisend: 'checkout.delivery.unisend', unisend_courier: 'checkout.delivery.unisendCourier', expresspasts: 'checkout.delivery.expresspasts', expresspasts_courier: 'checkout.delivery.expresspastsCourier',
}
export const DELIVERY_METHOD_NAMES_LV: Record<CheckoutDeliveryMethod, string> = {
  courier: 'Kurjers Latvijā', courier_riga: 'Kurjers Rīgā un apstiprinātajās priekšpilsētās', courier_latvia: 'Kurjers Latvijā', pickup: 'Saņemšana veikalā', post: 'Omniva pakomāts', venipak: 'Venipak pakomāts', venipak_courier: 'Venipak kurjers', unisend: 'Unisend pakomāts', unisend_courier: 'Unisend kurjers', expresspasts: 'Expresspasts pakomāts', expresspasts_courier: 'Expresspasts kurjers',
}
export const DEFAULT_DELIVERY_FEE_EUR = DELIVERY_FEES_EUR.courier
export const FREE_DELIVERY_FROM_EUR = 100
export const UNISEND_MAX_WEIGHT_KG = 30
const settingsIds = { courier: 'courier_latvia', courier_riga: 'courier_riga', courier_latvia: 'courier_latvia', pickup: 'pickup', post: 'omniva', venipak: 'venipak', venipak_courier: 'venipak_courier', unisend: 'unisend', unisend_courier: 'unisend_courier', expresspasts: 'expresspasts', expresspasts_courier: 'expresspasts_courier' } as const
const tariffIds = { courier: 'courier', courier_riga: 'courier', courier_latvia: 'courier', pickup: 'pickup', post: 'post', venipak: 'venipak', venipak_courier: 'venipak_courier', unisend: 'unisend', unisend_courier: 'unisend_courier', expresspasts: 'expresspasts', expresspasts_courier: 'expresspasts_courier' } as const

export type DeliveryAddress = { city?: string | null }

export function isCourierDeliveryMethod(method: string): boolean {
  return method === 'courier' || method === 'courier_riga' || method === 'courier_latvia'
}

function normalizedCity(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lv-LV')
}

/** Admin text (one city per line or comma-separated) → trimmed, de-duplicated city names. */
export function parseServiceAreaCities(text: string): string[] {
  const seen = new Set<string>()
  const cities: string[] = []
  for (const raw of text.split(/[\n,]/)) {
    const city = raw.trim().replace(/\s+/g, ' ')
    if (!city || seen.has(normalizedCity(city))) continue
    seen.add(normalizedCity(city))
    cities.push(city)
  }
  return cities
}

/** Spreadsheet tariffs include VAT. Unconfirmed foreign free-delivery thresholds are not applied. */
export function calcDeliveryFee(method: string | null | undefined, subtotalAfterDiscount: number, country: DeliveryCountry = 'LV', settings?: CommerceSettings): number {
  const id = settingsIds[method as keyof typeof settingsIds] ?? 'courier_latvia'
  const configured = settings?.delivery[id]
  const zone = configured?.countryPrices?.[country]
  const tariffId = tariffIds[method as keyof typeof tariffIds] ?? 'courier'
  const tariff = SPREADSHEET_DELIVERY_TARIFFS[tariffId]
  const fee = tariff[country]
  const freeFrom = zone ? zone.freeFrom : country === 'LV' ? (configured ? configured.freeFrom : ['unisend_courier', 'expresspasts', 'expresspasts_courier', 'venipak_courier'].includes(method ?? '') ? null : FREE_DELIVERY_FROM_EUR) : null
  return fee === 0 || (freeFrom !== null && subtotalAfterDiscount >= freeFrom) ? 0 : fee
}

export function isDeliveryConfigured(method: string, country: DeliveryCountry, settings: CommerceSettings): boolean {
  if (!(acceptedDeliveryMethodIds as readonly string[]).includes(method)) return false
  if (method !== 'courier' && !(productionDeliveryMethodIds as readonly string[]).includes(method)) return false
  const id = settingsIds[method as keyof typeof settingsIds]
  if (!id) return false
  const configured = settings.delivery[id]
  if (!configured.enabled || !configured.countries.includes(country)) return false
  if (method !== 'courier_riga') return true
  return configured.status === 'ready' && configured.serviceAreaCities.length > 0
}

export function isDeliveryAvailable(method: string, country: DeliveryCountry, settings: CommerceSettings, address: DeliveryAddress = {}): boolean {
  if (!isDeliveryConfigured(method, country, settings)) return false
  if (method !== 'courier_riga') return true
  const configured = settings.delivery.courier_riga
  const city = normalizedCity(address.city)
  return city.length > 0 && configured.serviceAreaCities.some((allowed) => normalizedCity(allowed) === city)
}

/** Override historical prices, retaining country availability and free-delivery rules. */
export function applySpreadsheetDeliveryTariffs(settings: CommerceSettings): CommerceSettings {
  const next = structuredClone(settings)
  for (const [method, id] of Object.entries(settingsIds)) {
    const tariff = SPREADSHEET_DELIVERY_TARIFFS[tariffIds[method as keyof typeof tariffIds]]
    const configured = next.delivery[id]
    configured.price = tariff.LV
    // Unisend parcel limit (Способы доставки.docx, 2026-09-23): applied when no limit is stored.
    if (id === 'unisend' && !configured.maxWeightKg) configured.maxWeightKg = UNISEND_MAX_WEIGHT_KG
    if (['courier_riga', 'courier_latvia', 'omniva', 'venipak', 'unisend'].includes(id)) configured.freeFrom = FREE_DELIVERY_FROM_EUR
    if (id === 'pickup') configured.freeFrom = 0
    for (const country of ['LV', 'LT', 'EE'] as const) {
      const existing = configured.countryPrices?.[country]
      if (country === 'LV' && !existing) continue
      configured.countryPrices = {
        ...configured.countryPrices,
        [country]: { price: tariff[country], freeFrom: country === 'LV' && ['courier_riga', 'courier_latvia', 'omniva', 'venipak', 'unisend'].includes(id) ? FREE_DELIVERY_FROM_EUR : existing ? existing.freeFrom : null },
      }
    }
  }
  next.delivery.courier_riga.price = SPREADSHEET_DELIVERY_TARIFFS.courier.LV
  return next
}

export function requiresDeliveryLocation(method: string): boolean {
  return method === 'post' || method === 'venipak' || method === 'unisend'
}
