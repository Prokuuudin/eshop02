import { describe, expect, it } from 'vitest'
import type { ParsedListing } from './adapters/types'
import {
  candidateGenerationHints,
  matchCompetitorProduct,
  type ProductMatchCandidate,
} from './matching-engine'

const listing = (overrides: Partial<ParsedListing> = {}): ParsedListing => ({
  ok: true,
  url: 'https://fixture.invalid/product',
  sourceProductId: 'source-1',
  title: 'Fixture Shampoo 250 ml',
  brand: 'Fixture Brand',
  ean: null,
  manufacturerSku: null,
  sizeText: '250 ml',
  observation: { observedCents: 1000, regularCents: null, saleCents: null, currency: 'EUR', availability: 'in_stock' },
  aggregate: null,
  warnings: [],
  ...overrides,
})

const product = (id: string, overrides: Partial<ProductMatchCandidate> = {}): ProductMatchCandidate => ({
  id,
  barcode: null,
  sku: null,
  title: 'Fixture Shampoo 250 ml',
  brand: 'Fixture Brand',
  specVolume: '250 ml',
  category: 'hair',
  externalId: null,
  ...overrides,
})

describe('candidate-generation contract', () => {
  it('exposes indexable exact keys without touching Prisma', () => {
    expect(candidateGenerationHints(listing({ ean: '4006381333931', manufacturerSku: ' Ab-123 ' }))).toEqual({
      validGtin: '4006381333931',
      exactSku: 'ab-123',
      exactBrand: 'fixture brand',
      titleTokens: ['fixture', 'shampoo'],
      sizeKey: 'single:250000:ml',
    })
  })

  it('does not expose an invalid check-digit barcode as a GTIN lookup key', () => {
    expect(candidateGenerationHints(listing({ ean: '4006381333932' })).validGtin).toBeNull()
  })
})

describe('GTIN evidence', () => {
  it('returns a strong but still untrusted candidate for one exact valid GTIN', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p1', { barcode: '4006381333931' })],
    })
    expect(result).toMatchObject({ result: 'likely', proposedStatus: 'likely', candidateProductId: 'p1', method: 'ean', confidence: 0.98, reasons: ['unique_gtin_exact'] })
    expect(result.candidates[0].evidence).toContain('gtin_exact')
  })

  it('preserves a leading zero as part of UPC/GTIN identity', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '036000291452' }),
      candidates: [product('right', { barcode: '036000291452' }), product('wrong', { barcode: '36000291452' })],
    })
    expect(result).toMatchObject({ result: 'likely', candidateProductId: 'right' })
    expect(result.candidates.find((candidate) => candidate.productId === 'wrong')?.evidence).not.toContain('gtin_exact')
  })

  it('does not use an invalid check digit as GTIN evidence', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333932', title: 'Unrelated', brand: null, sizeText: null }),
      candidates: [product('p1', { barcode: '4006381333932', title: 'Other', brand: '', specVolume: null })],
    })
    expect(result).toMatchObject({ result: 'no_match', proposedStatus: null })
    expect(result.normalized.gtin).toMatchObject({ kind: 'legacy_barcode', reason: 'invalid_check_digit' })
  })

  it('returns ambiguous rather than selecting the first duplicate GTIN claimant', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p2', { barcode: '4006381333931' }), product('p1', { barcode: '4006381333931' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: null, method: 'ean', reasons: ['duplicate_gtin'] })
    expect(result.candidates.filter((candidate) => candidate.evidence.includes('gtin_exact'))).toHaveLength(2)
  })

  it('surfaces an exact GTIN plus contradictory size as ambiguous', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p1', { barcode: '4006381333931', title: 'Fixture Shampoo 500 ml', specVolume: '500 ml' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: 'p1', confidence: 0.5, reasons: ['conflicting_evidence'] })
    expect(result.conflictingEvidence[0].conflicts).toContain('size_mismatch')
  })

  it('surfaces shampoo versus conditioner even behind an exact GTIN', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p1', { barcode: '4006381333931', title: 'Fixture Conditioner 250 ml' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', reasons: ['conflicting_evidence'] })
    expect(result.conflictingEvidence[0].conflicts).toContain('product_kind_mismatch')
  })
})

