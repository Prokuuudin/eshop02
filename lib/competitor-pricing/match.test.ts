import { describe, expect, it } from 'vitest'
import { MatchRuleError, assertMatchDecision, exclusiveKeyFor, isMatchUsableForPricing } from './match'

describe('exclusiveKeyFor', () => {
  it('is set only for trusted statuses so one competitor product maps to one trusted product', () => {
    expect(exclusiveKeyFor('confirmed', 'cp1')).toBe('cp1')
    expect(exclusiveKeyFor('manual', 'cp1')).toBe('cp1')
    for (const status of ['likely', 'ambiguous', 'rejected'] as const) expect(exclusiveKeyFor(status, 'cp1')).toBeNull()
  })
})

describe('assertMatchDecision', () => {
  it('lets automatic matchers propose only likely/ambiguous', () => {
    expect(() => assertMatchDecision({ status: 'likely', method: 'ean', decidedById: null })).not.toThrow()
    expect(() => assertMatchDecision({ status: 'ambiguous', method: 'title', decidedById: null })).not.toThrow()
    expect(() => assertMatchDecision({ status: 'confirmed', method: 'ean', decidedById: null })).toThrow(MatchRuleError)
    expect(() => assertMatchDecision({ status: 'confirmed', method: 'title', decidedById: '' })).toThrow(MatchRuleError)
  })

  it('requires a human for confirmed and manual', () => {
    expect(() => assertMatchDecision({ status: 'confirmed', method: 'ean', decidedById: 'admin-1' })).not.toThrow()
    expect(() => assertMatchDecision({ status: 'manual', method: 'manual', decidedById: 'admin-1' })).not.toThrow()
    expect(() => assertMatchDecision({ status: 'manual', method: 'manual', decidedById: null })).toThrow(MatchRuleError)
  })

  it('keeps method and status consistent', () => {
    expect(() => assertMatchDecision({ status: 'manual', method: 'ean', decidedById: 'admin-1' })).toThrow(/only valid for the manual method/)
    expect(() => assertMatchDecision({ status: 'likely', method: 'manual', decidedById: 'admin-1' })).toThrow(/manual or rejected/)
    expect(() => assertMatchDecision({ status: 'rejected', method: 'manual', decidedById: 'admin-1' })).not.toThrow()
  })
})

describe('isMatchUsableForPricing', () => {
  it('uses only trusted matches by default', () => {
    expect(isMatchUsableForPricing('confirmed', { includeLikelyMatches: false })).toBe(true)
    expect(isMatchUsableForPricing('manual', { includeLikelyMatches: false })).toBe(true)
    expect(isMatchUsableForPricing('likely', { includeLikelyMatches: false })).toBe(false)
    expect(isMatchUsableForPricing('ambiguous', { includeLikelyMatches: false })).toBe(false)
    expect(isMatchUsableForPricing('rejected', { includeLikelyMatches: false })).toBe(false)
  })

  it('never lets an automatic likely match influence pricing', () => {
    expect(isMatchUsableForPricing('likely', { includeLikelyMatches: false })).toBe(false)
  })
})
