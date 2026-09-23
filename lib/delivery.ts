import importedTariffs from '@/data/delivery-tariffs.json'
import type { CommerceSettings } from './commerce-settings'

export type DeliveryCountry = 'LV' | 'LT' | 'EE'
/** Source: перевозка.xlsx, Sheet1. All tariffs include VAT. */
export const checkoutDeliveryMethodIds = ['courier', 'pickup', 'post', 'venipak', 'venipak_courier', 'unisend', 'unisend_courier', 'expresspasts', 'expresspasts_courier'] as const
export type CheckoutDeliveryMethod = (typeof checkoutDeliveryMethodIds)[number]
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
  courier: 'checkout.delivery.omnivaCourier', pickup: 'checkout.delivery.pickup', post: 'checkout.delivery.omniva', venipak: 'checkout.delivery.venipak',
  venipak_courier: 'checkout.delivery.venipakCourier', unisend: 'checkout.delivery.unisend', unisend_courier: 'checkout.delivery.unisendCourier', expresspasts: 'checkout.delivery.expresspasts', expresspasts_courier: 'checkout.delivery.expresspastsCourier',
}
export const DELIVERY_METHOD_NAMES_LV: Record<CheckoutDeliveryMethod, string> = {
  courier: 'Omniva kurjers', pickup: 'Saņemšana veikalā', post: 'Omniva pakomāts', venipak: 'Venipak pakomāts', venipak_courier: 'Venipak kurjers', unisend: 'Unisend pakomāts', unisend_courier: 'Unisend kurjers', expresspasts: 'Expresspasts pakomāts', expresspasts_courier: 'Expresspasts kurjers',
}
export const DEFAULT_DELIVERY_FEE_EUR = DELIVERY_FEES_EUR.courier
export const FREE_DELIVERY_FROM_EUR = 200
const settingsIds = { courier: 'courier_latvia', pickup: 'pickup', post: 'omniva', venipak: 'venipak', venipak_courier: 'venipak_courier', unisend: 'unisend', unisend_courier: 'unisend_courier', expresspasts: 'expresspasts', expresspasts_courier: 'expresspasts_courier' } as const

/** Spreadsheet tariffs include VAT. Unconfirmed foreign free-delivery thresholds are not applied. */
export function calcDeliveryFee(method: string | null | undefined, subtotalAfterDiscount: number, country: DeliveryCountry = 'LV', settings?: CommerceSettings): number {
  const id = settingsIds[method as keyof typeof settingsIds] ?? 'courier_latvia'
  const configured = settings?.delivery[id]
  const zone = configured?.countryPrices?.[country]
  const tariff = SPREADSHEET_DELIVERY_TARIFFS[method as keyof typeof SPREADSHEET_DELIVERY_TARIFFS] ?? SPREADSHEET_DELIVERY_TARIFFS.courier
  const fee = tariff[country]
  const freeFrom = zone
    ? zone.freeFrom
    : country === 'LV'
      ? (configured ? configured.freeFrom : method === 'courier' ? FREE_DELIVERY_FROM_EUR : null)
      : null
  return fee === 0 || (freeFrom !== null && subtotalAfterDiscount > freeFrom) ? 0 : fee
}

export function isDeliveryAvailable(method: string, country: DeliveryCountry, settings: CommerceSettings): boolean {
  const id = settingsIds[method as keyof typeof settingsIds]
  return !!id && settings.delivery[id].enabled && settings.delivery[id].countries.includes(country)
}

/** Override historical prices, retaining country availability and free-delivery rules. */
export function applySpreadsheetDeliveryTariffs(settings: CommerceSettings): CommerceSettings {
  const next = structuredClone(settings)
  for (const [method, id] of Object.entries(settingsIds)) {
    const tariff = SPREADSHEET_DELIVERY_TARIFFS[method as keyof typeof SPREADSHEET_DELIVERY_TARIFFS]
    const configured = next.delivery[id]
    configured.price = tariff.LV
    for (const country of ['LV', 'LT', 'EE'] as const) {
      const existing = configured.countryPrices?.[country]
      if (country === 'LV' && !existing) continue
      configured.countryPrices = {
        ...configured.countryPrices,
        [country]: { price: tariff[country], freeFrom: existing ? existing.freeFrom : null },
      }
    }
  }
  next.delivery.courier_riga.price = SPREADSHEET_DELIVERY_TARIFFS.courier.LV
  // Owner policy: courier delivery in Latvia is free only for orders over €200.
  // Parcel-locker methods have no free-delivery threshold in the approved copy.
  next.delivery.courier_riga.freeFrom = FREE_DELIVERY_FROM_EUR
  next.delivery.courier_latvia.freeFrom = FREE_DELIVERY_FROM_EUR
  const courierLvZone = next.delivery.courier_latvia.countryPrices?.LV
  if (courierLvZone) courierLvZone.freeFrom = FREE_DELIVERY_FROM_EUR
  for (const id of ['omniva', 'venipak', 'unisend', 'expresspasts'] as const) {
    next.delivery[id].freeFrom = null
    const lvZone = next.delivery[id].countryPrices?.LV
    if (lvZone) lvZone.freeFrom = null
  }
  return next
}

export function requiresDeliveryLocation(method: string): boolean {
  return method === 'venipak' || method === 'unisend'
}
