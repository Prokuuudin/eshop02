import { Prisma } from '@/generated/prisma/client'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { enterStockLedgerWriteContext, lockProducts, recomputeManagedAvailability, stockLedgerInvariantViolations } from '@/lib/stock-ledger'
import { assertSafeStockFeatureFlags, stockLedgerFlags } from '@/lib/stock-ledger-config'
import type { ErpProduct } from './erp-adapter'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
import type { StockSyncPreflight } from './stock-sync-preflight'
import { GRINS_CHECKOUT_GATE_KEY } from '@/lib/grins-import-maintenance'

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
        AND p."grinsStock" IS DISTINCT FROM incoming.stock
    `
  }
}

export function isRetryableStockTransactionError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : String(error)
  return code === 'P2034'
    || code === 'P2028'
    || /\b(?:40001|40P01)\b|serialization|deadlock/iu.test(message)
}

export async function runStockSerializableTransaction<T>(
  db: ExtendedPrismaClient,
  operation: (tx: ExtendedTransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 })
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableStockTransactionError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 25))
    }
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

    const result = await runStockSerializableTransaction(db, async (tx) => {
      const feed = new Map(products.map((product) => [product.externalId, product]))
      const rows = await tx.product.findMany({
        where: { externalId: { in: [...feed.keys()] }, isDeleted: false },
        select: { id: true, externalId: true, stock: true, grinsStock: true, grinsStockRunId: true },
      })
      const matched = rows.flatMap((row) => {
        const incoming = row.externalId ? feed.get(row.externalId) : undefined
        return incoming ? [{ ...row, incomingStock: incoming.stock }] : []
      })
      const cutoff = flags.reconciliationEnabled && source.runStartedAt
        ? new Date(source.runStartedAt.getTime() - flags.clockSkewMarginMs)
        : null
      const reconciliationRows = cutoff
        ? await tx.stockAllocation.findMany({
            where: {
              productId: { in: matched.map((row) => row.id) },
              status: 'awaiting_grins_sync',
              acknowledgedAt: { lt: cutoff },
              acknowledgmentId: { not: null },
            },
            select: { productId: true },
            distinct: ['productId'],
          })
        : []
      const initiallyChanged = matched.filter((row) => row.grinsStock !== row.incomingStock).map((row) => row.id)
      const candidateIds = [...new Set([...initiallyChanged, ...reconciliationRows.map((row) => row.productId)])].sort()
      await lockProducts(tx, candidateIds)

      // Values may have changed while waiting for locks. Journal and update only
      // from this locked, current view; untouched products keep updatedAt intact.
      const lockedRows = candidateIds.length
        ? await tx.product.findMany({
            where: { id: { in: candidateIds }, isDeleted: false },
            select: { id: true, externalId: true, stock: true, grinsStock: true, grinsStockRunId: true },
          })
        : []
      const lockedMatched = lockedRows.flatMap((row) => {
        const incoming = row.externalId ? feed.get(row.externalId) : undefined
        return incoming ? [{ ...row, incomingStock: incoming.stock }] : []
      })
      const physicalChanges = lockedMatched.filter((row) => row.grinsStock !== row.incomingStock)
      const journalIds = new Set([...physicalChanges.map((row) => row.id), ...reconciliationRows.map((row) => row.productId)])
      const journalRows = lockedMatched.filter((row) => journalIds.has(row.id))
      await recordRollbackEntries(tx, journalRows, runId)
      await updatePhysicalStock(tx, physicalChanges.map((row) => ({ id: row.id, stock: row.incomingStock })), runId)

      let reconciled = 0
      if (cutoff && journalRows.length) {
        const changed = await tx.stockAllocation.updateMany({
          where: {
            productId: { in: journalRows.map((row) => row.id) },
            status: 'awaiting_grins_sync',
            acknowledgedAt: { lt: cutoff },
            acknowledgmentId: { not: null },
          },
          data: { status: 'reconciled', reconciledAt: new Date(), reconciledSyncRunId: runId },
        })
        reconciled = changed.count
      }

      await recomputeManagedAvailability(tx, journalRows.map((row) => row.id))
      const violations = await stockLedgerInvariantViolations(tx, journalRows.map((row) => row.id))
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
            physicalChanges: physicalChanges.length,
            productsLocked: candidateIds.length,
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
    })
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
  const rollbackRun = await db.syncRun.create({
    data: { status: 'running', mode: 'stock-rollback', triggeredBy: actor },
  })
  if (!await acquireSyncLock(db, rollbackRun.id, LOCK_TTL_MS)) {
    await db.syncRun.update({ where: { id: rollbackRun.id }, data: { status: 'skipped', finishedAt: new Date(), errorSample: { reason: 'already_running' } as never } })
    throw new Error('stock_rollback_sync_lock_unavailable')
  }
  try {
    return await runStockSerializableTransaction(db, async (tx) => {
      const gate = await tx.$queryRawUnsafe<Array<{ closed: boolean }>>(
        `SELECT (value->'checkoutClosed' = 'true'::jsonb) AS closed FROM "KeyValueSetting" WHERE key=$1 FOR UPDATE`,
        GRINS_CHECKOUT_GATE_KEY,
      )
      if (gate[0]?.closed !== true) throw new Error('maintenance_required')
      const latest = await tx.syncRun.findFirst({
        where: { mode: 'stocks-only', status: 'completed' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, finishedAt: true },
      })
      if (latest?.id !== targetRunId) throw new Error('rollback_target_is_not_latest_stock_snapshot')
      if (!latest.finishedAt) throw new Error('rollback_target_has_no_finished_at')
      const alreadyRolledBack = await tx.syncRun.findFirst({
        where: { mode: 'stock-rollback', status: 'completed', sourceIdentity: `rollback:${targetRunId}` },
        select: { id: true },
      })
      if (alreadyRolledBack) throw new Error('stock_snapshot_already_rolled_back')
      const entries = await tx.stockSnapshotEntry.findMany({ where: { runId: targetRunId }, orderBy: { productId: 'asc' } })
      if (!entries.length) throw new Error('rollback_entries_missing')
      if (entries.some((entry) => entry.previousGrinsStock === null)) throw new Error('rollback_initialization_forbidden')
      await lockProducts(tx, entries.map((entry) => entry.productId))
      const currentProducts = await tx.product.findMany({
        where: { id: { in: entries.map((entry) => entry.productId) } },
        select: { id: true, grinsStock: true, grinsStockRunId: true },
      })
      const entryByProduct = new Map(entries.map((entry) => [entry.productId, entry]))
      if (currentProducts.length !== entries.length || currentProducts.some((product) => {
        const entry = entryByProduct.get(product.id)
        if (!entry || product.grinsStock !== entry.incomingGrinsStock) return true
        return entry.previousGrinsStock !== entry.incomingGrinsStock && product.grinsStockRunId !== targetRunId
      })) {
        throw new Error('rollback_target_has_dependent_product_changes')
      }
      const reconciled = await tx.stockAllocation.findMany({
        where: { reconciledSyncRunId: targetRunId, status: 'reconciled' },
        select: { id: true, orderId: true },
      })
      if (reconciled.length) {
        const laterForSameOrders = await tx.stockAllocation.findFirst({
          where: { orderId: { in: [...new Set(reconciled.map((row) => row.orderId))] }, createdAt: { gt: latest.finishedAt } },
          select: { id: true },
        })
        if (laterForSameOrders) throw new Error('rollback_target_has_dependent_allocation_changes')
      }

      await enterStockLedgerWriteContext(tx)
      await tx.stockAllocation.updateMany({
        where: { reconciledSyncRunId: targetRunId, status: 'reconciled' },
        data: { status: 'awaiting_grins_sync', reconciledAt: null, reconciledSyncRunId: null },
      })
      for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
        const batch = entries.slice(offset, offset + BATCH_SIZE)
        const values = Prisma.join(batch.map((entry) => Prisma.sql`(
          ${entry.productId}::text,
          ${entry.previousGrinsStock}::integer,
          ${entry.previousGrinsStockRunId}::text
        )`))
        await tx.$executeRaw`
          UPDATE "Product" p
          SET "grinsStock" = restored."grinsStock",
              "grinsStockRunId" = restored."grinsStockRunId",
              "grinsStockUpdatedAt" = clock_timestamp(),
              "updatedAt" = clock_timestamp()
          FROM (VALUES ${values}) AS restored(id, "grinsStock", "grinsStockRunId")
          WHERE p.id = restored.id
        `
      }
      await recomputeManagedAvailability(tx, entries.map((entry) => entry.productId))
      const violations = await stockLedgerInvariantViolations(tx, entries.map((entry) => entry.productId))
      if (violations.length) throw new Error('stock_rollback_invariant_failed')
      await tx.syncRun.update({
        where: { id: rollbackRun.id },
        data: {
          status: 'completed', finishedAt: new Date(), sourceIdentity: `rollback:${targetRunId}`,
          productsTotal: entries.length, productsSynced: entries.length, errorCount: 0,
          errorSample: { targetRunId, allocationsRestored: reconciled.length } as never,
        },
      })
      return { runId: rollbackRun.id, restored: entries.length }
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    await db.syncRun.update({
      where: { id: rollbackRun.id },
      data: { status: 'failed', finishedAt: new Date(), errorCount: 1, errorSample: { targetRunId, fatal: reason } as never },
    }).catch(() => {})
    throw error
  } finally {
    await releaseSyncLock(db, rollbackRun.id).catch(() => {})
  }
}
