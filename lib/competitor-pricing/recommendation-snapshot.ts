import { createHash } from 'node:crypto'
import type { PricingRules } from './settings'
import type { CheckStatus, CompetitorStatus, MatchMethod, MatchStatus, MonitoringState, PriceAuthority } from './constants'

// Immutable input snapshot stored with every PricingRecommendation. It is enough to
// explain the decision, audit it, reproduce it (same algorithm version + snapshot ⇒ same
// result) and detect staleness (recompute snapshot now → different inputHash ⇒ stale).
// Money is stored as canonical "12.34" strings, never floats.

export type SnapshotObservation = {
  observationId: string
  competitorId: string
  competitorProductId: string
  matchStatus: MatchStatus
  matchMethod: MatchMethod
  matchConfidenceThousandths: number | null
  regularPrice: string | null
  salePrice: string | null
  currency: string
  availability: string
  observedAt: string
  lastSeenAt: string
  competitorStatus: CompetitorStatus
  monitoringState: MonitoringState
  lastCheckStatus: CheckStatus | null
  observedPrice: string | null
  marketRole: 'included' | 'collapsed_duplicate' | 'excluded'
  exclusionReasons: string[]
}

export type SnapshotMarketCompetitor = {
  competitorId: string
  observedPrice: string
  observationIds: string[]
  competitorProductIds: string[]
}

export type RecommendationAnalysisSnapshot = {
  targetStrategy: 'match_median'
  includedCompetitors: SnapshotMarketCompetitor[]
  excludedObservations: Array<{ observationId: string; reasons: string[] }>
  /** Inclusive freshness boundary derived from evidence, not from a random clock tick. */
  freshnessValidThrough: string | null
}

export type RecommendationInputSnapshot = {
  algorithmVersion: string
  product: {
    id: string
    price: string
    revision: number
    priceAuthority: PriceAuthority
    erpPriceMissing: boolean
  }
  observations: SnapshotObservation[]
  analysis: RecommendationAnalysisSnapshot
  rules: PricingRules
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Order-independent for observations (sorted by id) and key-order independent. */
export function recommendationInputHash(snapshot: RecommendationInputSnapshot): string {
  const normalized = {
    ...snapshot,
    observations: [...snapshot.observations]
      .map((observation) => ({ ...observation, exclusionReasons: [...observation.exclusionReasons].sort() }))
      .sort((a, b) => compareStrings(a.observationId, b.observationId)),
    analysis: {
      ...snapshot.analysis,
      includedCompetitors: [...snapshot.analysis.includedCompetitors]
        .map((competitor) => ({
          ...competitor,
          observationIds: [...competitor.observationIds].sort(),
          competitorProductIds: [...competitor.competitorProductIds].sort(),
        }))
        .sort((a, b) => compareStrings(a.competitorId, b.competitorId)),
      excludedObservations: [...snapshot.analysis.excludedObservations]
        .map((observation) => ({ ...observation, reasons: [...observation.reasons].sort() }))
        .sort((a, b) => compareStrings(a.observationId, b.observationId)),
    },
  }
  return createHash('sha256').update(canonicalJson(normalized)).digest('hex')
}
