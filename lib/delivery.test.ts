import { describe, it, expect } from 'vitest'
import { applySpreadsheetDeliveryTariffs, calcDeliveryFee, checkoutDeliveryMethodIds, DELIVERY_FEES_EUR, FREE_DELIVERY_FROM_EUR, isDeliveryAvailable, isDeliveryConfigured, parseServiceAreaCities, UNISEND_MAX_WEIGHT_KG } from './delivery'

describe('calcDeliveryFee', () => {
  it('charges courier €10 below the free-delivery threshold', () => {
    expect(calcDeliveryFee('courier', 60)).toBe(10)
  })

  it('charges post (Omniva) €4 below the free-delivery threshold', () => {
    expect(calcDeliveryFee('post', 60)).toBe(4)
  })

  it('charges venipak €3 below the free-delivery threshold', () => {
    expect(calcDeliveryFee('venipak', 60)).toBe(3)
  })

  it('pickup is always free', () => {
    expect(calcDeliveryFee('pickup', 10)).toBe(0)
  })

  it('is free from €100 (threshold inclusive)', () => {
    expect(calcDeliveryFee('courier', 100)).toBe(0)
    expect(calcDeliveryFee('courier', 250)).toBe(0)
    expect(calcDeliveryFee('post', 100)).toBe(0)
    expect(calcDeliveryFee('venipak', 100)).toBe(0)
    expect(calcDeliveryFee('unisend', 100)).toBe(0)
    expect(calcDeliveryFee('courier', 100.01)).toBe(0)
    expect(calcDeliveryFee('courier_riga', 100)).toBe(0)
    expect(calcDeliveryFee('courier_latvia', 100.01)).toBe(0)
  })

  it('charges just below the threshold', () => {
    expect(calcDeliveryFee('courier', 99.99)).toBe(10)
    expect(calcDeliveryFee('courier_riga', 99.99)).toBe(10)
    expect(calcDeliveryFee('courier_latvia', 99.99)).toBe(10)
    expect(calcDeliveryFee('post', 99.99)).toBe(4)
    expect(calcDeliveryFee('venipak', 99.99)).toBe(3)
    expect(calcDeliveryFee('unisend', 99.99)).toBe(2)
  })

  it('falls back to the courier fee for unknown or missing method', () => {
    expect(calcDeliveryFee(undefined, 60)).toBe(10)
    expect(calcDeliveryFee(null, 60)).toBe(10)
    expect(calcDeliveryFee('teleport', 60)).toBe(10)
  })

  it('exports fees in euros, not cents', () => {
    expect(DELIVERY_FEES_EUR.courier).toBe(10)
    expect(DELIVERY_FEES_EUR.post).toBe(4)
    expect(DELIVERY_FEES_EUR.venipak).toBe(3)
    expect(DELIVERY_FEES_EUR.pickup).toBe(0)
    expect(FREE_DELIVERY_FROM_EUR).toBe(100)
  })
})

import { DEFAULT_COMMERCE_SETTINGS, normalizeCommerceSettings } from './commerce-settings'
it('charges spreadsheet foreign tariffs even above the Latvian free threshold', () => {
  for (const country of ['LT', 'EE'] as const) {
    expect(calcDeliveryFee('post', 300, country)).toBe(8)
    expect(calcDeliveryFee('venipak', 300, country)).toBe(8)
    expect(calcDeliveryFee('courier', 300, country)).toBe(15)
  }
})
it('prioritises spreadsheet prices while keeping country-specific thresholds', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.omniva.price = 6
  settings.delivery.omniva.freeFrom = 200
  settings.delivery.omniva.countryPrices = { LT: { price: 9, freeFrom: 500 } }
  expect(calcDeliveryFee('post', 100, 'LV', settings)).toBe(4)
  expect(calcDeliveryFee('post', 200, 'LV', settings)).toBe(0)
  expect(calcDeliveryFee('post', 499, 'LT', settings)).toBe(8)
  expect(calcDeliveryFee('post', 500, 'LT', settings)).toBe(0)
})

