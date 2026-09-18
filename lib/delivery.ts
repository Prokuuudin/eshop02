import type { CommerceSettings } from './commerce-settings'

export type DeliveryCountry = 'LV' | 'LT' | 'EE'
/** Source: перевозка.xlsx, Sheet1. All tariffs include VAT. */
export const SPREADSHEET_DELIVERY_TARIFFS = {
  courier: { LV: 10, LT: 15, EE: 15 },
  post: { LV: 4, LT: 8, EE: 8 },
  venipak: { LV: 3, LT: 8, EE: 8 },
  pickup: { LV: 0, LT: 0, EE: 0 },
} as const
export const DELIVERY_FEES_EUR: Record<string, number> = { courier: 10, pickup: 0, post: 4, venipak: 3 }
export const DEFAULT_DELIVERY_FEE_EUR = DELIVERY_FEES_EUR.courier
export const FREE_DELIVERY_FROM_EUR = 100
const settingsIds = { courier: 'courier_latvia', pickup: 'pickup', post: 'omniva', venipak: 'venipak' } as const

/** Spreadsheet tariffs include VAT. Unconfirmed foreign free-delivery thresholds are not applied. */
export function calcDeliveryFee(method: string | null | undefined, subtotalAfterDiscount: number, country: DeliveryCountry = 'LV', settings?: CommerceSettings): number {
  const id = settingsIds[method as keyof typeof settingsIds] ?? 'courier_latvia'
  const configured = settings?.delivery[id]
  const zone = configured?.countryPrices?.[country]
  const tariff = SPREADSHEET_DELIVERY_TARIFFS[method as keyof typeof SPREADSHEET_DELIVERY_TARIFFS] ?? SPREADSHEET_DELIVERY_TARIFFS.courier
  const fee = tariff[country]
  const freeFrom = zone ? zone.freeFrom : country === 'LV' ? (configured ? configured.freeFrom : FREE_DELIVERY_FROM_EUR) : null
  return fee === 0 || (freeFrom !== null && subtotalAfterDiscount >= freeFrom) ? 0 : fee
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
  return next
}
