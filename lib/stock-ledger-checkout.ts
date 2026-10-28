import type { ExtendedTransactionClient } from '@/lib/prisma'
import { readGrinsCheckoutState } from '@/lib/grins-checkout-preparation'
import { GRINS_CHECKOUT_GATE_KEY } from '@/lib/grins-import-maintenance'
import { ACTIVE_ALLOCATION_STATUSES, stockLedgerInvariantViolations } from '@/lib/stock-ledger'
import { stockLedgerFlags } from '@/lib/stock-ledger-config'

/** SyncRun modes written by stock-ledger operations (snapshot, compensating rollback, deinitialize). */
export const STOCK_LEDGER_RUN_MODES = ['stocks-only', 'stock-rollback', 'stock-ledger-deinitialize'] as const
const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'skipped']

/**
 * Checkout may reopen only on a coherent stock model: either fully legacy (no
 * ledger field anywhere, no active hold) or fully initialized (every linked
 * product initialized, availability equals the ledger formula, and the
 * operator environment runs with the ledger flag on, as the web process must).
 */
export async function stockLedgerOpenBlockers(
  tx: ExtendedTransactionClient,
  env: Record<string, string | undefined>,
): Promise<string[]> {
  const [products] = await tx.$queryRaw<Array<{ linked: number; linkedInitialized: number; initialized: number; residue: number }>>`
    SELECT count(*) FILTER (WHERE "externalId" IS NOT NULL AND "isDeleted" = false)::int AS linked,
           count(*) FILTER (WHERE "externalId" IS NOT NULL AND "isDeleted" = false AND "grinsStock" IS NOT NULL)::int AS "linkedInitialized",
           count(*) FILTER (WHERE "grinsStock" IS NOT NULL)::int AS initialized,
           count(*) FILTER (WHERE "grinsStock" IS NULL AND ("grinsStockRunId" IS NOT NULL OR "grinsStockUpdatedAt" IS NOT NULL))::int AS residue
    FROM "Product"
  `
  const active = await tx.stockAllocation.count({ where: { status: { in: [...ACTIVE_ALLOCATION_STATUSES] } } })
  const blockers: string[] = []
  if (products.residue > 0) blockers.push('stock_ledger_partial_state')
  if (products.initialized > 0) {
    if (products.linkedInitialized < products.linked) blockers.push('stock_ledger_partially_initialized')
    if (!stockLedgerFlags(env).ledgerEnabled) blockers.push('stock_ledger_flag_required')
    if ((await stockLedgerInvariantViolations(tx)).length > 0) blockers.push('stock_ledger_invariant_failed')
  } else if (active > 0) {
    blockers.push('stock_ledger_partial_state')
  }
  return blockers
}

/**
 * Reopens a maintenance window used only for stock-ledger operations. The
 * existing prices-only `open` requires a prices-only completion and
 * `abort-window` rejects any new run, so neither can close a window in which a
 * snapshot, rollback or deinitialize ran. Same gate lock, lease and baseline
 * rules as lib/grins-checkout-control.ts; every run created since the window
 * opened must be a terminal stock-ledger run (they are atomic: failed = no change).
 */
export async function openCheckoutAfterStockOperation(tx: ExtendedTransactionClient, windowId: string): Promise<{ checkoutClosed: false; reopenedWindowId: string; stockRuns: number }> {
  await tx.$executeRawUnsafe('LOCK TABLE "KeyValueSetting" IN SHARE ROW EXCLUSIVE MODE')
  const state = await readGrinsCheckoutState(tx)
  if (state === 'missing') throw new Error('checkout_gate_missing')
  if (state !== true) throw new Error('checkout_state_invalid')
  if (await tx.syncRun.count({ where: { status: 'running' } })) throw new Error('import_active')
  const locks = await tx.$queryRawUnsafe<Array<{ held: boolean }>>("SELECT (value->>'lockedUntil')::timestamptz >= now() AS held FROM \"KeyValueSetting\" WHERE key='sync-run-lock'")
  if (locks.length && locks[0].held !== false) throw new Error('lease_active')
  const gate = await tx.keyValueSetting.findUniqueOrThrow({ where: { key: GRINS_CHECKOUT_GATE_KEY } })
  const detail = gate.value as { maintenanceWindowId?: string; maintenanceBaselineRunIds?: unknown }
  if (!detail.maintenanceWindowId || detail.maintenanceWindowId !== windowId) throw new Error('completion_not_verified')
  if (!Array.isArray(detail.maintenanceBaselineRunIds) || detail.maintenanceBaselineRunIds.some((id) => typeof id !== 'string')) {
    throw new Error('completion_not_verified')
  }
  const newRuns = await tx.syncRun.findMany({
    where: { id: { notIn: detail.maintenanceBaselineRunIds as string[] } },
    select: { mode: true, status: true },
  })
  if (newRuns.some((run) => !(STOCK_LEDGER_RUN_MODES as readonly string[]).includes(run.mode) || !TERMINAL_RUN_STATUSES.includes(run.status))) {
    throw new Error('completion_not_verified')
  }
  const changed = await tx.$executeRawUnsafe(
    `UPDATE "KeyValueSetting" SET value=jsonb_set(value - 'maintenanceWindowId' - 'maintenanceBaselineRunIds','{checkoutClosed}','false'::jsonb),"updatedAt"=now()
      WHERE key=$1 AND value->'checkoutClosed'='true'::jsonb AND value->>'maintenanceWindowId'=$2`,
    GRINS_CHECKOUT_GATE_KEY,
    windowId,
  )
  if (changed !== 1 || await readGrinsCheckoutState(tx) !== false) throw new Error('checkout_state_invalid')
  return { checkoutClosed: false, reopenedWindowId: windowId, stockRuns: newRuns.length }
}