it('overrides saved tariffs and applies the approved Latvian threshold', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.venipak.enabled = false
  settings.delivery.omniva.price = 99
  settings.delivery.omniva.countryPrices = { LV: { price: 99, freeFrom: null }, EE: { price: 99, freeFrom: 500 } }
  const result = applySpreadsheetDeliveryTariffs(settings)
  expect(result.delivery.omniva.price).toBe(4)
  expect(result.delivery.omniva.countryPrices?.LV).toEqual({ price: 4, freeFrom: 100 })
  expect(result.delivery.omniva.countryPrices?.EE).toEqual({ price: 8, freeFrom: 500 })
  expect(result.delivery.venipak.enabled).toBe(false)
  expect(result.delivery.courier_riga.freeFrom).toBe(100)
  expect(result.delivery.courier_latvia.freeFrom).toBe(100)
  expect(settings.delivery.omniva.price).toBe(99)
})

it('offers only the own Riga courier; courier_latvia and the legacy courier are never available', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.courier_riga.enabled = true
  settings.delivery.courier_riga.status = 'ready'
  settings.delivery.courier_riga.serviceAreaCities = ['Rīga']
  // Even if an old saved setting still enables it, the Latvia-wide courier stays off.
  settings.delivery.courier_latvia.enabled = true
  settings.delivery.courier_latvia.status = 'ready'

  expect(isDeliveryAvailable('courier_riga', 'LV', settings, { city: '  RĪGA ' })).toBe(true)
  expect(isDeliveryAvailable('courier_riga', 'LV', settings, { city: 'Jelgava' })).toBe(false)
  for (const method of ['courier_latvia', 'courier']) {
    expect(isDeliveryConfigured(method, 'LV', settings)).toBe(false)
    expect(isDeliveryAvailable(method, 'LV', settings, { city: 'Rīga' })).toBe(false)
    expect(isDeliveryAvailable(method, 'LV', settings, { city: 'Jelgava' })).toBe(false)
  }
  expect(checkoutDeliveryMethodIds).not.toContain('courier_latvia')
  expect(checkoutDeliveryMethodIds).not.toContain('courier')
  expect(DEFAULT_COMMERCE_SETTINGS.delivery.courier_latvia.enabled).toBe(false)
})

it('keeps courier_riga unavailable until an approved city is configured', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.courier_riga.enabled = true
  settings.delivery.courier_riga.status = 'ready'
  expect(isDeliveryAvailable('courier_riga', 'LV', settings, { city: 'Rīga' })).toBe(false)
  settings.delivery.courier_riga.serviceAreaCities = ['Rīga']
  expect(isDeliveryConfigured('courier_riga', 'LV', settings)).toBe(true)
  expect(isDeliveryAvailable('courier_riga', 'LV', settings)).toBe(false)
})

it('keeps unapproved carrier variants unavailable', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.venipak_courier.enabled = true
  settings.delivery.venipak_courier.status = 'ready'
  expect(isDeliveryAvailable('venipak_courier', 'LV', settings)).toBe(false)
})

it('enforces the approved Latvian free-delivery threshold', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.omniva.freeFrom = null
  expect(calcDeliveryFee('post', 1000, 'LV', applySpreadsheetDeliveryTariffs(settings))).toBe(0)
})

it('uses new carrier prices with no inferred thresholds for unapproved methods or foreign countries', () => {
  for (const [method, prices] of Object.entries({ unisend_courier: [5, 5, 5], expresspasts: [2.5, 4, 4], expresspasts_courier: [10, 10, 25], venipak_courier: [10, 15, 15] })) {
    for (const [index, country] of (['LV', 'LT', 'EE'] as const).entries()) {
      expect(calcDeliveryFee(method, 1000, country)).toBe(prices[index])
      expect(calcDeliveryFee(method, 1000, country, DEFAULT_COMMERCE_SETTINGS)).toBe(prices[index])
    }
  }
})

