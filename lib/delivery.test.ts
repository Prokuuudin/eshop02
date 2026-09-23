import { describe, it, expect } from 'vitest'
import { applySpreadsheetDeliveryTariffs, calcDeliveryFee, DELIVERY_FEES_EUR, FREE_DELIVERY_FROM_EUR } from './delivery'

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

  it('is free only over €200 for Latvian courier delivery', () => {
    expect(calcDeliveryFee('courier', 100)).toBe(10)
    expect(calcDeliveryFee('courier', 200)).toBe(10)
    expect(calcDeliveryFee('courier', 200.01)).toBe(0)
    expect(calcDeliveryFee('courier', 250)).toBe(0)
    expect(calcDeliveryFee('post', 250)).toBe(4)
    expect(calcDeliveryFee('venipak', 250)).toBe(3)
  })

  it('charges just below the threshold', () => {
    expect(calcDeliveryFee('courier', 199.99)).toBe(10)
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
    expect(FREE_DELIVERY_FROM_EUR).toBe(200)
  })
})

import { DEFAULT_COMMERCE_SETTINGS } from './commerce-settings'
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
  expect(calcDeliveryFee('post', 200, 'LV', settings)).toBe(4)
  expect(calcDeliveryFee('post', 200.01, 'LV', settings)).toBe(0)
  expect(calcDeliveryFee('post', 499, 'LT', settings)).toBe(8)
  expect(calcDeliveryFee('post', 500, 'LT', settings)).toBe(8)
  expect(calcDeliveryFee('post', 500.01, 'LT', settings)).toBe(0)
})

it('overrides saved tariffs without changing availability or explicit null thresholds', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.venipak.enabled = false
  settings.delivery.omniva.price = 99
  settings.delivery.omniva.countryPrices = { LV: { price: 99, freeFrom: null }, EE: { price: 99, freeFrom: 500 } }
  const result = applySpreadsheetDeliveryTariffs(settings)
  expect(result.delivery.omniva.price).toBe(4)
  expect(result.delivery.omniva.countryPrices?.LV).toEqual({ price: 4, freeFrom: null })
  expect(result.delivery.omniva.countryPrices?.EE).toEqual({ price: 8, freeFrom: 500 })
  expect(result.delivery.venipak.enabled).toBe(false)
  expect(settings.delivery.omniva.price).toBe(99)
})

it('honours an explicitly disabled free-delivery threshold', () => {
  const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
  settings.delivery.omniva.freeFrom = null
  expect(calcDeliveryFee('post', 1000, 'LV', settings)).toBe(4)
})

it('uses new carrier prices from the updated workbook with no inferred free thresholds', () => {
  for (const [method, prices] of Object.entries({ unisend: [2, 2.5, 2.5], unisend_courier: [5, 5, 5], expresspasts: [2.5, 4, 4], expresspasts_courier: [10, 10, 25], venipak_courier: [10, 15, 15] })) {
    for (const [index, country] of (['LV', 'LT', 'EE'] as const).entries()) {
      expect(calcDeliveryFee(method, 1000, country)).toBe(prices[index])
      expect(calcDeliveryFee(method, 1000, country, DEFAULT_COMMERCE_SETTINGS)).toBe(prices[index])
    }
  }
})
