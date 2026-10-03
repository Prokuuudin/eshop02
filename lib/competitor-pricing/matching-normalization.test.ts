import { describe, expect, it } from 'vitest'
import {
  normalizeBrand,
  normalizeGtin,
  normalizeSku,
  normalizeTitle,
  parseSize,
  resolveSize,
  titleDiceSimilarity,
} from './matching-normalization'

describe('GTIN normalization', () => {
  it.each([
    ['96385074', 'gtin_8'],
    ['036000291452', 'gtin_12'],
    ['4006381333931', 'gtin_13'],
    ['10012345000017', 'gtin_14'],
  ] as const)('validates %s including its check digit', (value, format) => {
    expect(normalizeGtin(value)).toEqual({ kind: 'valid_gtin', value, format })
  })

  it('preserves a leading zero while allowing only harmless display separators', () => {
    expect(normalizeGtin(' 036-000 291452 ')).toEqual({ kind: 'valid_gtin', value: '036000291452', format: 'gtin_12' })
  })

  it('classifies invalid check digits separately from valid GTIN', () => {
    expect(normalizeGtin('4006381333932')).toEqual({ kind: 'legacy_barcode', value: '4006381333932', reason: 'invalid_check_digit' })
  })

  it.each([
    ['12345', 'non_standard_length'],
    ['BMISK', 'non_numeric'],
  ] as const)('retains %s only as a legacy barcode-like value', (value, reason) => {
    expect(normalizeGtin(value)).toEqual({ kind: 'legacy_barcode', value, reason })
  })

  it('rejects oversized identifiers without turning a prefix into identity', () => {
    expect(normalizeGtin('1'.repeat(201))).toMatchObject({ kind: 'legacy_barcode', reason: 'too_long' })
  })
})

describe('conservative text normalization', () => {
  it('normalizes SKU case and whitespace but preserves punctuation', () => {
    expect(normalizeSku('  Ab-123  ')).toBe('ab-123')
    expect(normalizeSku('AB-123')).not.toBe(normalizeSku('AB123'))
    expect(normalizeSku('AB  123')).toBe('ab 123')
  })

  it('treats missing and oversized SKU as unavailable evidence', () => {
    expect(normalizeSku(null)).toBeNull()
    expect(normalizeSku('x'.repeat(201))).toBeNull()
    expect(normalizeGtin(null)).toEqual({ kind: 'missing' })
  })

  it('normalizes brand case, whitespace and punctuation', () => {
    expect(normalizeBrand('  WELLA   PROFESSIONALS ')).toBe('wella professionals')
    expect(normalizeBrand('Acme / Pro')).toBe(normalizeBrand('acme-pro'))
  })

  it('does not invent a fuzzy brand alias or remove diacritics', () => {
    expect(normalizeBrand("L'Oréal")).not.toBe(normalizeBrand('Loreal'))
  })

  it('preserves important title numbers and treats harmless token reordering as exact token evidence', () => {
    const left = normalizeTitle('Color Cream № 09 — 250 ml')
    const right = normalizeTitle('250 ml Color Cream 09')
    expect(left.tokenKey).toBe(right.tokenKey)
    expect(left.numericTokens).toEqual(['9'])
    expect(titleDiceSimilarity(left, right)).toBe(1)
  })

  it('keeps different shade/model numbers distinct', () => {
    expect(normalizeTitle('Color 09').numericTokens).not.toEqual(normalizeTitle('Color 10').numericTokens)
  })

  it('recognizes only explicit product-kind, refill, set and gender markers', () => {
    expect(normalizeTitle('Men Shampoo Refill Kit')).toMatchObject({
      productKinds: ['shampoo'],
      hasRefillMarker: true,
      hasSetMarker: true,
      gender: 'male',
    })
    expect(normalizeTitle('Women Conditioner')).toMatchObject({ productKinds: ['conditioner'], gender: 'female' })
  })
})

describe('size and multipack normalization', () => {
  it('normalizes 250 ml and 0.25 l to the same integer representation', () => {
    expect(parseSize('250 ml')).toEqual(parseSize('0.25 l'))
    expect(parseSize('250 ml')).toMatchObject({ kind: 'known', value: { kind: 'single', amountMilli: 250_000, unit: 'ml' } })
  })

  it('normalizes 500 g and 0.5 kg to the same integer representation', () => {
    expect(parseSize('500 g')).toEqual(parseSize('0.5 kg'))
    expect(parseSize('500 g')).toMatchObject({ kind: 'known', value: { kind: 'single', amountMilli: 500_000, unit: 'g' } })
  })

  it('keeps different sizes different', () => {
    expect(parseSize('250 ml')).not.toEqual(parseSize('500 ml'))
  })

  it('does not collapse a multipack into equal total volume', () => {
    expect(parseSize('2 × 250 ml')).toMatchObject({ kind: 'known', value: { kind: 'multipack', count: 2, item: { amountMilli: 250_000 } } })
    expect(parseSize('2 x 250 ml')).not.toEqual(parseSize('500 ml'))
  })

  it('recognizes an explicit piece count', () => {
    expect(parseSize('2 pcs')).toMatchObject({ kind: 'known', value: { kind: 'count', count: 2, unit: 'pcs' } })
  })

  it('does not guess when multiple sizes or size plus count are present', () => {
    expect(parseSize('250 ml + 500 ml')).toEqual({ kind: 'ambiguous' })
    expect(parseSize('250 ml, 2 pcs')).toEqual({ kind: 'ambiguous' })
  })

  it('returns unknown for text without an unambiguous supported unit', () => {
    expect(parseSize('large salon bottle')).toEqual({ kind: 'unknown' })
    expect(parseSize('12 oz')).toEqual({ kind: 'unknown' })
  })

  it('combines independent size sources only when they agree', () => {
    expect(resolveSize('0.25 l', 'Shampoo 250 ml')).toMatchObject({ kind: 'known' })
    expect(resolveSize('500 ml', 'Shampoo 250 ml')).toEqual({ kind: 'ambiguous' })
    expect(resolveSize('500 ml', 'Set 2 x 250 ml')).toEqual({ kind: 'ambiguous' })
  })
})
