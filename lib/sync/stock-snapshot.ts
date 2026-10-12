import { Prisma } from '@/generated/prisma/client'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { enterStockLedgerWriteContext, lockProducts, recomputeManagedAvailability, stockLedgerInvariantViolations } from '@/lib/stock-ledger'
import { assertSafeStockFeatureFlags, stockLedgerFlags } from '@/lib/stock-ledger-config'
import type { ErpProduct } from './erp-adapter'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
import type { StockSyncPreflight } from './stock-sync-preflight'

const LOCK_TTL_MS = 30 * 60 * 1000
const BATCH_SIZE = 500

export interface StockSnapshotSource {
  identity: string
  sha256: string
  transportModifiedAt?: Date
  runStartedAt?: Date
  generatedAt?: Date
  manifestVerified: boolean
}

export interface StockSnapshotResult {
  runId: string
  status: 'completed' | 'failed' | 'skipped'
  matched: number
  reconciled: number
  awaiting: number
  reason?: string
}

export function snapshotIsAfterAcknowledgment(runStartedAt: Date, acknowledgedAt: Date, clockSkewMarginMs: number): boolean {
  return runStartedAt.getTime() > acknowledgedAt.getTime() + clockSkewMarginMs
}

function validateProducts(products: readonly ErpProduct[]): void {
  const ids = new Set<string>()
  for (const product of products) {
    if (!product.externalId.trim()) throw new Error('stock_snapshot_empty_external_id')
    if (ids.has(product.externalId)) throw new Error(`stock_snapshot_duplicate_external_id:${product.externalId}`)
    ids.add(product.externalId)
    if (!Number.isSafeInteger(product.stock) || product.stock < 0) throw new Error(`stock_snapshot_invalid_stock:${product.externalId}`)
  }
}

async function updatePhysicalStock(
  tx: ExtendedTransactionClient,
  rows: readonly { id: string; stock: number }[],
  runId: string,
): Promise<void> {
  await enterStockLedgerWriteContext(tx)
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE)
    const values = Prisma.join(batch.map((row) => Prisma.sql`(${row.id}::text, ${row.stock}::integer)`))
    await tx.$executeRaw`
      UPDATE "Product" p
      SET "grinsStock" = incoming.stock,
          "grinsStockUpdatedAt" = clock_timestamp(),
          "grinsStockRunId" = ${runId},
          "updatedAt" = clock_timestamp()
      FROM (VALUES ${values}) AS incoming(id, stock)
      WHERE p.id = incoming.id
        AND p."isDeleted" = false
    `
  }
}

async function recordRollbackEntries(
  tx: ExtendedTransactionClient,
  rows: readonly { id: string; stock: number; grinsStock: number | null; grinsStockRunId: string | null; incomingStock: number }[],
  runId: string,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE)
    await tx.stockSnapshotEntry.createMany({
      data: batch.map((row) => ({
        runId,
        productId: row.id,
        previousGrinsStock: row.grinsStock,
        previousStock: row.stock,
        previousGrinsStockRunId: row.grinsStockRunId,
        incomingGrinsStock: row.incomingStock,
      })),
    })
  }
}

