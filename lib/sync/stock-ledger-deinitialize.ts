import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { GRINS_CHECKOUT_GATE_KEY } from '@/lib/grins-import-maintenance'
import { ACTIVE_ALLOCATION_STATUSES, enterStockLedgerWriteContext, stockLedgerInvariantViolations } from '@/lib/stock-ledger'
import { stockLedgerFlags } from '@/lib/stock-ledger-config'
import { runStockSerializableTransaction } from './stock-snapshot'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'

const LOCK_TTL_MS = 30 * 60 * 1000
const SYNC_LOCK_KEY = 'sync-run-lock'

export interface StockLedgerDeinitializeState {
  checkoutClosed: boolean
  /** Another live sync/rollback run holds the shared lock (ignores `ownRunId`). */
  syncLockHeldByOther: boolean
  stockSyncEnabled: boolean
  initializedProducts: number
  /** Products with any of grinsStock / grinsStockRunId / grinsStockUpdatedAt set. */
  ledgerFieldProducts: number
  allocationsByStatus: Record<string, number>
  activeAllocations: number
  invariantViolations: number
  productCount: number
  stockSum: number
  /** md5 over (id, stock) of every product: proves availability is untouched. */
  stockFingerprint: string
}

export interface StockLedgerDeinitializeReport extends StockLedgerDeinitializeState {
  blockers: string[]
}

export type StockLedgerDeinitializeResult =
  | { runId: string; status: 'completed'; clearedProducts: number; before: StockLedgerDeinitializeReport; after: StockLedgerDeinitializeReport }
  | { runId: string; status: 'noop'; clearedProducts: 0; before: StockLedgerDeinitializeReport }

/**
 * Pure gate. Every blocker means "change nothing": open checkout, a running
 * stock writer, enabled scheduled stocks, any hold that still reduces
 * availability (reserved/committed/awaiting GrinS) or availability that no
 * longer equals the ledger formula.
 */
export function stockLedgerDeinitializeBlockers(state: StockLedgerDeinitializeState): string[] {
  const blockers: string[] = []
  if (!state.checkoutClosed) blockers.push('maintenance_required')
  if (state.stockSyncEnabled) blockers.push('stock_sync_must_be_disabled')
  if (state.syncLockHeldByOther) blockers.push('stock_ledger_deinitialize_sync_lock_unavailable')
  if (state.activeAllocations > 0) blockers.push('stock_ledger_deinitialize_active_allocations')
  if (state.invariantViolations > 0) blockers.push('stock_ledger_deinitialize_invariant_failed')
  return blockers
}

async function readState(
  tx: ExtendedTransactionClient,
  options: { lockGate: boolean; ownRunId?: string; env: Record<string, string | undefined> },
): Promise<StockLedgerDeinitializeReport> {
  const gate = await tx.$queryRawUnsafe<Array<{ closed: boolean }>>(
    `SELECT (value->'checkoutClosed' = 'true'::jsonb) AS closed FROM "KeyValueSetting" WHERE key=$1${options.lockGate ? ' FOR UPDATE' : ''}`,
    GRINS_CHECKOUT_GATE_KEY,
  )
  const lock = await tx.$queryRawUnsafe<Array<{ held: boolean; runId: string | null }>>(
    `SELECT ((value->>'lockedUntil')::timestamptz >= now()) AS held, value->>'runId' AS "runId"
       FROM "KeyValueSetting" WHERE key=$1`,
    SYNC_LOCK_KEY,
  )
  const [products] = await tx.$queryRaw<Array<{
    productCount: number; initialized: number; ledgerFields: number; stockSum: number; fingerprint: string
  }>>`
    SELECT count(*)::int AS "productCount",
           count(*) FILTER (WHERE "grinsStock" IS NOT NULL)::int AS initialized,
           count(*) FILTER (WHERE "grinsStock" IS NOT NULL OR "grinsStockRunId" IS NOT NULL OR "grinsStockUpdatedAt" IS NOT NULL)::int AS "ledgerFields",
           COALESCE(sum(stock), 0)::float8 AS "stockSum",
           md5(COALESCE(string_agg(id || ':' || stock, ',' ORDER BY id), '')) AS fingerprint
    FROM "Product"
  `
  const allocations = await tx.$queryRaw<Array<{ status: string; count: number }>>`
    SELECT status, count(*)::int AS count FROM "StockAllocation" GROUP BY status ORDER BY status
  `
  const allocationsByStatus = Object.fromEntries(allocations.map((row) => [row.status, row.count]))
  const state: StockLedgerDeinitializeState = {
    checkoutClosed: gate[0]?.closed === true,
    syncLockHeldByOther: lock[0]?.held === true && lock[0].runId !== options.ownRunId,
    stockSyncEnabled: stockLedgerFlags(options.env).scheduledStocksEnabled,
    initializedProducts: products.initialized,
    ledgerFieldProducts: products.ledgerFields,
    allocationsByStatus,
    activeAllocations: ACTIVE_ALLOCATION_STATUSES.reduce((sum, status) => sum + (allocationsByStatus[status] ?? 0), 0),
    invariantViolations: (await stockLedgerInvariantViolations(tx)).length,
    productCount: products.productCount,
    stockSum: products.stockSum,
    stockFingerprint: products.fingerprint,
  }
  return { ...state, blockers: stockLedgerDeinitializeBlockers(state) }
}

