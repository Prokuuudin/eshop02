import type { AdminPermission } from '@/lib/admin-permissions'
import type {
  MatchMethod,
  MatchStatus,
  RecommendationConfidence,
  RecommendationStatus,
  RunStatus,
  RunTrigger,
} from './constants'
import { MAX_MONEY_CENTS } from './integer-money'
import type { MatchConflict, MatchReason } from './matching-engine'
import type {
  EvidenceExclusionReason,
  NoRecommendationReason,
  RecommendationActionMode,
  RecommendationEngineResult,
  SafeguardApplied,
} from './recommendation-engine'
import type { PricingRules } from './settings'

declare const centsBrand: unique symbol
declare const isoDateTimeBrand: unique symbol
declare const safeExternalUrlBrand: unique symbol

/** JSON-safe integer cents. Prices are positive; deltas may be signed. */
export type CentsDto = number & { readonly [centsBrand]: true }
export type IsoDateTimeDto = string & { readonly [isoDateTimeBrand]: true }
export type SafeExternalUrlDto = string & { readonly [safeExternalUrlBrand]: true }

export const PRICING_ADMIN_PERMISSIONS = {
  read: 'catalog.read',
  manageCompetitorsAndMappings: 'catalog.update',
  applyLocalPrice: 'prices.update',
} as const satisfies Record<string, AdminPermission>

export type PricingConnectionState = 'not_connected' | 'connected' | 'unavailable'
export type PricingFreshnessState = 'fresh' | 'stale' | 'problem' | 'unavailable'
export type SourceHealthState = 'ok' | 'stale' | 'transient_error' | 'rate_limited' | 'blocked' | 'disabled'
export type SourceErrorCategory = 'fetch_error' | 'parse_error' | 'blocked' | 'rate_limited' | 'not_found' | 'configuration_error'
export type ProductPriceOwnership = 'erp' | 'local' | 'local_price_missing'

export type MarketStatisticsDto = {
  competitorCount: number
  minCents: CentsDto
  medianCents: CentsDto
  maxCents: CentsDto
  averageCents: CentsDto
  spreadCents: CentsDto
  currentVsMinCents: CentsDto
  currentVsMedianCents: CentsDto
}

export type RecommendationEvidenceDto = {
  competitorId: string
  competitorName: string | null
  competitorProductIds: string[]
  observationIds: string[]
  effectivePriceCents: CentsDto | null
  freshestLastSeenAt: IsoDateTimeDto | null
  exclusionReasons: EvidenceExclusionReason[]
}

export type RecommendationSafeguardDto = {
  code: SafeguardApplied['code']
  limitBasisPoints: number
  rawTargetCents: CentsDto
  clampedTargetCents: CentsDto
}

type PricingRecommendationDtoBase = {
  id: string | null
  status: RecommendationStatus | 'not_persisted'
  algorithmVersion: string
  inputHash: string | null
  currentPriceCents: CentsDto
  market: MarketStatisticsDto | null
  actionMode: RecommendationActionMode
  safeguards: RecommendationSafeguardDto[]
  includedCompetitors: RecommendationEvidenceDto[]
  excludedCompetitors: RecommendationEvidenceDto[]
  calculatedAt: IsoDateTimeDto | null
  expiresAt: IsoDateTimeDto | null
  stale: boolean
}

export type PricingRecommendationDto = PricingRecommendationDtoBase & (
  | {
      outcome: 'recommendation'
      rawTargetCents: CentsDto
      recommendedPriceCents: CentsDto
      differenceCents: CentsDto
      differenceBasisPoints: number
      confidence: RecommendationConfidence
      reasonCode: 'increase_to_market_median' | 'decrease_to_market_median'
      reasonCodes: []
      expiresAt: IsoDateTimeDto
    }
  | {
      outcome: 'no_recommendation'
      rawTargetCents: CentsDto | null
      recommendedPriceCents: CentsDto | null
      differenceCents: null
      differenceBasisPoints: null
      confidence: null
      reasonCode: NoRecommendationReason
      reasonCodes: NoRecommendationReason[]
      expiresAt: null
    }
)

