import { describe, expect, it } from 'vitest'
import type { CompetitorPriceEvidence, RecommendationEngineInput } from './recommendation-engine'
import { recommendPrice } from './recommendation-engine'
import { DEFAULT_PRICING_RULES, type PricingRules } from './settings'

const NOW = new Date('2026-10-03T12:00:00.000Z')

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000)
}

function evidence(id: string, priceCents: number, patch: Partial<CompetitorPriceEvidence> = {}): CompetitorPriceEvidence {
  return {
    observationId: `observation-${id}`,
    competitorId: `competitor-${id}`,
    competitorProductId: `competitor-product-${id}`,
    matchStatus: 'confirmed',
    matchMethod: 'ean',
    matchConfidenceThousandths: 980,
    regularCents: priceCents,
    saleCents: null,
    currency: 'EUR',
    availability: 'in_stock',
    observedAt: hoursBefore(2),
    lastSeenAt: hoursBefore(1),
    competitorStatus: 'active',
    monitoringState: 'active',
    lastCheckStatus: 'ok',
    ...patch,
  }
}

function pricingRules(patch: Partial<PricingRules> = {}): PricingRules {
  return { ...DEFAULT_PRICING_RULES, ...patch }
}

function input(
  marketEvidence: CompetitorPriceEvidence[],
  options: {
    currentPriceCents?: number
    externalId?: string | null
    erpPriceMissing?: boolean
    rules?: Partial<PricingRules>
    now?: Date
  } = {},
): RecommendationEngineInput {
  return {
    now: options.now ?? NOW,
    product: {
      id: 'product-1',
      revision: 7,
      currentPriceCents: options.currentPriceCents ?? 2000,
      externalId: options.externalId ?? null,
      erpPriceMissing: options.erpPriceMissing ?? false,
    },
    evidence: marketEvidence,
    rules: pricingRules(options.rules),
  }
}

const oneCompetitorRules: Partial<PricingRules> = {
  minimumCompetitors: 1,
  minimumDifferencePercent: 0,
  maxDecreasePercent: 50,
  maxIncreasePercent: 50,
}

