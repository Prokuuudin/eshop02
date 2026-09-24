import { describe, expect, it } from 'vitest'
import directory from '@/data/delivery-locations.json'
import { getDeliveryLocations, resolveDeliveryLocation } from './delivery-locations'

describe('customer delivery directories', () => {
  it('imports all records once despite the three identical Unisend files', () => {
    expect(directory.locations).toHaveLength(4135)
    const keys = directory.locations.map(location => `${location.provider}:${location.country}:${location.id}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(directory.locations.filter(location => location.provider === 'unisend')).toHaveLength(1391)
  })

  it('filters lockers by carrier and country without charging pickup outlets the locker tariff', () => {
    expect(getDeliveryLocations('post', 'LV').length).toBeGreaterThan(300)
    expect(getDeliveryLocations('post', 'LT').length).toBeGreaterThan(300)
    expect(getDeliveryLocations('post', 'EE').length).toBeGreaterThan(300)
    expect(getDeliveryLocations('venipak', 'LV')).toHaveLength(283)
    expect(getDeliveryLocations('venipak', 'LT')).toHaveLength(475)
    expect(getDeliveryLocations('venipak', 'EE')).toHaveLength(280)
    expect(getDeliveryLocations('unisend', 'LV')).toHaveLength(554)
    expect(getDeliveryLocations('unisend', 'LT')).toHaveLength(531)
    expect(getDeliveryLocations('unisend', 'EE')).toHaveLength(306)
    expect(getDeliveryLocations('unisend_courier', 'LV')).toEqual([])
  })

  it('resolves Omniva only within the requested country', () => {
    const terminal = getDeliveryLocations('post', 'LV')[0]
    expect(resolveDeliveryLocation('post', 'LV', terminal.id)).toEqual(terminal)
    expect(resolveDeliveryLocation('post', terminal.country === 'LV' ? 'EE' : 'LV', terminal.id)).toBeNull()
  })

  it('preserves leading zero IDs and resolves only within the correct country and carrier', () => {
    const terminal = resolveDeliveryLocation('unisend', 'LT', '0023')
    expect(terminal?.id).toBe('0023')
    expect(terminal?.postalCode).toBe('06112')
    expect(resolveDeliveryLocation('unisend', 'LV', '0023')).toBeNull()
    expect(resolveDeliveryLocation('venipak', 'LT', '0023')).toBeNull()
    expect(resolveDeliveryLocation('venipak', 'LT', '1001')).toBeNull()
  })
})