// Exact production `shipping-settings` row (legacy format, read-only snapshot 2026-10-16).
const PRODUCTION_LEGACY_SHIPPING = {
  payment: {
    card: { label: 'Банковская карта', enabled: true },
    cash: { label: 'Наличные', enabled: true },
    online: { label: 'Онлайн (Stripe)', enabled: true },
    invoice: { label: 'По счёту (B2B)', enabled: false },
  },
  delivery: {
    post: { label: 'Почта', price: 3.99, enabled: true, freeFrom: 30 },
    pickup: { label: 'Самовывоз', price: 0, enabled: true, freeFrom: 0 },
    courier: { label: 'Курьер', price: 5.99, enabled: true, freeFrom: 50 },
  },
}

describe('production legacy shipping row after this release', () => {
  const effective = applySpreadsheetDeliveryTariffs(normalizeCommerceSettings(PRODUCTION_LEGACY_SHIPPING))

  it('offers no own courier at all until the Riga area is approved (legacy draft, empty area)', () => {
    expect(effective.delivery.courier_riga.serviceAreaCities).toEqual([])
    expect(isDeliveryAvailable('courier_riga', 'LV', effective, { city: 'Rīga' })).toBe(false)
    expect(isDeliveryAvailable('courier_latvia', 'LV', effective, { city: 'Rīga' })).toBe(false)
    expect(isDeliveryAvailable('courier', 'LV', effective, { city: 'Rīga' })).toBe(false)
    // Lockers and pickup are unaffected.
    expect(isDeliveryConfigured('pickup', 'LV', effective)).toBe(true)
    expect(isDeliveryConfigured('unisend', 'LV', effective)).toBe(true)
  })

  it('uses the €100 inclusive threshold for both couriers, not the legacy €50', () => {
    for (const method of ['courier_riga', 'courier_latvia'] as const) {
      expect(effective.delivery[method].freeFrom).toBe(100)
      expect(calcDeliveryFee(method, 99.99, 'LV', effective)).toBe(10)
      expect(calcDeliveryFee(method, 100, 'LV', effective)).toBe(0)
      expect(calcDeliveryFee(method, 100.01, 'LV', effective)).toBe(0)
    }
  })

  it('gives Unisend the 30 kg limit and keeps its €2 / €2.50 / €2.50 tariffs and LV €100 threshold', () => {
    expect(effective.delivery.unisend.maxWeightKg).toBe(30)
    expect(calcDeliveryFee('unisend', 99.99, 'LV', effective)).toBe(2)
    expect(calcDeliveryFee('unisend', 100, 'LV', effective)).toBe(0)
    expect(calcDeliveryFee('unisend', 99.99, 'LT', effective)).toBe(2.5)
    expect(calcDeliveryFee('unisend', 99.99, 'EE', effective)).toBe(2.5)
  })
})

it('fills the Unisend 30 kg limit when stored settings have none, but keeps an explicit stored value', () => {
  const stored = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  stored.delivery.unisend.maxWeightKg = null
  expect(applySpreadsheetDeliveryTariffs(stored).delivery.unisend.maxWeightKg).toBe(UNISEND_MAX_WEIGHT_KG)
  stored.delivery.unisend.maxWeightKg = 20
  expect(applySpreadsheetDeliveryTariffs(stored).delivery.unisend.maxWeightKg).toBe(20)
})

it('does not offer courier_riga while its status is draft, even with an approved city', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.courier_riga.enabled = true
  settings.delivery.courier_riga.serviceAreaCities = ['Rīga']
  expect(settings.delivery.courier_riga.status).toBe('draft')
  expect(isDeliveryAvailable('courier_riga', 'LV', settings, { city: 'Rīga' })).toBe(false)
  settings.delivery.courier_riga.status = 'ready'
  expect(isDeliveryAvailable('courier_riga', 'LV', settings, { city: 'Rīga' })).toBe(true)
  expect(isDeliveryAvailable('courier_riga', 'LT', settings, { city: 'Rīga' })).toBe(false)
})

describe('parseServiceAreaCities', () => {
  it('accepts one city per line or commas, trims and removes duplicates case-insensitively', () => {
    expect(parseServiceAreaCities('Rīga\n  Mārupe ,Jūrmala\nrīga\n\n')).toEqual(['Rīga', 'Mārupe', 'Jūrmala'])
    expect(parseServiceAreaCities('Rīga\n')).toEqual(['Rīga'])
    expect(parseServiceAreaCities('   ')).toEqual([])
  })
})