export type ProductPricingRowDto = {
  productId: string
  title: string
  currentPriceCents: CentsDto
  currency: 'EUR'
  priceOwnership: ProductPriceOwnership
  trustedCompetitorCount: number
  market: MarketStatisticsDto | null
  recommendation: PricingRecommendationDto | null
  freshness: PricingFreshnessState
  problemCodes: string[]
}

export type PricingSummaryDto = {
  monitoredCompetitors: number | null
  trackedCompetitorProducts: number | null
  trustedMappings: number | null
  mappingsPendingReview: number | null
  freshObservations: number | null
  staleOrProblemSources: number | null
  pendingRecommendations: number | null
  erpPendingRecommendations: number | null
}

export type CompetitorSourceHealthDto = {
  competitorId: string
  name: string
  hostname: string
  enabled: boolean
  health: SourceHealthState
  operationalStatus: 'active' | 'paused' | 'blocked'
  lastCheckAt: IsoDateTimeDto | null
  lastSuccessAt: IsoDateTimeDto | null
  consecutiveFailures: number
  rateLimited: boolean
}

export type PricingDashboardDto = {
  connectionState: PricingConnectionState
  generatedAt: IsoDateTimeDto | null
  summary: PricingSummaryDto
  products: ProductPricingRowDto[]
  sources: CompetitorSourceHealthDto[]
}

export type CompetitorDto = CompetitorSourceHealthDto & {
  baseUrl: SafeExternalUrlDto
  accessBasisNote: string
  polling: {
    intervalMinutes: number
    requestDelayMs: number
    concurrency: number
    timeoutMs: number
    maxResponseBytes: number
    maxProductsPerRun: number
  }
  lastErrorCategory: SourceErrorCategory | null
  productCount: number
}

export type ParsedCompetitorIdentifiersDto = {
  gtin: string | null
  manufacturerSku: string | null
  brand: string | null
  sizeText: string | null
}

export type PricingMappingDto = {
  mappingId: string
  competitorProduct: {
    id: string
    competitorId: string
    title: string | null
    url: SafeExternalUrlDto
    identifiers: ParsedCompetitorIdentifiersDto
  }
  proposedProduct: { id: string; title: string } | null
  method: MatchMethod
  confidenceThousandths: number | null
  reasons: MatchReason[]
  conflicts: MatchConflict[]
  status: MatchStatus
}

export type PriceHistoryPointDto = {
  observationId: string
  competitorId: string
  regularPriceCents: CentsDto | null
  salePriceCents: CentsDto | null
  currency: 'EUR'
  availability: string
  observedAt: IsoDateTimeDto
  lastSeenAt: IsoDateTimeDto
}

export type RecommendationActionEligibilityDto = {
  eligible: boolean
  requiredPermission: typeof PRICING_ADMIN_PERMISSIONS.applyLocalPrice
  blockedReason: 'erp_owned' | 'erp_price_missing' | 'stale' | 'not_pending' | 'inputs_changed' | null
}

export type ProductPricingDetailDto = {
  product: {
    id: string
    title: string
    currentPriceCents: CentsDto
    currency: 'EUR'
    priceOwnership: ProductPriceOwnership
    revision: number
  }
  market: MarketStatisticsDto | null
  recommendation: PricingRecommendationDto | null
  includedEvidence: RecommendationEvidenceDto[]
  excludedEvidence: RecommendationEvidenceDto[]
  priceHistory: PriceHistoryPointDto[]
  mappings: PricingMappingDto[]
  explanationReasonCodes: string[]
  actionEligibility: RecommendationActionEligibilityDto
}

export type PricingRulesDto = {
  version: 1
  maxDecreaseBasisPoints: number
  maxIncreaseBasisPoints: number
  minimumDifferenceBasisPoints: number
  minimumCompetitors: number
  includeSalePrices: boolean
  requireAvailability: boolean
  outliers: { mode: 'none' } | { mode: 'iqr'; multiplierHundredths: number; minPointsForFiltering: number }
  maxObservationAgeHours: number
  recommendationTtlHours: number
}

export type PricingMonitorRunDto = {
  id: string
  status: RunStatus
  trigger: RunTrigger
  startedAt: IsoDateTimeDto
  finishedAt: IsoDateTimeDto | null
  counters: {
    competitorsAttempted: number
    competitorsSucceeded: number
    competitorsFailed: number
    competitorsBlocked: number
    productsChecked: number
    observationsCreated: number
    observationsUnchanged: number
    parseFailures: number
    fetchFailures: number
  }
  safeErrorCategories: SourceErrorCategory[]
}

