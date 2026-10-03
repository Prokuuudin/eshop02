import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_RULES, parsePricingRules, percentToBasisPoints, resolveStoredPricingRules } from './settings'

describe('pricing rules', () => {
  it('accepts the defaults', () => {
    expect(parsePricingRules(DEFAULT_PRICING_RULES)).toEqual({ ok: true, rules: DEFAULT_PRICING_RULES })
  })

  it.each([
    ['negative percent', { maxDecreasePercent: -1 }],
    ['percent above limit', { maxIncreasePercent: 50.01 }],
    ['more than 2 decimals', { minimumDifferencePercent: 1.005 }],
    ['non-finite percent', { maxDecreasePercent: Number.POSITIVE_INFINITY }],
    ['zero competitors', { minimumCompetitors: 0 }],
    ['fractional competitors', { minimumCompetitors: 1.5 }],
    ['both limits zero', { maxDecreasePercent: 0, maxIncreasePercent: 0 }],
    ['iqr multiplier too small', { outliers: { mode: 'iqr', iqrMultiplier: 0.1, minPointsForFiltering: 4 } }],
    ['iqr multiplier with excess precision', { outliers: { mode: 'iqr', iqrMultiplier: 1.005, minPointsForFiltering: 4 } }],
    ['unknown outlier mode', { outliers: { mode: 'zscore' } }],
    ['stale observation window too large', { maxObservationAgeHours: 24 * 31 }],
    ['likely matches enabled', { includeLikelyMatches: true }],
    ['removed sale/regular switch', { includeSalePrices: true }],
  ])('rejects %s', (_label, patch) => {
    expect(parsePricingRules({ ...DEFAULT_PRICING_RULES, ...patch }).ok).toBe(false)
  })

  it('has no working minimumMargin rule (no cost data in the project)', () => {
    expect('minimumMargin' in DEFAULT_PRICING_RULES).toBe(false)
    expect(parsePricingRules({ ...DEFAULT_PRICING_RULES, minimumMargin: 10 }).ok).toBe(false)
  })

  it('accepts outlier filtering disabled and 2-decimal percents', () => {
    const result = parsePricingRules({ ...DEFAULT_PRICING_RULES, outliers: { mode: 'none' }, maxDecreasePercent: 7.25 })
    expect(result.ok).toBe(true)
  })

  it('missing stored rules fall back to defaults, corrupt stored rules do not', () => {
    expect(resolveStoredPricingRules(null)).toEqual({ ok: true, rules: DEFAULT_PRICING_RULES })
    expect(resolveStoredPricingRules({ version: 1 }).ok).toBe(false)
  })

  it('converts percent to basis points', () => {
    expect(percentToBasisPoints(3.7)).toBe(370)
    expect(percentToBasisPoints(0.29)).toBe(29)
  })
})
