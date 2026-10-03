import { describe, expect, it } from 'vitest'
import { normalizeObservation, observationStateHash, observationWriteAction } from './observation'

describe('normalizeObservation', () => {
  it('normalizes prices to integer cents with explicit currency', () => {
    expect(normalizeObservation({ regularPrice: '18.90', salePrice: '17.50', currency: 'eur', availability: 'in_stock' })).toEqual({
      ok: true,
      value: { regularCents: 1890, saleCents: 1750, currency: 'EUR', availability: 'in_stock' },
    })
  })

  it.each([
    ['no price at all', { currency: 'EUR' }, 'no_price'],
    ['empty strings', { regularPrice: '', salePrice: ' ', currency: 'EUR' }, 'no_price'],
    ['zero price', { regularPrice: '0', currency: 'EUR' }, 'non_positive_price'],
    ['zero with decimals', { regularPrice: '0.00', currency: 'EUR' }, 'non_positive_price'],
    ['negative price', { regularPrice: '-1.00', currency: 'EUR' }, 'non_positive_price'],
    ['locale-formatted price', { regularPrice: '18,90', currency: 'EUR' }, 'invalid_price'],
    ['NaN', { regularPrice: 'NaN', currency: 'EUR' }, 'invalid_price'],
    ['three decimals', { regularPrice: '1.005', currency: 'EUR' }, 'invalid_price'],
    ['missing currency', { regularPrice: '10.00' }, 'unsupported_currency'],
    ['foreign currency', { regularPrice: '10.00', currency: 'USD' }, 'unsupported_currency'],
    ['sale above regular', { regularPrice: '10.00', salePrice: '12.00', currency: 'EUR' }, 'sale_above_regular'],
  ])('a parse failure is never a 0 price: %s', (_label, raw, code) => {
    expect(normalizeObservation(raw)).toEqual({ ok: false, code })
  })

  it('accepts sale-only prices and drops a sale equal to regular', () => {
    expect(normalizeObservation({ salePrice: '9.99', currency: 'EUR' })).toMatchObject({ ok: true, value: { regularCents: null, saleCents: 999 } })
    expect(normalizeObservation({ regularPrice: '9.99', salePrice: '9.99', currency: 'EUR' })).toMatchObject({ ok: true, value: { saleCents: null } })
  })

  it('maps unknown availability to unknown instead of guessing', () => {
    expect(normalizeObservation({ regularPrice: '5.00', currency: 'EUR', availability: 'maybe' })).toMatchObject({ ok: true, value: { availability: 'unknown' } })
  })
})

describe('observation deduplication', () => {
  const base = { regularCents: 1890, saleCents: null, currency: 'EUR' as const, availability: 'in_stock' as const }

  it('same state ⇒ same hash ⇒ touch; any change ⇒ append', () => {
    const hash = observationStateHash(base)
    expect(observationStateHash({ ...base })).toBe(hash)
    expect(observationWriteAction(hash, hash)).toBe('touch')
    expect(observationWriteAction(hash, observationStateHash({ ...base, regularCents: 1880 }))).toBe('append')
    expect(observationWriteAction(hash, observationStateHash({ ...base, saleCents: 1700 }))).toBe('append')
    expect(observationWriteAction(hash, observationStateHash({ ...base, availability: 'out_of_stock' }))).toBe('append')
    expect(observationWriteAction(null, hash)).toBe('append')
  })

  it('does not confuse a sale price with a regular price of the same value', () => {
    expect(observationStateHash({ ...base, regularCents: null, saleCents: 1890 })).not.toBe(observationStateHash(base))
  })
})
