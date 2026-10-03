import type {
  Availability,
  CheckStatus,
  CompetitorStatus,
  MatchMethod,
  MatchStatus,
  MonitoringState,
  RecommendationConfidence,
} from './constants'
import { AVAILABILITIES, CHECK_STATUSES, COMPETITOR_STATUSES, MATCH_METHODS, MATCH_STATUSES, MONITORING_STATES, isOneOf } from './constants'
import { isMatchUsableForPricing } from './match'
import { calculateMarketStatistics, filterIqrOutliers, type MarketStatistics } from './market-statistics'
import { centsToMoneyString, changeBasisPoints, isPositiveCents } from './integer-money'
import {
  recommendationInputHash,
  type RecommendationInputSnapshot,
  type SnapshotObservation,
} from './recommendation-snapshot'
import { parsePricingRules, percentToBasisPoints, type PricingRules } from './settings'

export const RECOMMENDATION_ALGORITHM_VERSION = 'market-median-v1'
export type RecommendationTargetStrategy = 'match_median'
export type RecommendationActionMode = 'local_apply' | 'erp_required' | 'apply_blocked'

export type CompetitorPriceEvidence = {
  observationId: string
  competitorId: string
  competitorProductId: string
  matchStatus: MatchStatus
  matchMethod: MatchMethod
  /** Fixed matching-rule score in thousandths; null for a manual decision. */
  matchConfidenceThousandths: number | null
  regularCents: number | null
  saleCents: number | null
  currency: string
  availability: Availability | string
  observedAt: Date
  lastSeenAt: Date
  competitorStatus: CompetitorStatus | string
  monitoringState: MonitoringState | string
  lastCheckStatus: CheckStatus | string | null
}

export type RecommendationProductInput = {
  id: string
  revision: number
  currentPriceCents: number
  externalId: string | null
  erpPriceMissing: boolean
}

export type RecommendationEngineInput = {
  now: Date
  product: RecommendationProductInput
  evidence: CompetitorPriceEvidence[]
  rules: PricingRules
}

export type EvidenceExclusionReason =
  | 'untrusted_mapping'
  | 'unsupported_currency'
  | 'invalid_price'
  | 'invalid_timestamp'
  | 'clock_anomaly'
  | 'stale_observation'
  | 'source_blocked'
  | 'source_inactive'
  | 'source_error'
  | 'unavailable'
  | 'availability_not_allowed'
  | 'conflicting_competitor_evidence'
  | 'outlier'

export type ExcludedCompetitorEvidence = {
  observationId: string
  competitorId: string
  competitorProductId: string
  reasons: EvidenceExclusionReason[]
}

export type IncludedMarketCompetitor = {
  competitorId: string
  effectivePriceCents: number
  observationIds: string[]
  competitorProductIds: string[]
  matchStatuses: Array<'confirmed' | 'manual'>
  freshestLastSeenAt: string
}

export type OutlierAnalysis = {
  mode: 'none' | 'iqr'
  applied: boolean
  q1Cents: number | null
  q3Cents: number | null
  iqrCents: number | null
  excludedCompetitorIds: string[]
}

export type MarketAnalysis = {
  statistics: MarketStatistics | null
  includedCompetitors: IncludedMarketCompetitor[]
  excludedEvidence: ExcludedCompetitorEvidence[]
  outliers: OutlierAnalysis
}

export type NoRecommendationReason =
  | 'invalid_own_price'
  | 'invalid_policy'
  | 'no_trusted_mappings'
  | 'no_fresh_observations'
  | 'no_available_competitors'
  | 'conflicting_competitor_evidence'
  | 'all_observations_excluded'
  | 'insufficient_competitors'
  | 'no_change'
  | 'difference_below_threshold'
  | 'unsupported_currency_or_data'

export type SafeguardApplied = {
  code: 'max_increase' | 'max_decrease'
  limitBasisPoints: number
  rawTargetCents: number
  clampedTargetCents: number
}

type RecommendationBase = {
  algorithmVersion: typeof RECOMMENDATION_ALGORITHM_VERSION
  targetStrategy: RecommendationTargetStrategy
  actionMode: RecommendationActionMode
  market: MarketAnalysis
  snapshot: RecommendationInputSnapshot | null
  inputHash: string | null
}

