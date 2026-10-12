import { describe, expect, it } from 'vitest'
import { safeGrinsOperationError } from '@/lib/grins-operation-environment'
import { stockLedgerDeinitializeBlockers, type StockLedgerDeinitializeState } from './stock-ledger-deinitialize'

const ready: StockLedgerDeinitializeState = {
  checkoutClosed: true,
  syncLockHeldByOther: false,
  stockSyncEnabled: false,
  initializedProducts: 3,
  ledgerFieldProducts: 3,
  allocationsByStatus: { reconciled: 2, released: 1 },
  activeAllocations: 0,
  invariantViolations: 0,
  productCount: 4,
  stockSum: 12,
  stockFingerprint: 'x',
}

describe('stock ledger deinitialize gate', () => {
  it('allows deinitialize only when every precondition holds; finished allocations are history', () => {
    expect(stockLedgerDeinitializeBlockers(ready)).toEqual([])
  })

  it('blocks on open checkout, enabled scheduled stocks and a foreign sync lock', () => {
    expect(stockLedgerDeinitializeBlockers({ ...ready, checkoutClosed: false })).toEqual(['maintenance_required'])
    expect(stockLedgerDeinitializeBlockers({ ...ready, stockSyncEnabled: true })).toEqual(['stock_sync_must_be_disabled'])
    expect(stockLedgerDeinitializeBlockers({ ...ready, syncLockHeldByOther: true })).toEqual(['stock_ledger_deinitialize_sync_lock_unavailable'])
  })

  it('blocks on any active or awaiting-GrinS hold and on availability drift', () => {
    expect(stockLedgerDeinitializeBlockers({ ...ready, activeAllocations: 1, allocationsByStatus: { awaiting_grins_sync: 1 } }))
      .toEqual(['stock_ledger_deinitialize_active_allocations'])
    expect(stockLedgerDeinitializeBlockers({ ...ready, invariantViolations: 2 })).toEqual(['stock_ledger_deinitialize_invariant_failed'])
  })

  it('reports every blocker, checkout first', () => {
    expect(stockLedgerDeinitializeBlockers({
      ...ready, checkoutClosed: false, stockSyncEnabled: true, syncLockHeldByOther: true, activeAllocations: 1, invariantViolations: 1,
    })).toEqual([
      'maintenance_required',
      'stock_sync_must_be_disabled',
      'stock_ledger_deinitialize_sync_lock_unavailable',
      'stock_ledger_deinitialize_active_allocations',
      'stock_ledger_deinitialize_invariant_failed',
    ])
  })

  it('exposes deinitialize refusal codes to the operator instead of masking them', () => {
    for (const code of [
      'stock_sync_must_be_disabled',
      'stock_ledger_deinitialize_sync_lock_unavailable',
      'stock_ledger_deinitialize_active_allocations',
      'stock_ledger_deinitialize_invariant_failed',
      'stock_ledger_deinitialize_verification_failed',
    ]) expect(safeGrinsOperationError(new Error(code))).toBe(code)
    expect(safeGrinsOperationError(new Error('postgres://user:secret@host/db'))).toBe('operation_not_verified')
  })
})