export type PricingRecommendationDecisionRequestDto = {
  recommendationId: string
  decision: 'apply_local' | 'mark_for_erp' | 'ignore'
  expectedCurrentPriceCents: CentsDto
  expectedProductRevision: number
  expectedInputHash: string
}

export type PricingApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; fieldErrors?: Record<string, string[]> } }

/** Implemented later by an application service; pages never receive repository or Prisma records. */
export interface PricingAdminQueryService {
  getDashboard(): Promise<PricingDashboardDto>
  getProductDetail(productId: string): Promise<ProductPricingDetailDto | null>
  listCompetitors(): Promise<CompetitorDto[]>
  listMappings(): Promise<PricingMappingDto[]>
  listRuns(): Promise<PricingMonitorRunDto[]>
  getRules(): Promise<PricingRulesDto>
}

function assertCents(value: number, allowSigned: boolean): CentsDto {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_MONEY_CENTS || (!allowSigned && value <= 0)) {
    throw new RangeError(allowSigned ? 'Money delta must be integer cents in range' : 'Price must be positive integer cents in range')
  }
  return value as CentsDto
}

export function serializePriceCents(value: number): CentsDto {
  return assertCents(value, false)
}

export function serializeMoneyDeltaCents(value: number): CentsDto {
  return assertCents(value, true)
}

export function serializeIsoDateTime(value: Date | string): IsoDateTimeDto {
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError('ISO date-time must include an explicit timezone')
  }
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date-time')
  return date.toISOString() as IsoDateTimeDto
}

/** UI links deliberately omit query/hash so tokens or tracking identifiers cannot cross the boundary. */
export function serializeSafeExternalUrl(value: string): SafeExternalUrlDto {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new RangeError('Invalid external URL')
  }
  const hostname = url.hostname.toLowerCase()
  const localHostname = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  const ipLiteral = /^[\d.]+$/.test(hostname) || hostname.includes(':')
  if (url.protocol !== 'https:' || url.username || url.password || localHostname || ipLiteral) {
    throw new RangeError('Unsafe external URL')
  }
  url.search = ''
  url.hash = ''
  if (url.toString().length > 2048) throw new RangeError('External URL is too long')
  return url.toString() as SafeExternalUrlDto
}

function marketStatisticsDto(result: RecommendationEngineResult): MarketStatisticsDto | null {
  const stats = result.market.statistics
  if (!stats) return null
  return {
    competitorCount: stats.count,
    minCents: serializePriceCents(stats.minCents),
    medianCents: serializePriceCents(stats.medianCents),
    maxCents: serializePriceCents(stats.maxCents),
    averageCents: serializePriceCents(stats.averageCents),
    spreadCents: serializeMoneyDeltaCents(stats.spreadCents),
    currentVsMinCents: serializeMoneyDeltaCents(stats.currentVsMinCents),
    currentVsMedianCents: serializeMoneyDeltaCents(stats.currentVsMedianCents),
  }
}

function safeguardDto(safeguard: SafeguardApplied): RecommendationSafeguardDto {
  return {
    code: safeguard.code,
    limitBasisPoints: safeguard.limitBasisPoints,
    rawTargetCents: serializePriceCents(safeguard.rawTargetCents),
    clampedTargetCents: serializePriceCents(safeguard.clampedTargetCents),
  }
}

