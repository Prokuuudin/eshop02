import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_PRICING_RULES } from './settings'
import {
  RecommendationTransitionError,
  availableRecommendationActions,
  openKeyFor,
  priceAuthorityFor,
  transitionRecommendation,
} from './recommendation-state'
import { isRecommendationFulfilledByErp } from './recommendation-persistence-money'
import { recommendationInputHash, type RecommendationInputSnapshot } from './recommendation-snapshot'

const local = { status: 'pending', priceAuthority: 'local', productId: 'p1' }
const erp = { status: 'pending', priceAuthority: 'erp', productId: 'p2' }

describe('transitionRecommendation', () => {
  it('applies only local-price recommendations and closes them', () => {
    expect(transitionRecommendation(local, 'apply')).toEqual({ status: 'applied', openKey: null, closedReason: null })
  })

  it('forbids direct Apply for ERP-owned prices', () => {
    expect(() => transitionRecommendation(erp, 'apply')).toThrow(RecommendationTransitionError)
    expect(() => transitionRecommendation(erp, 'apply')).toThrow(/mark the recommendation for ERP/)
  })

  it('ERP workflow: pending → erp_pending (still open) → erp_applied', () => {
    const marked = transitionRecommendation(erp, 'mark_for_erp')
    expect(marked).toEqual({ status: 'erp_pending', openKey: 'p2', closedReason: null })
    expect(transitionRecommendation({ ...erp, status: marked.status }, 'erp_observed')).toEqual({ status: 'erp_applied', openKey: null, closedReason: null })
  })

  it('cannot mark a local recommendation for ERP', () => {
    expect(() => transitionRecommendation(local, 'mark_for_erp')).toThrow(/price authority erp/)
  })

  it('ignore works from pending and erp_pending', () => {
    expect(transitionRecommendation(local, 'ignore').status).toBe('ignored')
    expect(transitionRecommendation({ ...erp, status: 'erp_pending' }, 'ignore').status).toBe('ignored')
  })

  it('invalidate requires a reason and yields stale', () => {
    expect(() => transitionRecommendation(local, 'invalidate')).toThrow(/closed reason/)
    expect(transitionRecommendation(local, 'invalidate', 'inputs_changed')).toEqual({ status: 'stale', openKey: null, closedReason: 'inputs_changed' })
  })

  it.each(['ignored', 'applied', 'erp_applied', 'stale'])('terminal status %s cannot change', (status) => {
    for (const action of ['ignore', 'apply', 'mark_for_erp', 'erp_observed', 'invalidate'] as const) {
      expect(() => transitionRecommendation({ ...local, status }, action, 'expired')).toThrow(RecommendationTransitionError)
    }
  })

  it('cannot apply twice or apply an erp_pending recommendation', () => {
    expect(() => transitionRecommendation({ ...local, status: 'applied' }, 'apply')).toThrow(/Cannot apply/)
    expect(() => transitionRecommendation({ ...erp, status: 'erp_pending' }, 'apply')).toThrow(/Cannot apply/)
  })
})

describe('openKeyFor / priceAuthorityFor / availableRecommendationActions', () => {
  it('keeps at most one open recommendation per product', () => {
    expect(openKeyFor('pending', 'p1')).toBe('p1')
    expect(openKeyFor('erp_pending', 'p1')).toBe('p1')
    expect(openKeyFor('ignored', 'p1')).toBeNull()
  })

  it('derives authority from ERP linkage', () => {
    expect(priceAuthorityFor({ externalId: null })).toBe('local')
    expect(priceAuthorityFor({ externalId: 'SKU-1' })).toBe('erp')
  })

  it('offers Apply only for local prices', () => {
    expect(availableRecommendationActions(local)).toEqual(['ignore', 'apply'])
    expect(availableRecommendationActions(erp)).toEqual(['ignore', 'mark_for_erp'])
    expect(availableRecommendationActions({ status: 'erp_pending', priceAuthority: 'erp' })).toEqual(['ignore'])
    expect(availableRecommendationActions({ status: 'applied', priceAuthority: 'local' })).toEqual([])
  })
})

