import { describe, expect, it } from 'vitest'
import { isPayseraCheckoutEnabled } from './paysera-checkout'

describe('isPayseraCheckoutEnabled', () => {
  it('is off when the flag is missing', () => {
    expect(isPayseraCheckoutEnabled({})).toBe(false)
  })

  it.each(['false', '1', 'TRUE', 'yes', ''])('is off for %j', (value) => {
    expect(isPayseraCheckoutEnabled({ PAYSERA_CHECKOUT_ENABLED: value })).toBe(false)
  })

  it('is on only for the exact string true', () => {
    expect(isPayseraCheckoutEnabled({ PAYSERA_CHECKOUT_ENABLED: 'true' })).toBe(true)
    expect(isPayseraCheckoutEnabled({ PAYSERA_CHECKOUT_ENABLED: ' true ' })).toBe(true)
  })
})