export async function applyStockSnapshot(
  db: ExtendedPrismaClient,
  products: readonly ErpProduct[],
  source: StockSnapshotSource,
  preflight: StockSyncPreflight,
  triggeredBy: 'cron' | 'manual' = 'cron',
  flagEnv: Record<string, string | undefined> = process.env,
): Promise<StockSnapshotResult> {
  const flags = stockLedgerFlags(flagEnv)
  assertSafeStockFeatureFlags(flags)
  if (!flags.ledgerEnabled || !flags.scheduledStocksEnabled) throw new Error('stock_snapshot_feature_disabled')
  if (preflight.hard.length) throw new Error(`stock_snapshot_preflight_failed:${preflight.hard.join('; ')}`)
  if (source.manifestVerified && !source.runStartedAt) throw new Error('verified_manifest_missing_run_started_at')
  if (flags.reconciliationEnabled && (!source.manifestVerified || !source.runStartedAt)) throw new Error('reconciliation_requires_verified_manifest_time')
  validateProducts(products)

  const run = await db.syncRun.create({
    data: {
      status: 'running',
      mode: 'stocks-only',
      triggeredBy,
      sourceSha256: source.sha256,
      sourceGeneratedAt: source.generatedAt ?? source.transportModifiedAt,
      sourceRunStartedAt: source.runStartedAt,
    },
  })
  const runId = run.id
  if (!await acquireSyncLock(db, runId, LOCK_TTL_MS)) {
    await db.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: new Date(), errorSample: { reason: 'already_running' } as never } })
    return { runId, status: 'skipped', matched: 0, reconciled: 0, awaiting: 0, reason: 'already_running' }
  }

  try {
    const existing = await db.syncRun.findFirst({
      where: { id: { not: runId }, mode: 'stocks-only', sourceIdentity: source.identity, status: 'completed' },
      select: { id: true },
    })
    if (existing) {
      await db.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: new Date(), errorSample: { reason: 'snapshot_replay', originalRunId: existing.id } as never } })
      return { runId, status: 'skipped', matched: 0, reconciled: 0, awaiting: 0, reason: 'snapshot_replay' }
    }

    const [newestManifest, newestLegacy] = await Promise.all([
      db.syncRun.findFirst({
        where: { id: { not: runId }, mode: 'stocks-only', status: 'completed', sourceRunStartedAt: { not: null } },
        orderBy: { sourceRunStartedAt: 'desc' },
        select: { sourceRunStartedAt: true },
      }),
      db.syncRun.findFirst({
        where: { id: { not: runId }, mode: 'stocks-only', status: 'completed', sourceRunStartedAt: null, sourceGeneratedAt: { not: null } },
        orderBy: { sourceGeneratedAt: 'desc' },
        select: { sourceGeneratedAt: true },
      }),
    ])
    if (source.runStartedAt) {
      if (newestManifest?.sourceRunStartedAt && source.runStartedAt <= newestManifest.sourceRunStartedAt) {
        throw new Error('stock_snapshot_older_than_last_manifest_snapshot')
      }
      if (newestLegacy?.sourceGeneratedAt && source.runStartedAt <= newestLegacy.sourceGeneratedAt) {
        throw new Error('first_manifest_snapshot_not_newer_than_last_legacy_mdtm')
      }
    } else {
      if (newestManifest) throw new Error('legacy_stock_source_cannot_follow_manifest_source')
      if (source.transportModifiedAt && newestLegacy?.sourceGeneratedAt && source.transportModifiedAt <= newestLegacy.sourceGeneratedAt) {
        throw new Error('stock_snapshot_transport_time_not_newer')
      }
    }

    const result = await db.$transaction(async (tx) => {
      const feed = new Map(products.map((product) => [product.externalId, product]))
      const rows = await tx.product.findMany({
        where: { externalId: { in: [...feed.keys()] }, isDeleted: false },
        select: { id: true, externalId: true, stock: true, grinsStock: true, grinsStockRunId: true },
      })
      const matched = rows.flatMap((row) => {
        const incoming = row.externalId ? feed.get(row.externalId) : undefined
        return incoming ? [{ ...row, incomingStock: incoming.stock }] : []
      })
      await lockProducts(tx, matched.map((row) => row.id))
      await recordRollbackEntries(tx, matched, runId)
      await updatePhysicalStock(tx, matched.map((row) => ({ id: row.id, stock: row.incomingStock })), runId)

      let reconciled = 0
      if (flags.reconciliationEnabled && source.runStartedAt) {
        const cutoff = new Date(source.runStartedAt.getTime() - flags.clockSkewMarginMs)
        const changed = await tx.stockAllocation.updateMany({
          where: {
            productId: { in: matched.map((row) => row.id) },
            status: 'awaiting_grins_sync',
            acknowledgedAt: { lt: cutoff },
            acknowledgmentId: { not: null },
          },
          data: { status: 'reconciled', reconciledAt: new Date(), reconciledSyncRunId: runId },
        })
        reconciled = changed.count
      }

      await recomputeManagedAvailability(tx, matched.map((row) => row.id))
      const violations = await stockLedgerInvariantViolations(tx, matched.map((row) => row.id))
      if (violations.length) throw new Error(`stock_ledger_invariant_failed:${violations.slice(0, 10).map((row) => row.id).join(',')}`)
      const awaiting = await tx.stockAllocation.count({ where: { status: 'awaiting_grins_sync' } })
      await tx.syncRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          sourceIdentity: source.identity,
          productsTotal: products.length,
          productsSynced: matched.length,
          errorCount: 0,
          errorSample: {
            kind: 'scheduled-stocks-only',
            manifestVerified: source.manifestVerified,
            warnings: preflight.warnings,
            metrics: preflight.metrics,
            reconciled,
            awaiting,
          } as never,
        },
      })
      const retained = await tx.syncRun.findMany({
        where: { mode: 'stocks-only', status: 'completed' },
        orderBy: { finishedAt: 'desc' },
        take: flags.rollbackRunsToKeep,
        select: { id: true },
      })
      await tx.stockSnapshotEntry.deleteMany({
        where: { run: { mode: 'stocks-only' }, runId: { notIn: [runId, ...retained.map((entry) => entry.id)] } },
      })
      return { matched: matched.length, reconciled, awaiting }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
    return { runId, status: 'completed', ...result }
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    await db.syncRun.update({
      where: { id: runId },
      data: { status: 'failed', finishedAt: new Date(), errorCount: 1, errorSample: { kind: 'scheduled-stocks-only', fatal: reason } as never },
    }).catch(() => {})
    return { runId, status: 'failed', matched: 0, reconciled: 0, awaiting: 0, reason }
  } finally {
    await releaseSyncLock(db, runId).catch(() => {})
  }
}