export function recommendationDtoFromDomain(
  result: RecommendationEngineResult,
  context: {
    recommendationId?: string | null
    status?: RecommendationStatus | 'not_persisted'
    calculatedAt?: Date | string | null
    stale?: boolean
    competitorNames?: Readonly<Record<string, string>>
  } = {},
): PricingRecommendationDto {
  const names = context.competitorNames ?? {}
  const includedCompetitors = [...result.market.includedCompetitors]
    .sort((a, b) => a.competitorId < b.competitorId ? -1 : a.competitorId > b.competitorId ? 1 : 0)
    .map((competitor): RecommendationEvidenceDto => ({
      competitorId: competitor.competitorId,
      competitorName: names[competitor.competitorId] ?? null,
      competitorProductIds: [...competitor.competitorProductIds].sort(),
      observationIds: [...competitor.observationIds].sort(),
      effectivePriceCents: serializePriceCents(competitor.effectivePriceCents),
      freshestLastSeenAt: serializeIsoDateTime(competitor.freshestLastSeenAt),
      exclusionReasons: [],
    }))
  const excludedCompetitors = [...result.market.excludedEvidence]
    .sort((a, b) => {
      const left = `${a.competitorId}\u0000${a.competitorProductId}\u0000${a.observationId}`
      const right = `${b.competitorId}\u0000${b.competitorProductId}\u0000${b.observationId}`
      return left < right ? -1 : left > right ? 1 : 0
    })
    .map((evidence): RecommendationEvidenceDto => ({
      competitorId: evidence.competitorId,
      competitorName: names[evidence.competitorId] ?? null,
      competitorProductIds: [evidence.competitorProductId],
      observationIds: [evidence.observationId],
      effectivePriceCents: null,
      freshestLastSeenAt: null,
      exclusionReasons: [...evidence.reasons],
    }))

  const common = {
    id: context.recommendationId ?? null,
    status: context.status ?? 'not_persisted',
    algorithmVersion: result.algorithmVersion,
    inputHash: result.inputHash,
    currentPriceCents: serializePriceCents(result.currentPriceCents),
    market: marketStatisticsDto(result),
    actionMode: result.actionMode,
    safeguards: [...result.safeguardsApplied]
      .sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
      .map(safeguardDto),
    includedCompetitors,
    excludedCompetitors,
    calculatedAt: context.calculatedAt ? serializeIsoDateTime(context.calculatedAt) : null,
    stale: context.stale ?? false,
  }

  if (result.outcome === 'recommendation') {
    return {
      ...common,
      outcome: 'recommendation',
      rawTargetCents: serializePriceCents(result.rawTargetPriceCents),
      recommendedPriceCents: serializePriceCents(result.recommendedPriceCents),
      differenceCents: serializeMoneyDeltaCents(result.differenceCents),
      differenceBasisPoints: result.differenceBasisPoints,
      confidence: result.confidence,
      reasonCode: result.reasonCode,
      reasonCodes: [],
      expiresAt: serializeIsoDateTime(result.expiresAt),
    }
  }

  return {
    ...common,
    outcome: 'no_recommendation',
    rawTargetCents: result.rawTargetPriceCents === null ? null : serializePriceCents(result.rawTargetPriceCents),
    recommendedPriceCents: result.safeguardedTargetPriceCents === null ? null : serializePriceCents(result.safeguardedTargetPriceCents),
    differenceCents: null,
    differenceBasisPoints: null,
    confidence: null,
    reasonCode: result.primaryReason,
    reasonCodes: [...result.reasonCodes],
    expiresAt: null,
  }
}

export function pricingRulesDtoFromDomain(rules: PricingRules): PricingRulesDto {
  return {
    version: rules.version,
    maxDecreaseBasisPoints: Math.round(rules.maxDecreasePercent * 100),
    maxIncreaseBasisPoints: Math.round(rules.maxIncreasePercent * 100),
    minimumDifferenceBasisPoints: Math.round(rules.minimumDifferencePercent * 100),
    minimumCompetitors: rules.minimumCompetitors,
    includeSalePrices: rules.includeSalePrices,
    requireAvailability: rules.requireAvailability,
    outliers: rules.outliers.mode === 'none'
      ? { mode: 'none' }
      : {
          mode: 'iqr',
          multiplierHundredths: Math.round(rules.outliers.iqrMultiplier * 100),
          minPointsForFiltering: rules.outliers.minPointsForFiltering,
        },
    maxObservationAgeHours: rules.maxObservationAgeHours,
    recommendationTtlHours: rules.recommendationTtlHours,
  }
}

export function createDisconnectedPricingDashboard(): PricingDashboardDto {
  return {
    connectionState: 'not_connected',
    generatedAt: null,
    summary: {
      monitoredCompetitors: null,
      trackedCompetitorProducts: null,
      trustedMappings: null,
      mappingsPendingReview: null,
      freshObservations: null,
      staleOrProblemSources: null,
      pendingRecommendations: null,
      erpPendingRecommendations: null,
    },
    products: [],
    sources: [],
  }
}
