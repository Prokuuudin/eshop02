import { describe, expect, it } from 'vitest'
import {
  allocationReducesAvailability,
  transitionStockAllocation,
  type StockAllocationState,
} from './stock-allocation-state'

const awaiting = (): StockAllocationState => ({
  phase: 'awaiting_snapshot',
  quantity: 3,
  acknowledgmentId: 'ack-1',
})

describe('acknowledged allocation safety window', () => {
  it.each([
    { type: 'cancelled' as const },
    { type: 'returned' as const },
    { type: 'edit_decrease' as const, quantity: 1 },
    { type: 'payment_failed' as const },
    { type: 'expired' as const },
    { type: 'payment_paid' as const },
  ])('keeps the acknowledged hold frozen for $type', event => {
    const result = transitionStockAllocation(awaiting(), event)
    expect(result).toEqual({ state: awaiting(), effect: { type: 'none' } })
    expect(allocationReducesAvailability(result.state)).toBe(true)
  })

  it('creates a separate unacknowledged hold for an edit increase', () => {
    const result = transitionStockAllocation(awaiting(), { type: 'edit_increase', quantity: 2 })
    expect(result.state).toEqual(awaiting())
    expect(result.effect).toEqual({ type: 'create_additional_hold', quantity: 2 })
  })

  it('blocks reopen until the acknowledged allocation has crossed the snapshot barrier', () => {
    expect(transitionStockAllocation(awaiting(), { type: 'reopened' })).toEqual({
      state: awaiting(),
      effect: { type: 'blocked', reason: 'awaiting_fresh_grins_snapshot' },
    })
  })

  it('does not accept a snapshot proof for another acknowledgement', () => {
    expect(transitionStockAllocation(awaiting(), {
      type: 'verified_snapshot', acknowledgmentId: 'old-ack', snapshotId: 'snapshot-2',
    })).toEqual({ state: awaiting(), effect: { type: 'none' } })
  })

  it('reconciles only the exact acknowledgement and never emits a stock increment', () => {
    const result = transitionStockAllocation(awaiting(), {
      type: 'verified_snapshot', acknowledgmentId: 'ack-1', snapshotId: 'snapshot-2',
    })
    expect(result).toEqual({
      state: {
        phase: 'reconciled', quantity: 3, acknowledgmentId: 'ack-1', snapshotId: 'snapshot-2',
      },
      effect: { type: 'none' },
    })
    expect(allocationReducesAvailability(result.state)).toBe(false)
  })
})

describe('callbacks and order transitions around acknowledgement', () => {
  it('releases an unacknowledged reserved allocation exactly once on failure', () => {
    const first = transitionStockAllocation({ phase: 'reserved', quantity: 2 }, { type: 'payment_failed' })
    expect(first.effect).toEqual({ type: 'release_hold', quantity: 2 })
    expect(first.state.phase).toBe('released')
    expect(transitionStockAllocation(first.state, { type: 'payment_failed' }).effect).toEqual({ type: 'none' })
  })

  it('ignores late failure and expiry after payment was committed', () => {
    const committed = transitionStockAllocation({ phase: 'reserved', quantity: 2 }, { type: 'payment_paid' }).state
    expect(transitionStockAllocation(committed, { type: 'payment_failed' }).state).toEqual(committed)
    expect(transitionStockAllocation(committed, { type: 'expired' }).state).toEqual(committed)
  })

  it('requires atomic reacquisition for a late paid callback after release', () => {
    const released: StockAllocationState = { phase: 'released', quantity: 2, reason: 'expired' }
    expect(transitionStockAllocation(released, { type: 'payment_paid' })).toEqual({
      state: released,
      effect: { type: 'reacquire_hold', quantity: 2 },
    })
  })

  it('cancel before acknowledgement releases; cancel after acknowledgement does not', () => {
    const committed: StockAllocationState = { phase: 'committed', quantity: 3 }
    expect(transitionStockAllocation(committed, { type: 'cancelled' }).effect).toEqual({
      type: 'release_hold', quantity: 3,
    })
    expect(transitionStockAllocation(awaiting(), { type: 'cancelled' }).effect).toEqual({ type: 'none' })
  })

  it('return after reconciliation never restores cached stock', () => {
    const reconciled: StockAllocationState = {
      phase: 'reconciled', quantity: 3, acknowledgmentId: 'ack-1', snapshotId: 'snapshot-2',
    }
    expect(transitionStockAllocation(reconciled, { type: 'returned' })).toEqual({
      state: reconciled,
      effect: { type: 'none' },
    })
  })

  it('reopen after release requires reacquisition and after reconciliation creates a new hold', () => {
    const released: StockAllocationState = { phase: 'released', quantity: 2, reason: 'cancelled' }
    const reconciled: StockAllocationState = {
      phase: 'reconciled', quantity: 2, acknowledgmentId: 'ack-1', snapshotId: 'snapshot-2',
    }
    expect(transitionStockAllocation(released, { type: 'reopened' }).effect).toEqual({
      type: 'reacquire_hold', quantity: 2,
    })
    expect(transitionStockAllocation(reconciled, { type: 'reopened' }).effect).toEqual({
      type: 'create_additional_hold', quantity: 2,
    })
  })

  it('rejects invalid quantities and empty acknowledgement identities', () => {
    expect(() => transitionStockAllocation({ phase: 'reserved', quantity: 0 }, { type: 'expired' })).toThrow('quantity_must_be_positive_integer')
    expect(() => transitionStockAllocation({ phase: 'committed', quantity: 1 }, { type: 'acknowledged', acknowledgmentId: ' ' })).toThrow('acknowledgment_id_required')
  })
})
