/**
 * Pure state model for a single outbound stock allocation.
 *
 * It intentionally knows nothing about Prisma, orders, XML or wall-clock time.
 * A caller may send `verified_snapshot` only after separately proving that the
 * source snapshot is causally newer than the matching acknowledgement.
 */
export type StockAllocationState =
  | { phase: 'reserved'; quantity: number }
  | { phase: 'committed'; quantity: number }
  | { phase: 'awaiting_snapshot'; quantity: number; acknowledgmentId: string }
  | { phase: 'reconciled'; quantity: number; acknowledgmentId: string; snapshotId: string }
  | { phase: 'released'; quantity: number; reason: 'cancelled' | 'returned' | 'failed' | 'expired' }

export type StockAllocationEvent =
  | { type: 'payment_paid' }
  | { type: 'payment_failed' }
  | { type: 'expired' }
  | { type: 'cancelled' }
  | { type: 'returned' }
  | { type: 'acknowledged'; acknowledgmentId: string }
  | { type: 'verified_snapshot'; acknowledgmentId: string; snapshotId: string }
  | { type: 'edit_increase'; quantity: number }
  | { type: 'edit_decrease'; quantity: number }
  | { type: 'reopened' }

export type StockAllocationEffect =
  | { type: 'none' }
  | { type: 'release_hold'; quantity: number }
  | { type: 'create_additional_hold'; quantity: number }
  | { type: 'reacquire_hold'; quantity: number }
  | { type: 'blocked'; reason: 'awaiting_fresh_grins_snapshot' }

export interface StockAllocationTransition {
  state: StockAllocationState
  effect: StockAllocationEffect
}

const none = (state: StockAllocationState): StockAllocationTransition => ({ state, effect: { type: 'none' } })

function positiveQuantity(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('quantity_must_be_positive_integer')
  return quantity
}

/**
 * Plans one transition. Effects are commands for the future transactional
 * adapter; this function never mutates stock or persists anything.
 */
export function transitionStockAllocation(
  state: StockAllocationState,
  event: StockAllocationEvent,
): StockAllocationTransition {
  positiveQuantity(state.quantity)

  if (event.type === 'edit_increase' || event.type === 'edit_decrease') positiveQuantity(event.quantity)

  if (state.phase === 'reserved') {
    if (event.type === 'payment_paid') return { state: { phase: 'committed', quantity: state.quantity }, effect: { type: 'none' } }
    if (event.type === 'payment_failed' || event.type === 'expired' || event.type === 'cancelled' || event.type === 'returned') {
      const reason = event.type === 'payment_failed' ? 'failed' : event.type
      return {
        state: { phase: 'released', quantity: state.quantity, reason },
        effect: { type: 'release_hold', quantity: state.quantity },
      }
    }
    if (event.type === 'edit_increase') return { state, effect: { type: 'create_additional_hold', quantity: event.quantity } }
    if (event.type === 'edit_decrease') {
      const released = Math.min(state.quantity, event.quantity)
      const remaining = state.quantity - released
      return remaining > 0
        ? { state: { phase: 'reserved', quantity: remaining }, effect: { type: 'release_hold', quantity: released } }
        : { state: { phase: 'released', quantity: state.quantity, reason: 'cancelled' }, effect: { type: 'release_hold', quantity: state.quantity } }
    }
    return none(state)
  }

  if (state.phase === 'committed') {
    if (event.type === 'acknowledged') {
      if (!event.acknowledgmentId.trim()) throw new Error('acknowledgment_id_required')
      return {
        state: { phase: 'awaiting_snapshot', quantity: state.quantity, acknowledgmentId: event.acknowledgmentId },
        effect: { type: 'none' },
      }
    }
    if (event.type === 'cancelled' || event.type === 'returned') {
      return {
        state: { phase: 'released', quantity: state.quantity, reason: event.type },
        effect: { type: 'release_hold', quantity: state.quantity },
      }
    }
    if (event.type === 'edit_increase') return { state, effect: { type: 'create_additional_hold', quantity: event.quantity } }
    if (event.type === 'edit_decrease') {
      const released = Math.min(state.quantity, event.quantity)
      const remaining = state.quantity - released
      return remaining > 0
        ? { state: { phase: 'committed', quantity: remaining }, effect: { type: 'release_hold', quantity: released } }
        : { state: { phase: 'released', quantity: state.quantity, reason: 'cancelled' }, effect: { type: 'release_hold', quantity: state.quantity } }
    }
    // A committed sale is terminal for payment failure/expiry callbacks.
    return none(state)
  }

  if (state.phase === 'awaiting_snapshot') {
    if (event.type === 'verified_snapshot') {
      if (event.acknowledgmentId !== state.acknowledgmentId) return none(state)
      if (!event.snapshotId.trim()) throw new Error('snapshot_id_required')
      return {
        state: {
          phase: 'reconciled',
          quantity: state.quantity,
          acknowledgmentId: state.acknowledgmentId,
          snapshotId: event.snapshotId,
        },
        // The snapshot applier recomputes availability from grinsStock. It must
        // not increment Product.stock by the allocation quantity.
        effect: { type: 'none' },
      }
    }
    if (event.type === 'edit_increase') {
      // The acknowledged quantity is frozen. A later increase is a new,
      // unacknowledged allocation and cannot reuse this acknowledgement.
      return { state, effect: { type: 'create_additional_hold', quantity: event.quantity } }
    }
    if (event.type === 'reopened') {
      return { state, effect: { type: 'blocked', reason: 'awaiting_fresh_grins_snapshot' } }
    }
    // Cancel, return and decrease never release or resize an acknowledged hold.
    // Late payment/failure/expiry callbacks are idempotent no-ops here too.
    return none(state)
  }

  if (state.phase === 'released') {
    if (event.type === 'payment_paid' || event.type === 'reopened') {
      // The adapter must atomically check availability before creating the new
      // committed hold. The old allocation remains immutable and released.
      return { state, effect: { type: 'reacquire_hold', quantity: state.quantity } }
    }
    return none(state)
  }

  // Reconciled quantities are already represented by grinsStock. Cancel,
  // return, failure and expiry must never increment cached availability.
  if (event.type === 'reopened') return { state, effect: { type: 'create_additional_hold', quantity: state.quantity } }
  if (event.type === 'edit_increase') return { state, effect: { type: 'create_additional_hold', quantity: event.quantity } }
  return none(state)
}

export function allocationReducesAvailability(state: StockAllocationState): boolean {
  return state.phase === 'reserved' || state.phase === 'committed' || state.phase === 'awaiting_snapshot'
}
