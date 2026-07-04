import { describe, it, expect } from 'vitest'
import { calcDeliveryFee, DELIVERY_FEES_EUR, FREE_DELIVERY_FROM_EUR } from './delivery'

describe('calcDeliveryFee', () => {
  it('charges courier €5 below the free-delivery threshold', () => {
    expect(calcDeliveryFee('courier', 60)).toBe(5)
  })

  it('charges post €3 below the free-delivery threshold', () => {
    expect(calcDeliveryFee('post', 60)).toBe(3)
  })

  it('pickup is always free', () => {
    expect(calcDeliveryFee('pickup', 10)).toBe(0)
  })

  it('is free from €100 (threshold inclusive)', () => {
    expect(calcDeliveryFee('courier', 100)).toBe(0)
    expect(calcDeliveryFee('courier', 250)).toBe(0)
    expect(calcDeliveryFee('post', 100)).toBe(0)
  })

  it('charges just below the threshold', () => {
    expect(calcDeliveryFee('courier', 99.99)).toBe(5)
  })

  it('falls back to the courier fee for unknown or missing method', () => {
    expect(calcDeliveryFee(undefined, 60)).toBe(5)
    expect(calcDeliveryFee(null, 60)).toBe(5)
    expect(calcDeliveryFee('teleport', 60)).toBe(5)
  })

  it('exports fees in euros, not cents', () => {
    expect(DELIVERY_FEES_EUR.courier).toBe(5)
    expect(DELIVERY_FEES_EUR.post).toBe(3)
    expect(DELIVERY_FEES_EUR.pickup).toBe(0)
    expect(FREE_DELIVERY_FROM_EUR).toBe(100)
  })
})