/** Dry-run: reads only, takes no lock and writes no SyncRun. */
export async function inspectStockLedgerDeinitialize(
  db: ExtendedPrismaClient,
  env: Record<string, string | undefined> = process.env,
): Promise<StockLedgerDeinitializeReport> {
  return db.$transaction((tx) => readState(tx, { lockGate: false, env }))
}

/**
 * Returns the stock ledger to legacy mode by clearing only grinsStock,
 * grinsStockRunId and grinsStockUpdatedAt. Product.stock (availability),
 * prices, orders, payments, allocations and the snapshot journal are not
 * changed. Refuses unless checkout is closed, scheduled stocks are disabled,
 * the shared sync lock is free and no allocation still reduces availability.
 * Never invoked automatically; only scripts/operate-grins-stock-deinitialize.ts.
 */
export async function deinitializeStockLedger(
  db: ExtendedPrismaClient,
  actor: string,
  env: Record<string, string | undefined> = process.env,
): Promise<StockLedgerDeinitializeResult> {
  if (stockLedgerFlags(env).scheduledStocksEnabled) throw new Error('stock_sync_must_be_disabled')
  const run = await db.syncRun.create({
    data: { status: 'running', mode: 'stock-ledger-deinitialize', triggeredBy: actor },
  })
  if (!await acquireSyncLock(db, run.id, LOCK_TTL_MS)) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: 'skipped', finishedAt: new Date(), errorSample: { reason: 'already_running' } as never } })
    throw new Error('stock_ledger_deinitialize_sync_lock_unavailable')
  }
  try {
    return await runStockSerializableTransaction(db, async (tx) => {
      // Freeze every allocation writer (late callbacks, admin edits, returns)
      // and every initialized product until commit.
      await tx.$executeRawUnsafe('LOCK TABLE "StockAllocation" IN EXCLUSIVE MODE')
      await tx.$queryRaw`
        SELECT id FROM "Product"
        WHERE "grinsStock" IS NOT NULL OR "grinsStockRunId" IS NOT NULL OR "grinsStockUpdatedAt" IS NOT NULL
        ORDER BY id FOR UPDATE
      `
      const before = await readState(tx, { lockGate: true, ownRunId: run.id, env })
      if (before.blockers.length) throw new Error(before.blockers[0])

      if (before.ledgerFieldProducts === 0) {
        await tx.syncRun.update({
          where: { id: run.id },
          data: { status: 'completed', finishedAt: new Date(), productsTotal: 0, productsSynced: 0, errorCount: 0, errorSample: { noop: true, before } as never },
        })
        return { runId: run.id, status: 'noop' as const, clearedProducts: 0 as const, before }
      }

      await enterStockLedgerWriteContext(tx)
      const cleared = await tx.$executeRaw`
        UPDATE "Product"
        SET "grinsStock" = NULL, "grinsStockRunId" = NULL, "grinsStockUpdatedAt" = NULL
        WHERE "grinsStock" IS NOT NULL OR "grinsStockRunId" IS NOT NULL OR "grinsStockUpdatedAt" IS NOT NULL
      `
      const after = await readState(tx, { lockGate: false, ownRunId: run.id, env })
      if (cleared !== before.ledgerFieldProducts
        || after.ledgerFieldProducts !== 0
        || after.productCount !== before.productCount
        || after.stockSum !== before.stockSum
        || after.stockFingerprint !== before.stockFingerprint
        || JSON.stringify(after.allocationsByStatus) !== JSON.stringify(before.allocationsByStatus)) {
        throw new Error('stock_ledger_deinitialize_verification_failed')
      }
      await tx.syncRun.update({
        where: { id: run.id },
        data: {
          status: 'completed', finishedAt: new Date(), sourceIdentity: `deinitialize:${run.id}`,
          productsTotal: before.ledgerFieldProducts, productsSynced: cleared, errorCount: 0,
          errorSample: { before, after } as never,
        },
      })
      return { runId: run.id, status: 'completed' as const, clearedProducts: cleared, before, after }
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), errorCount: 1, errorSample: { fatal: reason } as never },
    }).catch(() => {})
    throw error
  } finally {
    await releaseSyncLock(db, run.id).catch(() => {})
  }
}
