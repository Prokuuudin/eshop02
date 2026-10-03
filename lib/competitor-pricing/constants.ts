// Allowed values for the string status columns of the competitor pricing models
// (prisma/schema.prisma). The project has no Prisma enums; these lists are the contract.

export const COMPETITOR_STATUSES = ['active', 'paused', 'blocked'] as const
export type CompetitorStatus = (typeof COMPETITOR_STATUSES)[number]

export const COMPETITOR_ADAPTER_KEYS = ['jsonld-product'] as const
export type CompetitorAdapterKey = (typeof COMPETITOR_ADAPTER_KEYS)[number]

export const MONITORING_STATES = ['active', 'paused', 'gone'] as const
export type MonitoringState = (typeof MONITORING_STATES)[number]

export const CHECK_STATUSES = ['ok', 'parse_error', 'fetch_error', 'blocked', 'not_found'] as const
export type CheckStatus = (typeof CHECK_STATUSES)[number]

export const AVAILABILITIES = ['in_stock', 'out_of_stock', 'preorder', 'unknown'] as const
export type Availability = (typeof AVAILABILITIES)[number]

export const MATCH_STATUSES = ['confirmed', 'manual', 'likely', 'ambiguous', 'rejected'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

export const MATCH_METHODS = ['ean', 'sku', 'title', 'manual'] as const
export type MatchMethod = (typeof MATCH_METHODS)[number]

export const RECOMMENDATION_STATUSES = ['pending', 'ignored', 'erp_pending', 'applied', 'erp_applied', 'stale'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

/** local: Product.externalId was null at calculation (in-app Apply allowed); erp: ERP owns the price. */
export const PRICE_AUTHORITIES = ['local', 'erp'] as const
export type PriceAuthority = (typeof PRICE_AUTHORITIES)[number]

export const RECOMMENDATION_CONFIDENCES = ['high', 'medium'] as const
export type RecommendationConfidence = (typeof RECOMMENDATION_CONFIDENCES)[number]

export const RECOMMENDATION_CLOSED_REASONS = ['newer_recommendation', 'inputs_changed', 'expired', 'product_unavailable'] as const
export type RecommendationClosedReason = (typeof RECOMMENDATION_CLOSED_REASONS)[number]

export const RUN_STATUSES = ['running', 'completed', 'partial', 'failed', 'skipped'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const RUN_TRIGGERS = ['scheduled', 'manual'] as const
export type RunTrigger = (typeof RUN_TRIGGERS)[number]

/** v1 compares like-for-like only: no FX conversion. */
export const SUPPORTED_CURRENCIES = ['EUR'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}