describe('recommendation snapshot', () => {
  const snapshot: RecommendationInputSnapshot = {
    algorithmVersion: 'v1',
    product: { id: 'p1', price: '18.90', revision: 3, priceAuthority: 'local', erpPriceMissing: false },
    observations: [
      { observationId: 'o2', competitorId: 'c2', competitorProductId: 'cp2', matchStatus: 'manual', matchMethod: 'manual', matchConfidenceThousandths: null, regularPrice: '18.20', salePrice: null, currency: 'EUR', availability: 'in_stock', observedAt: '2026-10-03T08:00:00.000Z', lastSeenAt: '2026-10-03T10:00:00.000Z', competitorStatus: 'active', monitoringState: 'active', lastCheckStatus: 'ok', observedPrice: '18.20', marketRole: 'included', exclusionReasons: [] },
      { observationId: 'o1', competitorId: 'c1', competitorProductId: 'cp1', matchStatus: 'confirmed', matchMethod: 'ean', matchConfidenceThousandths: 980, regularPrice: '18.50', salePrice: null, currency: 'EUR', availability: 'in_stock', observedAt: '2026-10-03T08:00:00.000Z', lastSeenAt: '2026-10-03T09:00:00.000Z', competitorStatus: 'active', monitoringState: 'active', lastCheckStatus: 'ok', observedPrice: '18.50', marketRole: 'included', exclusionReasons: [] },
    ],
    analysis: {
      targetStrategy: 'match_median',
      includedCompetitors: [
        { competitorId: 'c2', observedPrice: '18.20', observationIds: ['o2'], competitorProductIds: ['cp2'] },
        { competitorId: 'c1', observedPrice: '18.50', observationIds: ['o1'], competitorProductIds: ['cp1'] },
      ],
      excludedObservations: [],
      freshnessValidThrough: '2026-10-06T09:00:00.000Z',
    },
    rules: DEFAULT_PRICING_RULES,
  }

  it('hash is stable across observation order and object key order', () => {
    const reordered = {
      ...snapshot,
      observations: [...snapshot.observations].reverse(),
      analysis: {
        ...snapshot.analysis,
        includedCompetitors: [...snapshot.analysis.includedCompetitors].reverse().map((competitor) => ({
          ...competitor,
          observationIds: [...competitor.observationIds].reverse(),
          competitorProductIds: [...competitor.competitorProductIds].reverse(),
        })),
      },
      product: { erpPriceMissing: false, priceAuthority: 'local' as const, revision: 3, price: '18.90', id: 'p1' },
    }
    expect(recommendationInputHash(reordered)).toBe(recommendationInputHash(snapshot))
  })

  it('hash changes when price, revision, market data or rules change (stale detection)', () => {
    const hash = recommendationInputHash(snapshot)
    expect(recommendationInputHash({ ...snapshot, product: { ...snapshot.product, price: '18.80' } })).not.toBe(hash)
    expect(recommendationInputHash({ ...snapshot, product: { ...snapshot.product, revision: 4 } })).not.toBe(hash)
    expect(recommendationInputHash({ ...snapshot, observations: snapshot.observations.slice(1) })).not.toBe(hash)
    expect(recommendationInputHash({ ...snapshot, rules: { ...snapshot.rules, minimumCompetitors: 3 } })).not.toBe(hash)
  })

  it('ERP fulfilment uses exact Decimal comparison and requires ERP linkage', () => {
    expect(isRecommendationFulfilledByErp({ externalId: 'SKU', price: new Prisma.Decimal('18.2') }, new Prisma.Decimal('18.20'))).toBe(true)
    expect(isRecommendationFulfilledByErp({ externalId: 'SKU', price: new Prisma.Decimal('18.21') }, '18.20')).toBe(false)
    expect(isRecommendationFulfilledByErp({ externalId: null, price: '18.20' }, '18.20')).toBe(false)
  })
})