describe('SKU and brand evidence', () => {
  it('accepts one exact SKU only with a compatible exact-normalized brand', () => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'AB-123', brand: '  FIXTURE   BRAND ' }),
      candidates: [product('p1', { sku: 'ab-123' })],
    })
    expect(result).toMatchObject({ result: 'likely', candidateProductId: 'p1', method: 'sku', confidence: 0.9, reasons: ['unique_sku_brand_exact'] })
  })

  it('returns ambiguous for exact SKU with a conflicting brand', () => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'AB-123', brand: 'Brand A' }),
      candidates: [product('p1', { sku: 'AB-123', brand: 'Brand B' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: 'p1', reasons: ['conflicting_evidence'] })
    expect(result.conflictingEvidence[0].conflicts).toContain('brand_mismatch')
  })

  it('requires manual review when SKU matches but one side has no brand', () => {
    expect(matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'AB-123', brand: null }),
      candidates: [product('p1', { sku: 'AB-123' })],
    })).toMatchObject({ result: 'ambiguous', confidence: 0.6, reasons: ['sku_requires_compatible_brand'] })
  })

  it('returns ambiguous for a duplicate SKU even when one candidate sorts first', () => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'AB-123' }),
      candidates: [product('p2', { sku: 'AB-123' }), product('p1', { sku: 'AB-123' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: null, reasons: ['duplicate_sku'] })
  })

  it('does not erase punctuation to make AB-123 and AB123 exact', () => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'AB-123', title: 'Unrelated', brand: null, sizeText: null }),
      candidates: [product('p1', { sku: 'AB123', title: 'Other', brand: '', specVolume: null })],
    })
    expect(result).toMatchObject({ result: 'no_match' })
    expect(result.candidates[0].evidence).not.toContain('sku_exact')
  })

  it('does not treat a fuzzy brand spelling as an alias', () => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'SKU-1', brand: "L'Oréal" }),
      candidates: [product('p1', { sku: 'SKU-1', brand: 'Loreal' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', reasons: ['conflicting_evidence'] })
  })
})