export type PriceRecommendation = Omit<RecommendationBase, 'snapshot' | 'inputHash'> & {
  outcome: 'recommendation'
  snapshot: RecommendationInputSnapshot
  inputHash: string
  reasonCode: 'increase_to_market_median' | 'decrease_to_market_median'
  currentPriceCents: number
  rawTargetPriceCents: number
  recommendedPriceCents: number
  differenceCents: number
  differenceBasisPoints: number
  safeguardsApplied: SafeguardApplied[]
  confidence: RecommendationConfidence
  /** TTL/freshness expiry; persistence may store this in PricingRecommendation.expiresAt. */
  expiresAt: string
}

export type NoPriceRecommendation = RecommendationBase & {
  outcome: 'no_recommendation'
  primaryReason: NoRecommendationReason
  reasonCodes: NoRecommendationReason[]
  details: {
    minimumCompetitors: number
    trustedEvidenceCount: number
    freshEvidenceCount: number
    availableEvidenceCount: number
    includedCompetitorCount: number
  }
  currentPriceCents: number
  rawTargetPriceCents: number | null
  safeguardedTargetPriceCents: number | null
  safeguardsApplied: SafeguardApplied[]
}

export type RecommendationEngineResult = PriceRecommendation | NoPriceRecommendation

type EligibleEvidence = {
  input: CompetitorPriceEvidence
  effectivePriceCents: number
  lastSeenMs: number
}

type MarketCompetitorInternal = {
  competitorId: string
  effectivePriceCents: number
  evidence: EligibleEvidence[]
  freshestLastSeenMs: number
}

type ClassificationCounts = {
  trusted: number
  validData: number
  fresh: number
  operational: number
  available: number
  conflicts: number
}

const EXCLUSION_ORDER: readonly EvidenceExclusionReason[] = [
  'untrusted_mapping',
  'unsupported_currency',
  'invalid_price',
  'invalid_timestamp',
  'clock_anomaly',
  'stale_observation',
  'source_blocked',
  'source_inactive',
  'source_error',
  'unavailable',
  'availability_not_allowed',
  'conflicting_competitor_evidence',
  'outlier',
]

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function evidenceKey(evidence: CompetitorPriceEvidence): string {
  return `${evidence.competitorId}\u0000${evidence.competitorProductId}\u0000${evidence.observationId}`
}

function sortReasons(reasons: Iterable<EvidenceExclusionReason>): EvidenceExclusionReason[] {
  const unique = new Set(reasons)
  return EXCLUSION_ORDER.filter((reason) => unique.has(reason))
}

