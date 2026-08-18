import { describe, expect, it } from 'vitest'
import { availableOrderStatuses } from './order-config'

describe('availableOrderStatuses', () => {
  it('keeps the current status and exposes only valid forward transitions', () => {
    expect(availableOrderStatuses('pending')).toEqual(['pending', 'confirmed', 'cancelled'])
    expect(availableOrderStatuses('confirmed')).toEqual(['confirmed', 'shipped', 'cancelled'])
    expect(availableOrderStatuses('shipped')).toEqual(['shipped', 'delivered'])
  })

  it('does not offer transitions from terminal statuses', () => {
    expect(availableOrderStatuses('delivered')).toEqual(['delivered'])
    expect(availableOrderStatuses('cancelled')).toEqual(['cancelled'])
  })
})
