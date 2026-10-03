import type { MatchMethod, MatchStatus } from './constants'

// Product ↔ CompetitorProduct matching rules (domain layer).
//
// Trusted statuses (confirmed, manual) are exclusive: CompetitorProductMatch.exclusiveKey
// is set to competitorProductId for them and is unique in the database, so one competitor
// product can be trusted for at most one of our products.

export const TRUSTED_MATCH_STATUSES: readonly MatchStatus[] = ['confirmed', 'manual']

/** Statuses an automatic (non-human) matcher may produce: never a trusted one. */
const AUTOMATIC_MATCH_STATUSES: readonly MatchStatus[] = ['likely', 'ambiguous']

export class MatchRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'MatchRuleError'
  }
}

export function isTrustedMatchStatus(status: string): boolean {
  return (TRUSTED_MATCH_STATUSES as readonly string[]).includes(status)
}

export function exclusiveKeyFor(status: MatchStatus, competitorProductId: string): string | null {
  return isTrustedMatchStatus(status) ? competitorProductId : null
}

export type MatchDecision = {
  status: MatchStatus
  method: MatchMethod
  /** Admin user id; null means the decision was made by an automatic matcher. */
  decidedById: string | null
}

/**
 * Validates who may set which status:
 * - automatic matchers (no decidedById) may only propose likely/ambiguous — fuzzy or
 *   identifier matches are never silently treated as exact;
 * - manual method requires a human and yields status manual (or rejected);
 * - confirmed requires a human.
 */
export function assertMatchDecision(decision: MatchDecision): void {
  const human = typeof decision.decidedById === 'string' && decision.decidedById.length > 0
  if (!human && !AUTOMATIC_MATCH_STATUSES.includes(decision.status)) {
    throw new MatchRuleError('automatic_trusted_match', `Automatic matching cannot produce status ${decision.status}`)
  }
  if (decision.method === 'manual') {
    if (!human) throw new MatchRuleError('manual_without_admin', 'A manual match requires an admin decision')
    if (decision.status !== 'manual' && decision.status !== 'rejected') {
      throw new MatchRuleError('manual_status', 'A manual match must have status manual or rejected')
    }
  } else if (decision.status === 'manual') {
    throw new MatchRuleError('manual_status', 'Status manual is only valid for the manual method')
  }
}

/** Which matches may feed market statistics / recommendations. */
export function isMatchUsableForPricing(status: string, _options: { includeLikelyMatches: false }): boolean {
  return isTrustedMatchStatus(status)
}