describe('trusted mapping and evidence filtering', () => {
  it.each(['confirmed', 'manual'] as const)('includes trusted %s mappings', (matchStatus) => {
    const result = recommendPrice(input([
      evidence('trusted', 1500, { matchStatus, matchMethod: matchStatus === 'manual' ? 'manual' : 'ean' }),
    ], { rules: oneCompetitorRules }))

    expect(result.market.includedCompetitors).toHaveLength(1)
    expect(result.market.includedCompetitors[0].matchStatuses).toEqual([matchStatus])
  })

  it.each(['likely', 'ambiguous', 'rejected'] as const)('excludes untrusted %s mappings', (matchStatus) => {
    const result = recommendPrice(input([evidence('untrusted', 1500, { matchStatus })], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_trusted_mappings' })
    expect(result.market.excludedEvidence).toMatchObject([{ reasons: ['untrusted_mapping'] }])
  })

  it('excludes unsupported currency without FX conversion', () => {
    const result = recommendPrice(input([evidence('usd', 1500, { currency: 'USD' })], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'unsupported_currency_or_data' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['unsupported_currency'])
  })

  it('excludes structurally invalid competitor money', () => {
    const result = recommendPrice(input([evidence('bad-price', 0)], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'unsupported_currency_or_data' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['invalid_price'])
  })
})

describe('freshness and operational state', () => {
  it('uses lastSeenAt and includes an observation exactly at the 72-hour boundary', () => {
    const result = recommendPrice(input([
      evidence('boundary', 1500, { observedAt: hoursBefore(100), lastSeenAt: hoursBefore(72) }),
    ], { rules: oneCompetitorRules }))

    expect(result.market.includedCompetitors).toHaveLength(1)
  })

  it('excludes a stale observation beyond the boundary', () => {
    const result = recommendPrice(input([
      evidence('stale', 1500, { observedAt: hoursBefore(101), lastSeenAt: hoursBefore(73) }),
    ], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_fresh_observations' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['stale_observation'])
  })

  it('fails closed on a future lastSeenAt clock anomaly', () => {
    const future = new Date(NOW.getTime() + 1)
    const result = recommendPrice(input([evidence('future', 1500, { observedAt: future, lastSeenAt: future })], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_fresh_observations' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['clock_anomaly'])
  })

  it.each([
    ['competitor blocked', { competitorStatus: 'blocked' }, 'source_blocked'],
    ['product paused', { monitoringState: 'paused' }, 'source_inactive'],
    ['last check failed', { lastCheckStatus: 'fetch_error' }, 'source_error'],
  ] as const)('excludes evidence when %s', (_label, patch, reason) => {
    const result = recommendPrice(input([evidence('operational', 1500, patch)], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'all_observations_excluded' })
    expect(result.market.excludedEvidence[0].reasons).toEqual([reason])
  })
})

describe('availability policy', () => {
  it('includes in-stock evidence', () => {
    expect(recommendPrice(input([evidence('stock', 1500)], { rules: oneCompetitorRules })).market.includedCompetitors).toHaveLength(1)
  })

  it('always excludes out-of-stock evidence', () => {
    const result = recommendPrice(input([evidence('out', 1500, { availability: 'out_of_stock' })], {
      rules: { ...oneCompetitorRules, requireAvailability: false },
    }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_available_competitors' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['unavailable'])
  })

  it.each(['unknown', 'preorder'] as const)('excludes %s by default', (availability) => {
    const result = recommendPrice(input([evidence(availability, 1500, { availability })], { rules: oneCompetitorRules }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_available_competitors' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['availability_not_allowed'])
  })

  it('can include unknown and preorder when availability is not required', () => {
    const result = recommendPrice(input([
      evidence('unknown', 1500, { availability: 'unknown' }),
      evidence('preorder', 1600, { availability: 'preorder' }),
    ], { rules: { ...oneCompetitorRules, requireAvailability: false, minimumCompetitors: 2 } }))

    expect(result.market.includedCompetitors).toHaveLength(2)
  })

  it.each(['limited_availability', 'backorder', 'discontinued', 'sold_out'])('fails closed on unsupported availability %s', (availability) => {
    const result = recommendPrice(input([evidence('unsupported', 1500, { availability })], { rules: oneCompetitorRules }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_available_competitors' })
    expect(result.market.excludedEvidence[0].reasons).toEqual(['availability_not_allowed'])
  })
})

describe('one price per competitor', () => {
  it('collapses multiple pages from the same competitor when prices agree', () => {
    const result = recommendPrice(input([
      evidence('page-a', 1500, { competitorId: 'same-shop' }),
      evidence('page-b', 1500, { competitorId: 'same-shop' }),
    ], { rules: oneCompetitorRules }))

    expect(result.market.statistics?.count).toBe(1)
    expect(result.market.includedCompetitors).toMatchObject([{
      competitorId: 'same-shop',
      effectivePriceCents: 1500,
      observationIds: ['observation-page-a', 'observation-page-b'],
    }])
    expect(result.snapshot?.observations.map(({ marketRole }) => marketRole)).toEqual(['included', 'collapsed_duplicate'])
  })

  it('excludes one competitor entirely when its trusted pages disagree', () => {
    const result = recommendPrice(input([
      evidence('page-a', 1500, { competitorId: 'same-shop' }),
      evidence('page-b', 1600, { competitorId: 'same-shop' }),
    ], { rules: oneCompetitorRules }))

    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'conflicting_competitor_evidence' })
    expect(result.market.includedCompetitors).toEqual([])
    expect(result.market.excludedEvidence).toHaveLength(2)
    expect(result.market.excludedEvidence.every(({ reasons }) => reasons.includes('conflicting_competitor_evidence'))).toBe(true)
  })
})

describe('recommendation target and safeguards', () => {
  it('recommends an unclamped increase to the market median', () => {
    const result = recommendPrice(input([evidence('a', 1200), evidence('b', 1400)], {
      currentPriceCents: 1000,
      rules: { ...oneCompetitorRules, minimumCompetitors: 2 },
    }))

    expect(result).toMatchObject({
      outcome: 'recommendation',
      reasonCode: 'increase_to_market_median',
      rawTargetPriceCents: 1300,
      recommendedPriceCents: 1300,
      differenceCents: 300,
      differenceBasisPoints: 3000,
      safeguardsApplied: [],
    })
  })

  it('recommends an unclamped decrease to the market median', () => {
    const result = recommendPrice(input([evidence('a', 1600), evidence('b', 1800)], {
      rules: { ...oneCompetitorRules, minimumCompetitors: 2 },
    }))
    expect(result).toMatchObject({ outcome: 'recommendation', rawTargetPriceCents: 1700, recommendedPriceCents: 1700 })
  })

  it('returns no recommendation when current already equals the target', () => {
    const result = recommendPrice(input([evidence('same', 2000)], { rules: oneCompetitorRules }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'no_change', rawTargetPriceCents: 2000 })
  })

  it('applies the meaningful-difference threshold after rounding and safeguards', () => {
    const result = recommendPrice(input([evidence('small', 1990)], {
      rules: { ...oneCompetitorRules, minimumDifferencePercent: 1 },
    }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'difference_below_threshold' })
  })

  it('treats an exact meaningful-difference boundary as recommendable', () => {
    const result = recommendPrice(input([evidence('boundary', 1980)], {
      rules: { ...oneCompetitorRules, minimumDifferencePercent: 1 },
    }))
    expect(result).toMatchObject({ outcome: 'recommendation', recommendedPriceCents: 1980 })
  })

  it('clamps a large decrease with ceiling rounding so the limit is never exceeded', () => {
    const result = recommendPrice(input([evidence('low', 1000)], {
      rules: { ...oneCompetitorRules, maxDecreasePercent: 10 },
    }))
    expect(result).toMatchObject({
      outcome: 'recommendation',
      rawTargetPriceCents: 1000,
      recommendedPriceCents: 1800,
      safeguardsApplied: [{ code: 'max_decrease', limitBasisPoints: 1000, clampedTargetCents: 1800 }],
    })
  })

  it('clamps a large increase with floor rounding so the limit is never exceeded', () => {
    const result = recommendPrice(input([evidence('high', 3000)], {
      rules: { ...oneCompetitorRules, maxIncreasePercent: 10 },
    }))
    expect(result).toMatchObject({
      outcome: 'recommendation',
      rawTargetPriceCents: 3000,
      recommendedPriceCents: 2200,
      safeguardsApplied: [{ code: 'max_increase', limitBasisPoints: 1000, clampedTargetCents: 2200 }],
    })
  })

  it('rounds a half-cent increase bound down', () => {
    const result = recommendPrice(input([evidence('high', 200)], {
      currentPriceCents: 105,
      rules: { ...oneCompetitorRules, maxIncreasePercent: 10 },
    }))
    expect(result).toMatchObject({ outcome: 'recommendation', recommendedPriceCents: 115 })
  })

  it('rounds a half-cent decrease bound up', () => {
    const result = recommendPrice(input([evidence('low', 1)], {
      currentPriceCents: 105,
      rules: { ...oneCompetitorRules, maxDecreasePercent: 10 },
    }))
    expect(result).toMatchObject({ outcome: 'recommendation', recommendedPriceCents: 95 })
  })

  it('requires the configured number of independent competitors', () => {
    const result = recommendPrice(input([evidence('only', 1500)], { rules: { minimumCompetitors: 2 } }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'insufficient_competitors' })
  })

  it('uses sale only when includeSalePrices is enabled', () => {
    const item = evidence('sale', 2000, { saleCents: 1500 })
    expect(recommendPrice(input([item], { rules: oneCompetitorRules }))).toMatchObject({
      outcome: 'no_recommendation', primaryReason: 'no_change',
    })
    expect(recommendPrice(input([item], { rules: { ...oneCompetitorRules, includeSalePrices: true } }))).toMatchObject({
      outcome: 'recommendation', rawTargetPriceCents: 1500,
    })
  })
})

describe('outlier handling', () => {
  it('excludes an extreme high price and records the reason', () => {
    const result = recommendPrice(input([
      evidence('a', 1000), evidence('b', 1000), evidence('c', 1000), evidence('high', 10_000),
    ], {
      rules: { ...oneCompetitorRules, minimumCompetitors: 3, outliers: { mode: 'iqr', iqrMultiplier: 1.5, minPointsForFiltering: 4 } },
    }))

    expect(result.market.statistics?.count).toBe(3)
    expect(result.market.outliers).toMatchObject({ applied: true, excludedCompetitorIds: ['competitor-high'] })
    expect(result.market.excludedEvidence.find(({ observationId }) => observationId === 'observation-high')?.reasons).toEqual(['outlier'])
  })

  it('does not filter an extreme value below the configured minimum sample size', () => {
    const result = recommendPrice(input([evidence('a', 1000), evidence('b', 1000), evidence('high', 10_000)], {
      rules: { ...oneCompetitorRules, minimumCompetitors: 3, outliers: { mode: 'iqr', iqrMultiplier: 1.5, minPointsForFiltering: 4 } },
    }))
    expect(result.market.outliers.applied).toBe(false)
    expect(result.market.statistics?.count).toBe(3)
  })

  it('can disable outlier filtering explicitly', () => {
    const result = recommendPrice(input([
      evidence('a', 1000), evidence('b', 1000), evidence('c', 1000), evidence('high', 10_000),
    ], { rules: { ...oneCompetitorRules, minimumCompetitors: 4, outliers: { mode: 'none' } } }))
    expect(result.market.outliers).toMatchObject({ mode: 'none', applied: false, excludedCompetitorIds: [] })
    expect(result.market.statistics?.count).toBe(4)
  })
})

describe('ERP/local action behavior', () => {
  it.each([
    ['ERP-linked', { externalId: 'ERP-1', erpPriceMissing: false }, 'erp_required'],
    ['local', { externalId: null, erpPriceMissing: false }, 'local_apply'],
    ['missing ERP price', { externalId: null, erpPriceMissing: true }, 'apply_blocked'],
  ] as const)('%s products receive action mode %s', (_label, product, actionMode) => {
    const result = recommendPrice(input([evidence('market', 1500)], {
      ...product,
      rules: oneCompetitorRules,
    }))
    expect(result.actionMode).toBe(actionMode)
    expect(result).toMatchObject({ outcome: 'recommendation', recommendedPriceCents: 1500 })
  })
})

describe('determinism, snapshots and safety', () => {
  it('produces identical result and hash for every competitor input order', () => {
    const items = [evidence('c', 1700), evidence('a', 1500), evidence('b', 1600)]
    const first = recommendPrice(input(items, { rules: { ...oneCompetitorRules, minimumCompetitors: 3 } }))
    const second = recommendPrice(input([items[1], items[2], items[0]], { rules: { ...oneCompetitorRules, minimumCompetitors: 3 } }))

    expect(second).toEqual(first)
    expect(second.inputHash).toBe(first.inputHash)
  })

  it('does not hash an arbitrary now value while freshness classification is unchanged', () => {
    const item = evidence('stable', 1500)
    const first = recommendPrice(input([item], { rules: oneCompetitorRules, now: NOW }))
    const second = recommendPrice(input([item], {
      rules: oneCompetitorRules,
      now: new Date(NOW.getTime() + 60 * 60 * 1000),
    }))
    expect(second.inputHash).toBe(first.inputHash)
  })

  it('changes the snapshot/hash when freshness changes the included set', () => {
    const item = evidence('aging', 1500, { observedAt: hoursBefore(72), lastSeenAt: hoursBefore(71) })
    const fresh = recommendPrice(input([item], { rules: oneCompetitorRules, now: NOW }))
    const stale = recommendPrice(input([item], {
      rules: oneCompetitorRules,
      now: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
    }))
    expect(fresh.market.includedCompetitors).toHaveLength(1)
    expect(stale.market.includedCompetitors).toHaveLength(0)
    expect(stale.inputHash).not.toBe(fresh.inputHash)
  })

  it('expires no later than the earliest included freshness boundary', () => {
    const item = evidence('aging', 1500, { observedAt: hoursBefore(72), lastSeenAt: hoursBefore(71) })
    const result = recommendPrice(input([item], { rules: { ...oneCompetitorRules, recommendationTtlHours: 48 } }))
    expect(result).toMatchObject({ outcome: 'recommendation' })
    if (result.outcome === 'recommendation') {
      expect(result.snapshot.analysis.freshnessValidThrough).toBe('2026-10-03T13:00:00.000Z')
      expect(result.expiresAt).toBe('2026-10-03T13:00:00.001Z')
    }
  })

  it.each([0, -1, 1_000_000_000_000])('rejects invalid own price %s', (currentPriceCents) => {
    const result = recommendPrice(input([evidence('market', 1500)], { currentPriceCents, rules: oneCompetitorRules }))
    expect(result).toMatchObject({ outcome: 'no_recommendation', primaryReason: 'invalid_own_price', snapshot: null, inputHash: null })
  })

  it('keeps percentage math overflow-safe at the Decimal(12,2) ceiling', () => {
    const result = recommendPrice(input([evidence('minimum', 1)], {
      currentPriceCents: 999_999_999_999,
      rules: { ...oneCompetitorRules, maxDecreasePercent: 50 },
    }))
    expect(result).toMatchObject({
      outcome: 'recommendation',
      recommendedPriceCents: 500_000_000_000,
      differenceBasisPoints: -5000,
    })
  })

  it('reports medium confidence for two sources and high for three very fresh sources', () => {
    const medium = recommendPrice(input([evidence('a', 1500), evidence('b', 1600)], {
      rules: { ...oneCompetitorRules, minimumCompetitors: 2 },
    }))
    const high = recommendPrice(input([evidence('a', 1500), evidence('b', 1600), evidence('c', 1700)], {
      rules: { ...oneCompetitorRules, minimumCompetitors: 3 },
    }))
    expect(medium).toMatchObject({ outcome: 'recommendation', confidence: 'medium' })
    expect(high).toMatchObject({ outcome: 'recommendation', confidence: 'high' })
  })
})