function actionModeFor(product: RecommendationProductInput): RecommendationActionMode {
  if (product.externalId !== null) return 'erp_required'
  return product.erpPriceMissing ? 'apply_blocked' : 'local_apply'
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function effectivePrice(evidence: CompetitorPriceEvidence, includeSalePrices: boolean): number | null {
  const regularValid = evidence.regularCents === null || isPositiveCents(evidence.regularCents)
  const saleValid = evidence.saleCents === null || isPositiveCents(evidence.saleCents)
  if (!regularValid || !saleValid) return null
  if (evidence.regularCents === null && evidence.saleCents === null) return null
  if (evidence.regularCents !== null && evidence.saleCents !== null && evidence.saleCents > evidence.regularCents) return null
  return includeSalePrices && evidence.saleCents !== null ? evidence.saleCents : evidence.regularCents
}

function addExcluded(
  excluded: Map<string, ExcludedCompetitorEvidence>,
  evidence: CompetitorPriceEvidence,
  ...reasons: EvidenceExclusionReason[]
): void {
  const existing = excluded.get(evidence.observationId)
  excluded.set(evidence.observationId, {
    observationId: evidence.observationId,
    competitorId: evidence.competitorId,
    competitorProductId: evidence.competitorProductId,
    reasons: sortReasons([...(existing?.reasons ?? []), ...reasons]),
  })
}

function classifyEvidence(
  evidence: readonly CompetitorPriceEvidence[],
  nowMs: number,
  rules: PricingRules,
): { candidates: EligibleEvidence[]; excluded: Map<string, ExcludedCompetitorEvidence>; counts: ClassificationCounts } {
  const candidates: EligibleEvidence[] = []
  const excluded = new Map<string, ExcludedCompetitorEvidence>()
  const counts: ClassificationCounts = { trusted: 0, validData: 0, fresh: 0, operational: 0, available: 0, conflicts: 0 }
  const maxAgeMs = rules.maxObservationAgeHours * 60 * 60 * 1000
  const cutoffMs = nowMs - maxAgeMs

  for (const item of [...evidence].sort((a, b) => compareText(evidenceKey(a), evidenceKey(b)))) {
    if (!isOneOf(MATCH_STATUSES, item.matchStatus) || !isMatchUsableForPricing(item.matchStatus, { includeLikelyMatches: false })) {
      addExcluded(excluded, item, 'untrusted_mapping')
      continue
    }
    counts.trusted += 1

    if (item.currency !== 'EUR') {
      addExcluded(excluded, item, 'unsupported_currency')
      continue
    }
    const price = effectivePrice(item, rules.includeSalePrices)
    if (price === null) {
      addExcluded(excluded, item, 'invalid_price')
      continue
    }
    if (!validDate(item.observedAt) || !validDate(item.lastSeenAt) || item.observedAt.getTime() > item.lastSeenAt.getTime()) {
      addExcluded(excluded, item, 'invalid_timestamp')
      continue
    }
    counts.validData += 1

    const lastSeenMs = item.lastSeenAt.getTime()
    if (lastSeenMs > nowMs || item.observedAt.getTime() > nowMs) {
      addExcluded(excluded, item, 'clock_anomaly')
      continue
    }
    if (lastSeenMs < cutoffMs) {
      addExcluded(excluded, item, 'stale_observation')
      continue
    }
    counts.fresh += 1

    if (item.competitorStatus === 'blocked' || item.lastCheckStatus === 'blocked') {
      addExcluded(excluded, item, 'source_blocked')
      continue
    }
    if (item.competitorStatus !== 'active' || item.monitoringState !== 'active') {
      addExcluded(excluded, item, 'source_inactive')
      continue
    }
    if (item.lastCheckStatus !== 'ok') {
      addExcluded(excluded, item, 'source_error')
      continue
    }
    counts.operational += 1

    if (!isOneOf(AVAILABILITIES, item.availability)) {
      addExcluded(excluded, item, 'availability_not_allowed')
      continue
    }
    if (item.availability === 'out_of_stock') {
      addExcluded(excluded, item, 'unavailable')
      continue
    }
    if (rules.requireAvailability && item.availability !== 'in_stock') {
      addExcluded(excluded, item, 'availability_not_allowed')
      continue
    }
    counts.available += 1
    candidates.push({ input: item, effectivePriceCents: price, lastSeenMs })
  }

  return { candidates, excluded, counts }
}

function collapseCompetitors(
  candidates: readonly EligibleEvidence[],
  excluded: Map<string, ExcludedCompetitorEvidence>,
  counts: ClassificationCounts,
): MarketCompetitorInternal[] {
  const grouped = new Map<string, EligibleEvidence[]>()
  for (const candidate of candidates) {
    const group = grouped.get(candidate.input.competitorId) ?? []
    group.push(candidate)
    grouped.set(candidate.input.competitorId, group)
  }

  const competitors: MarketCompetitorInternal[] = []
  for (const competitorId of [...grouped.keys()].sort(compareText)) {
    const group = grouped.get(competitorId)!.sort((a, b) => compareText(evidenceKey(a.input), evidenceKey(b.input)))
    const prices = new Set(group.map((candidate) => candidate.effectivePriceCents))
    if (prices.size !== 1) {
      counts.conflicts += 1
      for (const candidate of group) addExcluded(excluded, candidate.input, 'conflicting_competitor_evidence')
      continue
    }
    competitors.push({
      competitorId,
      effectivePriceCents: group[0].effectivePriceCents,
      evidence: group,
      freshestLastSeenMs: group.reduce((latest, candidate) => Math.max(latest, candidate.lastSeenMs), group[0].lastSeenMs),
    })
  }
  return competitors
}

function publicCompetitor(competitor: MarketCompetitorInternal): IncludedMarketCompetitor {
  const statuses = [...new Set(competitor.evidence.map(({ input }) => input.matchStatus as 'confirmed' | 'manual'))].sort(compareText)
  return {
    competitorId: competitor.competitorId,
    effectivePriceCents: competitor.effectivePriceCents,
    observationIds: competitor.evidence.map(({ input }) => input.observationId).sort(compareText),
    competitorProductIds: [...new Set(competitor.evidence.map(({ input }) => input.competitorProductId))].sort(compareText),
    matchStatuses: statuses,
    freshestLastSeenAt: new Date(competitor.freshestLastSeenMs).toISOString(),
  }
}

function safeMoneyString(cents: number | null): string | null {
  if (cents === null || !Number.isSafeInteger(cents)) return null
  try {
    return centsToMoneyString(cents)
  } catch {
    return null
  }
}

function safeIso(date: Date): string {
  return validDate(date) ? date.toISOString() : '[invalid-date]'
}

function buildSnapshot(
  input: RecommendationEngineInput,
  included: readonly MarketCompetitorInternal[],
  excluded: readonly ExcludedCompetitorEvidence[],
): RecommendationInputSnapshot {
  const roles = new Map<string, SnapshotObservation['marketRole']>()
  for (const competitor of included) {
    competitor.evidence.forEach((candidate, index) => {
      roles.set(candidate.input.observationId, index === 0 ? 'included' : 'collapsed_duplicate')
    })
  }
  for (const item of excluded) roles.set(item.observationId, 'excluded')
  const excludedById = new Map(excluded.map((item) => [item.observationId, item]))
  const freshnessValidThroughMs = included.reduce<number | null>((earliest, competitor) => {
    const validThrough = competitor.freshestLastSeenMs + input.rules.maxObservationAgeHours * 60 * 60 * 1000
    return earliest === null ? validThrough : Math.min(earliest, validThrough)
  }, null)

  return {
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    product: {
      id: input.product.id,
      price: centsToMoneyString(input.product.currentPriceCents),
      revision: input.product.revision,
      priceAuthority: input.product.externalId === null ? 'local' : 'erp',
      erpPriceMissing: input.product.erpPriceMissing,
    },
    observations: [...input.evidence]
      .sort((a, b) => compareText(evidenceKey(a), evidenceKey(b)))
      .map((item): SnapshotObservation => ({
        observationId: item.observationId,
        competitorId: item.competitorId,
        competitorProductId: item.competitorProductId,
        matchStatus: isOneOf(MATCH_STATUSES, item.matchStatus) ? item.matchStatus : 'ambiguous',
        matchMethod: isOneOf(MATCH_METHODS, item.matchMethod) ? item.matchMethod : 'title',
        matchConfidenceThousandths: Number.isInteger(item.matchConfidenceThousandths) ? item.matchConfidenceThousandths : null,
        regularPrice: safeMoneyString(item.regularCents),
        salePrice: safeMoneyString(item.saleCents),
        currency: item.currency,
        availability: item.availability,
        observedAt: safeIso(item.observedAt),
        lastSeenAt: safeIso(item.lastSeenAt),
        competitorStatus: isOneOf(COMPETITOR_STATUSES, item.competitorStatus) ? item.competitorStatus : 'blocked',
        monitoringState: isOneOf(MONITORING_STATES, item.monitoringState) ? item.monitoringState : 'gone',
        lastCheckStatus: isOneOf(CHECK_STATUSES, item.lastCheckStatus) ? item.lastCheckStatus : null,
        effectivePrice: safeMoneyString(effectivePrice(item, input.rules.includeSalePrices)),
        marketRole: roles.get(item.observationId) ?? 'excluded',
        exclusionReasons: excludedById.get(item.observationId)?.reasons ?? [],
      })),
    analysis: {
      targetStrategy: 'match_median',
      includedCompetitors: included.map((competitor) => ({
        competitorId: competitor.competitorId,
        effectivePrice: centsToMoneyString(competitor.effectivePriceCents),
        observationIds: competitor.evidence.map(({ input: item }) => item.observationId).sort(compareText),
        competitorProductIds: [...new Set(competitor.evidence.map(({ input: item }) => item.competitorProductId))].sort(compareText),
      })),
      excludedObservations: excluded.map((item) => ({ observationId: item.observationId, reasons: item.reasons })),
      freshnessValidThrough: freshnessValidThroughMs === null ? null : new Date(freshnessValidThroughMs).toISOString(),
    },
    rules: input.rules,
  }
}

function emptyMarket(): MarketAnalysis {
  return {
    statistics: null,
    includedCompetitors: [],
    excludedEvidence: [],
    outliers: { mode: 'none', applied: false, q1Cents: null, q3Cents: null, iqrCents: null, excludedCompetitorIds: [] },
  }
}

function noRecommendation(
  input: RecommendationEngineInput,
  actionMode: RecommendationActionMode,
  market: MarketAnalysis,
  counts: ClassificationCounts,
  primaryReason: NoRecommendationReason,
  snapshot: RecommendationInputSnapshot | null,
  rawTargetPriceCents: number | null = null,
  safeguardedTargetPriceCents: number | null = null,
  safeguardsApplied: SafeguardApplied[] = [],
): NoPriceRecommendation {
  return {
    outcome: 'no_recommendation',
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    targetStrategy: 'match_median',
    actionMode,
    market,
    snapshot,
    inputHash: snapshot === null ? null : recommendationInputHash(snapshot),
    primaryReason,
    reasonCodes: [primaryReason],
    details: {
      minimumCompetitors: input.rules.minimumCompetitors,
      trustedEvidenceCount: counts.trusted,
      freshEvidenceCount: counts.fresh,
      availableEvidenceCount: counts.available,
      includedCompetitorCount: market.includedCompetitors.length,
    },
    currentPriceCents: input.product.currentPriceCents,
    rawTargetPriceCents,
    safeguardedTargetPriceCents,
    safeguardsApplied,
  }
}

function clampTarget(currentCents: number, rawTargetCents: number, rules: PricingRules): { value: number; safeguards: SafeguardApplied[] } {
  const basis = 10_000n
  const current = BigInt(currentCents)
  const decreaseBps = percentToBasisPoints(rules.maxDecreasePercent)
  const increaseBps = percentToBasisPoints(rules.maxIncreasePercent)
  const minimumNumerator = current * BigInt(10_000 - decreaseBps)
  const minimum = Number((minimumNumerator + basis - 1n) / basis)
  const maximum = Number((current * BigInt(10_000 + increaseBps)) / basis)
  if (rawTargetCents < minimum) {
    return { value: minimum, safeguards: [{ code: 'max_decrease', limitBasisPoints: decreaseBps, rawTargetCents, clampedTargetCents: minimum }] }
  }
  if (rawTargetCents > maximum) {
    return { value: maximum, safeguards: [{ code: 'max_increase', limitBasisPoints: increaseBps, rawTargetCents, clampedTargetCents: maximum }] }
  }
  return { value: rawTargetCents, safeguards: [] }
}

function differenceMeetsThreshold(currentCents: number, targetCents: number, thresholdBasisPoints: number): boolean {
  return BigInt(Math.abs(targetCents - currentCents)) * 10_000n >= BigInt(currentCents) * BigInt(thresholdBasisPoints)
}

function confidenceFor(included: readonly MarketCompetitorInternal[], nowMs: number, rules: PricingRules): RecommendationConfidence {
  const maxAgeMs = rules.maxObservationAgeHours * 60 * 60 * 1000
  const allVeryFresh = included.every((competitor) => (nowMs - competitor.freshestLastSeenMs) * 2 <= maxAgeMs)
  return included.length >= 3 && allVeryFresh ? 'high' : 'medium'
}

function primaryExclusionReason(counts: ClassificationCounts): NoRecommendationReason {
  if (counts.trusted === 0) return 'no_trusted_mappings'
  if (counts.validData === 0) return 'unsupported_currency_or_data'
  if (counts.fresh === 0) return 'no_fresh_observations'
  if (counts.operational === 0) return 'all_observations_excluded'
  if (counts.available === 0) return 'no_available_competitors'
  if (counts.conflicts > 0) return 'conflicting_competitor_evidence'
  return 'all_observations_excluded'
}

export function recommendPrice(input: RecommendationEngineInput): RecommendationEngineResult {
  const actionMode = actionModeFor(input.product)
  const emptyCounts: ClassificationCounts = { trusted: 0, validData: 0, fresh: 0, operational: 0, available: 0, conflicts: 0 }
  if (!validDate(input.now) || !isPositiveCents(input.product.currentPriceCents)) {
    return noRecommendation(input, actionMode, emptyMarket(), emptyCounts, 'invalid_own_price', null)
  }
  if (!parsePricingRules(input.rules).ok) {
    return noRecommendation(input, actionMode, emptyMarket(), emptyCounts, 'invalid_policy', null)
  }

  const classified = classifyEvidence(input.evidence, input.now.getTime(), input.rules)
  let competitors = collapseCompetitors(classified.candidates, classified.excluded, classified.counts)
  const multiplier = input.rules.outliers.mode === 'iqr' ? Math.round(input.rules.outliers.iqrMultiplier * 100) : 0
  const outlierResult = input.rules.outliers.mode === 'iqr'
    ? filterIqrOutliers(
      competitors.map((competitor) => ({ key: competitor.competitorId, priceCents: competitor.effectivePriceCents })),
      multiplier,
      input.rules.outliers.minPointsForFiltering,
    )
    : { included: competitors.map((competitor) => ({ key: competitor.competitorId, priceCents: competitor.effectivePriceCents })), excluded: [], applied: false, q1Cents: null, q3Cents: null, iqrCents: null }
  const outlierIds = new Set(outlierResult.excluded.map(({ key }) => key))
  for (const competitor of competitors) {
    if (outlierIds.has(competitor.competitorId)) {
      for (const evidence of competitor.evidence) addExcluded(classified.excluded, evidence.input, 'outlier')
    }
  }
  competitors = competitors.filter((competitor) => !outlierIds.has(competitor.competitorId)).sort((a, b) => compareText(a.competitorId, b.competitorId))
  const excluded = [...classified.excluded.values()].sort((a, b) => compareText(a.observationId, b.observationId))
  const includedPublic = competitors.map(publicCompetitor)
  const statistics = competitors.length === 0
    ? null
    : calculateMarketStatistics(competitors.map(({ effectivePriceCents }) => effectivePriceCents), input.product.currentPriceCents)
  const market: MarketAnalysis = {
    statistics,
    includedCompetitors: includedPublic,
    excludedEvidence: excluded,
    outliers: {
      mode: input.rules.outliers.mode,
      applied: outlierResult.applied,
      q1Cents: outlierResult.q1Cents,
      q3Cents: outlierResult.q3Cents,
      iqrCents: outlierResult.iqrCents,
      excludedCompetitorIds: [...outlierIds].sort(compareText),
    },
  }
  const snapshot = buildSnapshot(input, competitors, excluded)

  if (competitors.length === 0) {
    return noRecommendation(input, actionMode, market, classified.counts, primaryExclusionReason(classified.counts), snapshot)
  }
  if (competitors.length < input.rules.minimumCompetitors) {
    return noRecommendation(input, actionMode, market, classified.counts, 'insufficient_competitors', snapshot)
  }

  const rawTarget = statistics!.medianCents
  const clamped = clampTarget(input.product.currentPriceCents, rawTarget, input.rules)
  if (clamped.value === input.product.currentPriceCents) {
    return noRecommendation(input, actionMode, market, classified.counts, 'no_change', snapshot, rawTarget, clamped.value, clamped.safeguards)
  }
  const minimumDifferenceBps = percentToBasisPoints(input.rules.minimumDifferencePercent)
  if (!differenceMeetsThreshold(input.product.currentPriceCents, clamped.value, minimumDifferenceBps)) {
    return noRecommendation(input, actionMode, market, classified.counts, 'difference_below_threshold', snapshot, rawTarget, clamped.value, clamped.safeguards)
  }

  const ttlExpiryMs = input.now.getTime() + input.rules.recommendationTtlHours * 60 * 60 * 1000
  const freshnessExpiryMs = snapshot.analysis.freshnessValidThrough === null
    ? ttlExpiryMs
    : new Date(snapshot.analysis.freshnessValidThrough).getTime() + 1
  const recommended = clamped.value
  return {
    outcome: 'recommendation',
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    targetStrategy: 'match_median',
    actionMode,
    market,
    snapshot,
    inputHash: recommendationInputHash(snapshot),
    reasonCode: recommended > input.product.currentPriceCents ? 'increase_to_market_median' : 'decrease_to_market_median',
    currentPriceCents: input.product.currentPriceCents,
    rawTargetPriceCents: rawTarget,
    recommendedPriceCents: recommended,
    differenceCents: recommended - input.product.currentPriceCents,
    differenceBasisPoints: changeBasisPoints(input.product.currentPriceCents, recommended),
    safeguardsApplied: clamped.safeguards,
    confidence: confidenceFor(competitors, input.now.getTime(), input.rules),
    expiresAt: new Date(Math.min(ttlExpiryMs, freshnessExpiryMs)).toISOString(),
  }
}
