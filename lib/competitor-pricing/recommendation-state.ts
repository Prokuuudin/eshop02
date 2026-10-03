import type { PriceAuthority, RecommendationClosedReason, RecommendationStatus } from './constants'

// PricingRecommendation lifecycle (minimal state machine):
//
//   pending ──ignore──────────► ignored
//   pending ──apply (local)───► applied            in-app price change via the existing admin path
//   pending ──mark_for_erp────► erp_pending        ERP-owned price: workflow status only, no Product write
//   pending ──invalidate──────► stale              newer recommendation / inputs changed / expired
//   erp_pending ──erp_observed► erp_applied        sync brought Product.price == recommendedPrice
//   erp_pending ──ignore──────► ignored            admin withdraws the ERP request
//   erp_pending ──invalidate──► stale
//
// ignored, applied, erp_applied, stale are terminal. At most one open (pending|erp_pending)
// recommendation per product: PricingRecommendation.openKey = productId while open.

export type RecommendationAction = 'ignore' | 'apply' | 'mark_for_erp' | 'erp_observed' | 'invalidate'

const OPEN_STATUSES: readonly RecommendationStatus[] = ['pending', 'erp_pending']

const TRANSITIONS: Record<RecommendationAction, { from: readonly RecommendationStatus[]; to: RecommendationStatus; authority?: PriceAuthority }> = {
  ignore: { from: ['pending', 'erp_pending'], to: 'ignored' },
  apply: { from: ['pending'], to: 'applied', authority: 'local' },
  mark_for_erp: { from: ['pending'], to: 'erp_pending', authority: 'erp' },
  erp_observed: { from: ['erp_pending'], to: 'erp_applied', authority: 'erp' },
  invalidate: { from: ['pending', 'erp_pending'], to: 'stale' },
}

export class RecommendationTransitionError extends Error {
  constructor(readonly code: 'invalid_transition' | 'wrong_price_authority' | 'closed_reason_required', message: string) {
    super(message)
    this.name = 'RecommendationTransitionError'
  }
}

export function isOpenRecommendationStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status)
}

export function openKeyFor(status: RecommendationStatus, productId: string): string | null {
  return isOpenRecommendationStatus(status) ? productId : null
}

export type TransitionResult = { status: RecommendationStatus; openKey: string | null; closedReason: RecommendationClosedReason | null }

/**
 * Returns the next state or throws. The caller persists it with a conditional update
 * (WHERE id = ? AND status = <current>) so concurrent decisions cannot both win.
 */
export function transitionRecommendation(
  current: { status: string; priceAuthority: string; productId: string },
  action: RecommendationAction,
  closedReason?: RecommendationClosedReason,
): TransitionResult {
  const rule = TRANSITIONS[action]
  if (!(rule.from as readonly string[]).includes(current.status)) {
    throw new RecommendationTransitionError('invalid_transition', `Cannot ${action} a ${current.status} recommendation`)
  }
  if (rule.authority && rule.authority !== current.priceAuthority) {
    throw new RecommendationTransitionError(
      'wrong_price_authority',
      action === 'apply'
        ? 'ERP-owned prices cannot be applied in-app; mark the recommendation for ERP instead'
        : `Action ${action} requires price authority ${rule.authority}`,
    )
  }
  if (action === 'invalidate' && !closedReason) {
    throw new RecommendationTransitionError('closed_reason_required', 'Invalidating requires a closed reason')
  }
  return { status: rule.to, openKey: openKeyFor(rule.to, current.productId), closedReason: action === 'invalidate' ? closedReason! : null }
}

/** Price authority is decided by ERP linkage, never by the recommendation itself. */
export function priceAuthorityFor(product: { externalId: string | null }): PriceAuthority {
  return product.externalId === null ? 'local' : 'erp'
}

/** Actions the UI may offer for an open recommendation. */
export function availableRecommendationActions(current: { status: string; priceAuthority: string }): RecommendationAction[] {
  return (['ignore', 'apply', 'mark_for_erp'] as const).filter((action) => {
    const rule = TRANSITIONS[action]
    return (rule.from as readonly string[]).includes(current.status) && (!rule.authority || rule.authority === current.priceAuthority)
  })
}