/**
 * Compensating restore for the latest successful stock snapshot only. It
 * restores physical values and then derives availability from allocations that
 * exist at rollback time, so orders created after the snapshot are not lost.
 * No route or scheduled command invokes this automatically.
 */
export async function rollbackLatestStockSnapshot(
  db: ExtendedPrismaClient,
  targetRunId: string,
  actor: string,
): Promise<{ runId: string; restored: number }> {
  if (!stockLedgerFlags().ledgerEnabled) throw new Error('stock_ledger_disabled')
  return db.$transaction(async (tx) => {
    const latest = await tx.syncRun.findFirst({ where: { mode: 'stocks-only', status: 'completed' }, orderBy: { finishedAt: 'desc' }, select: { id: true } })
    if (latest?.id !== targetRunId) throw new Error('rollback_target_is_not_latest_stock_snapshot')
    const entries = await tx.stockSnapshotEntry.findMany({ where: { runId: targetRunId }, orderBy: { productId: 'asc' } })
    if (!entries.length) throw new Error('rollback_entries_missing')
    await lockProducts(tx, entries.map((entry) => entry.productId))
    await enterStockLedgerWriteContext(tx)
    const rollbackRun = await tx.syncRun.create({
      data: {
        status: 'running', mode: 'stock-rollback', triggeredBy: actor,
        sourceIdentity: `rollback:${targetRunId}`,
        productsTotal: entries.length,
      },
    })
    for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
      const batch = entries.slice(offset, offset + BATCH_SIZE)
      const values = Prisma.join(batch.map((entry) => Prisma.sql`(
        ${entry.productId}::text,
        ${entry.previousGrinsStock}::integer,
        ${entry.previousStock}::integer,
        ${entry.previousGrinsStockRunId}::text
      )`))
      await tx.$executeRaw`
        UPDATE "Product" p
        SET "grinsStock" = restored."grinsStock",
            stock = CASE WHEN restored."grinsStock" IS NULL THEN restored.stock ELSE p.stock END,
            "grinsStockRunId" = restored."grinsStockRunId",
            "grinsStockUpdatedAt" = clock_timestamp(),
            "updatedAt" = clock_timestamp()
        FROM (VALUES ${values}) AS restored(id, "grinsStock", stock, "grinsStockRunId")
        WHERE p.id = restored.id
      `
    }
    await recomputeManagedAvailability(tx, entries.map((entry) => entry.productId))
    const violations = await stockLedgerInvariantViolations(tx, entries.filter((entry) => entry.previousGrinsStock !== null).map((entry) => entry.productId))
    if (violations.length) throw new Error('stock_rollback_invariant_failed')
    await tx.syncRun.update({
      where: { id: rollbackRun.id },
      data: { status: 'completed', finishedAt: new Date(), productsSynced: entries.length, errorCount: 0, errorSample: { targetRunId } as never },
    })
    return { runId: rollbackRun.id, restored: entries.length }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
}
