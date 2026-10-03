import { z } from 'zod'

// Pricing rules for the (future, stage 7) deterministic recommendation engine.
// Stored in KeyValueSetting under PRICING_RULES_KEY, validated on every read and write.
//
// Deliberately absent: minimumMargin. The project has no cost/purchase price
// (ERP price3 is a partner tier, not cost), so a margin rule could only be enforced
// against an invented number. Add a `margin` block here only together with a real,
// verified cost source.

export const PRICING_RULES_KEY = 'competitor-pricing-rules'

/** Decimal setting with at most 2 fraction digits; engines convert it to an integer scale before math. */
const boundedTwoDecimal = (min: number, max: number) =>
  z.number().finite().min(min).max(max).refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9,
    { message: 'At most 2 decimal places' },
  )

const percent = (max: number) => boundedTwoDecimal(0, max)

const outliersSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({
    mode: z.literal('iqr'),
    // Tukey fences: points outside [Q1 − k·IQR, Q3 + k·IQR] are ignored.
    iqrMultiplier: boundedTwoDecimal(0.5, 5),
    // Below this many usable prices outlier filtering is skipped (too few points to judge).
    minPointsForFiltering: z.number().int().min(4).max(50),
  }).strict(),
])

export const pricingRulesSchema = z.object({
  version: z.literal(1),
  maxDecreasePercent: percent(50),
  maxIncreasePercent: percent(50),
  minimumDifferencePercent: percent(50),
  minimumCompetitors: z.number().int().min(1).max(20),
  requireAvailability: z.boolean(),
  outliers: outliersSchema,
  /** Observations whose lastSeenAt is older than this are not market evidence. */
  maxObservationAgeHours: z.number().int().min(1).max(24 * 30),
  /** Reserved compatibility field. Automatic recommendations are always trusted-match only. */
  includeLikelyMatches: z.literal(false),
  recommendationTtlHours: z.number().int().min(1).max(24 * 30),
}).strict().refine(
  (rules) => rules.maxDecreasePercent > 0 || rules.maxIncreasePercent > 0,
  { message: 'At least one of maxDecreasePercent / maxIncreasePercent must be positive', path: ['maxDecreasePercent'] },
)

export type PricingRules = z.infer<typeof pricingRulesSchema>

/** Conservative defaults; business values are editable in the admin settings page (stage 8). */
export const DEFAULT_PRICING_RULES: PricingRules = {
  version: 1,
  maxDecreasePercent: 10,
  maxIncreasePercent: 10,
  minimumDifferencePercent: 2,
  minimumCompetitors: 2,
  requireAvailability: true,
  outliers: { mode: 'iqr', iqrMultiplier: 1.5, minPointsForFiltering: 4 },
  maxObservationAgeHours: 72,
  includeLikelyMatches: false,
  recommendationTtlHours: 48,
}

export type ParsedPricingRules =
  | { ok: true; rules: PricingRules }
  | { ok: false; issues: string[] }

export function parsePricingRules(value: unknown): ParsedPricingRules {
  const parsed = pricingRulesSchema.safeParse(value)
  if (parsed.success) return { ok: true, rules: parsed.data }
  return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
}

/**
 * Stored rules → usable rules. A missing row means defaults; a corrupt row must not
 * silently fall back to defaults (that would change recommendations unnoticed), so it
 * is reported and the caller produces no recommendations.
 */
export function resolveStoredPricingRules(stored: unknown): ParsedPricingRules {
  if (stored === null || stored === undefined) return { ok: true, rules: DEFAULT_PRICING_RULES }
  return parsePricingRules(stored)
}

export function percentToBasisPoints(value: number): number {
  return Math.round(value * 100)
}
