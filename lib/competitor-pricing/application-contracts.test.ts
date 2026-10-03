import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PRICING_ADMIN_PERMISSIONS,
  createDisconnectedPricingDashboard,
  pricingRulesDtoFromDomain,
  recommendationDtoFromDomain,
  serializeIsoDateTime,
  serializeMoneyDeltaCents,
  serializePriceCents,
  serializeSafeExternalUrl,
} from './application-contracts'
import { MAX_MONEY_CENTS } from './integer-money'
import { recommendPrice, type CompetitorPriceEvidence } from './recommendation-engine'
import { DEFAULT_PRICING_RULES } from './settings'

const NOW = new Date('2026-10-03T12:00:00.000Z')

function evidence(id: string, competitorId: string, priceCents: number): CompetitorPriceEvidence {
  return {
    observationId: `observation-${id}`,
    competitorId,
    competitorProductId: `competitor-product-${id}`,
    matchStatus: 'confirmed',
    matchMethod: 'ean',
    matchConfidenceThousandths: 980,
    observedCents: priceCents,
    regularCents: null,
    saleCents: null,
    currency: 'EUR',
    availability: 'in_stock',
    observedAt: new Date('2026-10-03T10:00:00.000Z'),
    lastSeenAt: new Date('2026-10-03T11:00:00.000Z'),
    competitorStatus: 'active',
    monitoringState: 'active',
    lastCheckStatus: 'ok',
  }
}

function recommendation(evidenceItems: CompetitorPriceEvidence[]) {
  return recommendPrice({
    now: NOW,
    product: { id: 'product-1', revision: 4, currentPriceCents: 2000, externalId: null, erpPriceMissing: false },
    evidence: evidenceItems,
    rules: {
      ...DEFAULT_PRICING_RULES,
      minimumCompetitors: 1,
      minimumDifferencePercent: 0,
      maxDecreasePercent: 50,
      maxIncreasePercent: 50,
    },
  })
}

describe('admin pricing application boundary', () => {
  it('serializes integer money without Decimal or floating-point major units', () => {
    expect(serializePriceCents(1)).toBe(1)
    expect(serializePriceCents(1230)).toBe(1230)
    expect(serializePriceCents(MAX_MONEY_CENTS)).toBe(MAX_MONEY_CENTS)
    expect(serializeMoneyDeltaCents(-1230)).toBe(-1230)
    expect(serializeMoneyDeltaCents(0)).toBe(0)
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])('rejects forbidden price cents %s', (value) => {
    expect(() => serializePriceCents(value)).toThrow(RangeError)
  })

  it('canonicalizes timezone-aware dates and rejects ambiguous local dates', () => {
    expect(serializeIsoDateTime('2026-10-03T15:00:00+03:00')).toBe('2026-10-03T12:00:00.000Z')
    expect(serializeIsoDateTime(NOW)).toBe('2026-10-03T12:00:00.000Z')
    expect(() => serializeIsoDateTime('2026-10-03T12:00:00')).toThrow(RangeError)
    expect(() => serializeIsoDateTime('not-a-date')).toThrow(RangeError)
  })

  it('serializes only https external URLs and removes query secrets and fragments', () => {
    expect(serializeSafeExternalUrl('https://shop.example/products/1?token=secret#details')).toBe('https://shop.example/products/1')
    expect(() => serializeSafeExternalUrl('http://shop.example/products/1')).toThrow(RangeError)
    expect(() => serializeSafeExternalUrl('https://user:secret@shop.example/products/1')).toThrow(RangeError)
    expect(() => serializeSafeExternalUrl('https://127.0.0.1/products/1')).toThrow(RangeError)
    expect(() => serializeSafeExternalUrl('https://service.internal/products/1')).toThrow(RangeError)
  })

  it('converts a domain recommendation into deterministic plain DTO data', () => {
    const first = recommendation([
      evidence('b', 'competitor-b', 1700),
      evidence('a', 'competitor-a', 1500),
    ])
    const second = recommendation([
      evidence('a', 'competitor-a', 1500),
      evidence('b', 'competitor-b', 1700),
    ])
    const context = {
      recommendationId: 'recommendation-1',
      status: 'pending' as const,
      calculatedAt: NOW,
      competitorNames: { 'competitor-a': 'Alpha', 'competitor-b': 'Beta' },
    }
    const firstDto = recommendationDtoFromDomain(first, context)
    const secondDto = recommendationDtoFromDomain(second, context)

    expect(firstDto).toEqual(secondDto)
    expect(firstDto.includedCompetitors.map((item) => item.competitorId)).toEqual(['competitor-a', 'competitor-b'])
    expect(firstDto.calculatedAt).toBe('2026-10-03T12:00:00.000Z')
    expect(JSON.parse(JSON.stringify(firstDto))).toEqual(firstDto)
  })

  it('preserves structured no-recommendation reasons', () => {
    const dto = recommendationDtoFromDomain(recommendation([]))
    expect(dto).toMatchObject({
      outcome: 'no_recommendation',
      reasonCode: 'no_trusted_mappings',
      reasonCodes: ['no_trusted_mappings'],
      includedCompetitors: [],
    })
  })

  it('serializes pricing rules as integer basis points', () => {
    expect(pricingRulesDtoFromDomain(DEFAULT_PRICING_RULES)).toEqual({
      version: 1,
      maxDecreaseBasisPoints: 1000,
      maxIncreaseBasisPoints: 1000,
      minimumDifferenceBasisPoints: 200,
      minimumCompetitors: 2,
      requireAvailability: true,
      outliers: { mode: 'iqr', multiplierHundredths: 150, minPointsForFiltering: 4 },
      maxObservationAgeHours: 72,
      recommendationTtlHours: 48,
    })
  })

  it('exposes the accepted permission model without inventing new permissions', () => {
    expect(PRICING_ADMIN_PERMISSIONS).toEqual({
      read: 'catalog.read',
      manageCompetitorsAndMappings: 'catalog.update',
      applyLocalPrice: 'prices.update',
    })
  })

  it('creates an honest disconnected dashboard with unknown metrics, not synthetic zeroes', () => {
    const dashboard = createDisconnectedPricingDashboard()
    expect(dashboard.connectionState).toBe('not_connected')
    expect(dashboard.products).toEqual([])
    expect(dashboard.sources).toEqual([])
    expect(Object.values(dashboard.summary).every((value) => value === null)).toBe(true)
  })

  it('names the competitor market price observedPriceCents and never takes it from regular/sale metadata', () => {
    const onSale = { ...evidence('sale', 'competitor-a', 1500), regularCents: 2500, saleCents: 1500 }
    const dto = recommendationDtoFromDomain(recommendation([onSale]))
    expect(dto.includedCompetitors).toEqual([expect.objectContaining({ competitorId: 'competitor-a', observedPriceCents: 1500 })])
    const serialized = JSON.stringify(dto)
    expect(serialized).not.toContain('effectivePrice')
    expect(serialized).not.toContain('regularPrice')
  })

  it('pricing rules DTO has no sale/regular selection switch', () => {
    expect(Object.keys(pricingRulesDtoFromDomain(DEFAULT_PRICING_RULES))).not.toContain('includeSalePrices')
  })

  it('does not import Prisma or Decimal in the application contract', () => {
    const source = readFileSync(new URL('./application-contracts.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/from ['"]@\/generated\/prisma/i)
    expect(source).not.toMatch(/^import .*\bDecimal\b/im)
  })
})
