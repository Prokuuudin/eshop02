import { describe, expect, it } from 'vitest'
import { normalizeObservation, observationStateHash, observationWriteAction, type NormalizedObservation } from './observation'

describe('normalizeObservation', () => {
  it('a single observed price stays observed only — never regular or sale', () => {
    expect(normalizeObservation({ observedPrice: '12.34', currency: 'eur', availability: 'in_stock' })).toEqual({
      ok: true,
      value: { observedCents: 1234, regularCents: null, saleCents: null, currency: 'EUR', availability: 'in_stock' },
    })
  })

  it('proven sale: sale = observed below a declared regular price', () => {
    expect(normalizeObservation({ observedPrice: '15.20', regularPrice: '19.00', salePrice: '15.20', currency: 'EUR' })).toEqual({
      ok: true,
      value: { observedCents: 1520, regularCents: 1900, saleCents: 1520, currency: 'EUR', availability: 'unknown' },
    })
  })

  it('declared regular equal to observed without sale is valid', () => {
    expect(normalizeObservation({ observedPrice: '20.00', regularPrice: '20.00', currency: 'EUR' })).toMatchObject({ ok: true, value: { regularCents: 2000, saleCents: null } })
  })

  it.each([
    ['no observed price', { regularPrice: '10.00', currency: 'EUR' }, 'no_price'],
    ['empty observed', { observedPrice: '', currency: 'EUR' }, 'no_price'],
    ['zero', { observedPrice: '0', currency: 'EUR' }, 'non_positive_price'],
    ['zero with decimals', { observedPrice: '0.00', currency: 'EUR' }, 'non_positive_price'],
    ['negative', { observedPrice: '-1.00', currency: 'EUR' }, 'non_positive_price'],
    ['locale comma', { observedPrice: '18,90', currency: 'EUR' }, 'invalid_price'],
    ['grouping', { observedPrice: '1,234.56', currency: 'EUR' }, 'invalid_price'],
    ['currency symbol', { observedPrice: '€12.34', currency: 'EUR' }, 'invalid_price'],
    ['surrounding space', { observedPrice: ' 12.34', currency: 'EUR' }, 'invalid_price'],
    ['NaN', { observedPrice: 'NaN', currency: 'EUR' }, 'invalid_price'],
    ['three decimals', { observedPrice: '1.005', currency: 'EUR' }, 'invalid_price'],
    ['exponent', { observedPrice: '1e3', currency: 'EUR' }, 'invalid_price'],
    ['out of Decimal(12,2) range', { observedPrice: '10000000000.00', currency: 'EUR' }, 'invalid_price'],
    ['missing currency', { observedPrice: '10.00' }, 'missing_currency'],
    ['blank currency', { observedPrice: '10.00', currency: '  ' }, 'missing_currency'],
    ['foreign currency', { observedPrice: '10.00', currency: 'USD' }, 'unsupported_currency'],
    ['invalid regular', { observedPrice: '10.00', regularPrice: '10,00', currency: 'EUR' }, 'invalid_price'],
    ['sale without regular', { observedPrice: '9.00', salePrice: '9.00', currency: 'EUR' }, 'inconsistent_price_semantics'],
    ['sale different from observed', { observedPrice: '9.00', regularPrice: '12.00', salePrice: '8.00', currency: 'EUR' }, 'inconsistent_price_semantics'],
    ['sale not below regular', { observedPrice: '12.00', regularPrice: '12.00', salePrice: '12.00', currency: 'EUR' }, 'inconsistent_price_semantics'],
    ['regular above observed without sale', { observedPrice: '9.00', regularPrice: '12.00', currency: 'EUR' }, 'inconsistent_price_semantics'],
  ])('a parse failure is never a 0 price: %s', (_label, raw, code) => {
    expect(normalizeObservation(raw)).toEqual({ ok: false, code })
  })

  it('maps unknown availability to unknown instead of guessing', () => {
    expect(normalizeObservation({ observedPrice: '5.00', currency: 'EUR', availability: 'maybe' })).toMatchObject({ ok: true, value: { availability: 'unknown' } })
  })
})

describe('observation deduplication', () => {
  const base: NormalizedObservation = { observedCents: 1200, regularCents: null, saleCents: null, currency: 'EUR', availability: 'in_stock' }

  it('same state ⇒ same hash ⇒ touch; observed €12 → €13 ⇒ append', () => {
    const hash = observationStateHash(base)
    expect(observationStateHash({ ...base })).toBe(hash)
    expect(observationWriteAction(hash, hash)).toBe('touch')
    expect(observationWriteAction(hash, observationStateHash({ ...base, observedCents: 1300 }))).toBe('append')
    expect(observationWriteAction(hash, observationStateHash({ ...base, availability: 'out_of_stock' }))).toBe('append')
    expect(observationWriteAction(null, hash)).toBe('append')
  })

  it('a change of only proven regular/sale metadata appends', () => {
    const sale: NormalizedObservation = { ...base, regularCents: 1500, saleCents: 1200 }
    const regularOnly: NormalizedObservation = { ...base, regularCents: 1200 }
    const hashes = new Set([base, sale, regularOnly, { ...sale, regularCents: 1600 }].map(observationStateHash))
    expect(hashes.size).toBe(4)
  })

  it('A → B → A yields three appends, never a touch of the first A', () => {
    const a = observationStateHash(base)
    const b = observationStateHash({ ...base, observedCents: 1300 })
    expect([observationWriteAction(null, a), observationWriteAction(a, b), observationWriteAction(b, a)]).toEqual(['append', 'append', 'append'])
  })
})
