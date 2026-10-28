import { describe, expect, it } from 'vitest'
import { assertSafeStockFeatureFlags, stockLedgerFlags } from './stock-ledger-config'

describe('stock ledger feature flags', () => {
  it('keeps every new path disabled by default', () => {
    expect(stockLedgerFlags({})).toEqual({
      ledgerEnabled: false,
      scheduledStocksEnabled: false,
      manifestEnabled: false,
      reconciliationEnabled: false,
      clockSkewMarginMs: 300_000,
      manifestMaxAgeHours: 3,
      rollbackRunsToKeep: 24,
    })
  })

  it('bounds the configurable manifest age and defaults to three hours', () => {
    expect(stockLedgerFlags({ GRINS_STOCK_MANIFEST_MAX_AGE_HOURS: '2.5' }).manifestMaxAgeHours).toBe(2.5)
    expect(stockLedgerFlags({ GRINS_STOCK_MANIFEST_MAX_AGE_HOURS: '0' }).manifestMaxAgeHours).toBe(3)
    expect(stockLedgerFlags({ GRINS_STOCK_MANIFEST_MAX_AGE_HOURS: '25' }).manifestMaxAgeHours).toBe(3)
  })

  it('requires the ledger before scheduled stock writes', () => {
    const flags = stockLedgerFlags({ GRINS_STOCK_SYNC_ENABLED: 'true' })
    expect(() => assertSafeStockFeatureFlags(flags)).toThrow('stock_sync_requires_ledger')
  })

  it('requires a manifest before reconciliation', () => {
    const flags = stockLedgerFlags({
      GRINS_STOCK_LEDGER_ENABLED: 'true',
      GRINS_STOCK_RECONCILIATION_ENABLED: 'true',
    })
    expect(() => assertSafeStockFeatureFlags(flags)).toThrow('stock_reconciliation_requires_ledger_and_manifest')
  })
})