describe('title, size and pack evidence', () => {
  it('uses exact brand + order-independent title tokens + exact size as a likely candidate only', () => {
    const result = matchCompetitorProduct({
      listing: listing({ title: 'Shampoo Fixture 0.25 l', sizeText: '0.25 l' }),
      candidates: [product('p1', { title: 'Fixture Shampoo 250 ml', specVolume: '250 ml' })],
    })
    expect(result).toMatchObject({ result: 'likely', proposedStatus: 'likely', candidateProductId: 'p1', method: 'title', confidence: 0.78, reasons: ['brand_title_size_exact'] })
  })

  it('keeps title-only matching ambiguous even when normalized titles are equal', () => {
    const result = matchCompetitorProduct({
      listing: listing({ brand: null, sizeText: null, title: 'Fixture Shampoo' }),
      candidates: [product('p1', { brand: '', specVolume: null, title: 'Shampoo Fixture' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: null, confidence: 0.4, reasons: ['weak_candidates_only'] })
  })

  it('uses similar titles from different lines of the same brand only for manual ranking', () => {
    const result = matchCompetitorProduct({
      listing: listing({ title: 'Fixture Fusion Repair Shampoo', sizeText: null }),
      candidates: [product('p1', { title: 'Fixture Invigo Repair Shampoo', specVolume: null })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: null, proposedStatus: 'ambiguous', reasons: ['weak_candidates_only'] })
    expect(result.candidates[0]).toMatchObject({ evidence: expect.arrayContaining(['brand_exact', 'title_similar']) })
  })

  it('does not call the same title reliable when size differs', () => {
    const result = matchCompetitorProduct({
      listing: listing({ title: 'Fixture Shampoo', sizeText: '250 ml' }),
      candidates: [product('p1', { title: 'Fixture Shampoo', specVolume: '500 ml' })],
    })
    expect(result).toMatchObject({ result: 'ambiguous' })
    expect(result.conflictingEvidence[0].conflicts).toContain('size_mismatch')
  })

  it('does not equate a 2×250 ml multipack with one 500 ml item', () => {
    const result = matchCompetitorProduct({
      listing: listing({ title: 'Fixture Shampoo', sizeText: '2 x 250 ml' }),
      candidates: [product('p1', { title: 'Fixture Shampoo', specVolume: '500 ml' })],
    })
    expect(result.conflictingEvidence[0].conflicts).toContain('size_mismatch')
  })

  it.each([
    ['shade/model number', 'Fixture Color 09 250 ml', 'Fixture Color 10 250 ml', 'numeric_identity_mismatch'],
    ['refill', 'Fixture Shampoo Refill 250 ml', 'Fixture Shampoo 250 ml', 'refill_mismatch'],
    ['set/kit', 'Fixture Shampoo Set 250 ml', 'Fixture Shampoo 250 ml', 'set_mismatch'],
    ['gender', 'Men Fixture Shampoo 250 ml', 'Women Fixture Shampoo 250 ml', 'gender_mismatch'],
  ] as const)('surfaces a %s conflict instead of hiding it behind exact SKU/brand', (_label, competitorTitle, productTitle, conflict) => {
    const result = matchCompetitorProduct({
      listing: listing({ manufacturerSku: 'SKU-1', title: competitorTitle }),
      candidates: [product('p1', { sku: 'SKU-1', title: productTitle })],
    })
    expect(result).toMatchObject({ result: 'ambiguous', reasons: ['conflicting_evidence'] })
    expect(result.conflictingEvidence[0].conflicts).toContain(conflict)
  })

  it('returns ambiguous when two products have equally strong semantic evidence', () => {
    const result = matchCompetitorProduct({ listing: listing(), candidates: [product('p1'), product('p2')] })
    expect(result).toMatchObject({ result: 'ambiguous', candidateProductId: null, reasons: ['weak_candidates_only'] })
  })

  it('does not use externalId as competitor identity', () => {
    const local = listing({ title: 'Unrelated', brand: null, sizeText: null })
    const without = matchCompetitorProduct({ listing: local, candidates: [product('p1', { title: 'Other', brand: '', specVolume: null, externalId: null })] })
    const withExternalId = matchCompetitorProduct({ listing: local, candidates: [product('p1', { title: 'Other', brand: '', specVolume: null, externalId: 'ERP-123' })] })
    expect(withExternalId).toEqual(without)
  })
})

describe('existing and rejected matches', () => {
  it.each(['confirmed', 'manual'] as const)('protects an existing %s match from automatic replacement', (status) => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('new', { barcode: '4006381333931' })],
      existingMatch: { productId: 'trusted', status },
    })
    expect(result).toMatchObject({ result: 'protected', proposedStatus: null, candidateProductId: 'trusted', confidence: null, reasons: ['existing_trusted_match'], candidates: [] })
  })

  it('excludes a rejected candidate while matching evidence is unchanged', () => {
    const source = listing({ ean: '4006381333931' })
    const candidate = product('p1', { barcode: '4006381333931' })
    const evidenceKey = matchCompetitorProduct({ listing: source, candidates: [candidate] }).candidates[0].evidenceKey
    const result = matchCompetitorProduct({
      listing: source,
      candidates: [candidate],
      rejectedCandidates: [{ productId: 'p1', evidenceKey }],
    })
    expect(result).toMatchObject({ result: 'no_match', reasons: ['all_candidates_rejected'], excludedRejectedProductIds: ['p1'] })
  })

  it('also protects a legacy rejection with no evidence fingerprint', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p1', { barcode: '4006381333931' })],
      existingMatch: { productId: 'p1', status: 'rejected', evidenceKey: null },
    })
    expect(result).toMatchObject({ result: 'no_match', excludedRejectedProductIds: ['p1'] })
  })

  it('reconsiders a rejected candidate only when normalized evidence changed', () => {
    const result = matchCompetitorProduct({
      listing: listing({ ean: '4006381333931' }),
      candidates: [product('p1', { barcode: '4006381333931' })],
      rejectedCandidates: [{ productId: 'p1', evidenceKey: '{"old":"evidence"}' }],
    })
    expect(result).toMatchObject({ result: 'likely', candidateProductId: 'p1', reconsideredRejectedProductIds: ['p1'] })
  })

  it('treats a changed local Product identity as new evidence for a rejected pair', () => {
    const source = listing({ ean: '4006381333931' })
    const before = product('p1', { barcode: '4006381333931', title: 'Old Fixture Shampoo 250 ml' })
    const rejectedEvidenceKey = matchCompetitorProduct({ listing: source, candidates: [before] }).candidates[0].evidenceKey
    const after = product('p1', { barcode: '4006381333931', title: 'Fixture Shampoo 250 ml' })
    const result = matchCompetitorProduct({
      listing: source,
      candidates: [after],
      rejectedCandidates: [{ productId: 'p1', evidenceKey: rejectedEvidenceKey }],
    })
    expect(result).toMatchObject({ result: 'likely', reconsideredRejectedProductIds: ['p1'] })
  })
})
