export interface StockLedgerFlags {
  ledgerEnabled: boolean
  scheduledStocksEnabled: boolean
  manifestEnabled: boolean
  reconciliationEnabled: boolean
  clockSkewMarginMs: number
  manifestMaxAgeHours: number
  rollbackRunsToKeep: number
}

const enabled = (value: string | undefined): boolean => value === 'true'

export function stockLedgerFlags(env: Record<string, string | undefined> = process.env): StockLedgerFlags {
  const margin = Number(env.GRINS_MANIFEST_CLOCK_SKEW_SECONDS ?? '300')
  const rollbackRuns = Number(env.GRINS_STOCK_ROLLBACK_RUNS ?? '24')
  const manifestMaxAgeHours = Number(env.GRINS_STOCK_MANIFEST_MAX_AGE_HOURS ?? '3')
  return {
    ledgerEnabled: enabled(env.GRINS_STOCK_LEDGER_ENABLED),
    scheduledStocksEnabled: enabled(env.GRINS_STOCK_SYNC_ENABLED),
    manifestEnabled: enabled(env.GRINS_STOCK_MANIFEST_ENABLED),
    reconciliationEnabled: enabled(env.GRINS_STOCK_RECONCILIATION_ENABLED),
    clockSkewMarginMs: Number.isFinite(margin) && margin >= 0 ? Math.round(margin * 1000) : 300_000,
    manifestMaxAgeHours: Number.isFinite(manifestMaxAgeHours) && manifestMaxAgeHours > 0 && manifestMaxAgeHours <= 24
      ? manifestMaxAgeHours
      : 3,
    rollbackRunsToKeep: Number.isSafeInteger(rollbackRuns) && rollbackRuns >= 2 && rollbackRuns <= 168 ? rollbackRuns : 24,
  }
}

export function assertSafeStockFeatureFlags(flags: StockLedgerFlags): void {
  if (flags.scheduledStocksEnabled && !flags.ledgerEnabled) throw new Error('stock_sync_requires_ledger')
  if (flags.reconciliationEnabled && (!flags.ledgerEnabled || !flags.manifestEnabled)) {
    throw new Error('stock_reconciliation_requires_ledger_and_manifest')
  }
}
