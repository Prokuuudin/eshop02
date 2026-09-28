import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpAdapter, ErpProduct } from './erp-adapter'
import { upsertProducts } from './upsert-products'
import { getErpExtraData, mergeEnabledPriceTiers, replaceErpExtraData, type ErpExtraData } from './erp-extra-data-store'
import { getSyncRules } from './sync-rules'
import { withRetry } from './retry'
import { SyncLogger, type SyncError } from './logger'
import { acquireSyncLock, refreshSyncLock, releaseSyncLock } from './sync-lock'

const BATCH_SIZE = 200
const STALE_THRESHOLD_MS = 30 * 60 * 1000
const MAX_CONSECUTIVE_FETCH_ERRORS = 5

export interface SyncRunResult {
  runId: string
  status: 'completed' | 'failed' | 'skipped'
  productsSynced: number
  deactivated: number
  errorCount: number
  unlinkedXml?: number
  softDeletedSkipped?: number
  /** Why the run did not start, e.g. 'already_running' for status 'skipped'. */
  reason?: string
  /** Short fatal error message for a failed run. */
  fatal?: string
}

export interface RunSyncOptions {
  /**
   * Secret-free diagnostics (preflight metrics, warnings, XML SHA-256) persisted
   * in SyncRun.errorSample as an object. Without it errorSample keeps the
   * historical SyncError[] shape.
   */
  diagnostics?: Record<string, unknown>
}

function buildErrorSample(
  options: RunSyncOptions,
  batchErrors: SyncError[],
  outcome: { fatal?: string; unlinkedXml: number; softDeletedSkipped: number },
): unknown {
  if (!options.diagnostics) {
    const sample = outcome.fatal ? [...batchErrors, { batch: -1, message: outcome.fatal }] : batchErrors
    return sample.length > 0 ? sample : undefined
  }
  return { ...options.diagnostics, ...outcome, batchErrors }
}

export async function runSync(
  adapter: ErpAdapter,
  db: ExtendedPrismaClient,
  triggeredBy: 'cron' | 'manual' | 'webhook' = 'cron',
  options: RunSyncOptions = {},
): Promise<SyncRunResult> {
  const logger = new SyncLogger()

  const syncRun = await db.syncRun.create({ data: { status: 'running', triggeredBy } })
  const runId = syncRun.id

  const acquired = await acquireSyncLock(db, runId, STALE_THRESHOLD_MS)
  if (!acquired) {
    // Overlapping schedules are expected, not a failure: record the skip, touch
    // no Product and leave the lease to its owner.
    await db.syncRun.update({
      where: { id: runId },
      data: { status: 'skipped', finishedAt: new Date(), errorSample: { reason: 'already_running' } as unknown as never },
    })
    logger.info('Sync skipped: another run holds the lock', { runId, reason: 'already_running' })
    return { runId, status: 'skipped', productsSynced: 0, deactivated: 0, errorCount: 0, reason: 'already_running' }
  }

  // Heartbeat before every unit of Product work: a run that lost its lease must
  // not start another batch or the final metadata/completion transaction.
  const heartbeat = async () => {
    if (!await refreshSyncLock(db, runId, STALE_THRESHOLD_MS)) {
      throw new Error('Sync lock ownership lost')
    }
  }

  // Only the process that acquired the lock may retire stale run records. A
  // long but healthy run keeps its lock refreshed and must not be marked failed
  // by a competing invocation.
  await db.syncRun.updateMany({
    where: {
      id: { not: runId },
      status: 'running',
      startedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    data: { status: 'failed', finishedAt: new Date() },
  })

  let productsSynced = 0
  let productsTotal = 0
  const deactivated = 0
  let consecutiveFetchErrors = 0
  let unlinkedXml = 0
  let softDeletedSkipped = 0
  const seenExternalIds = new Set<string>()
  const extraDataByExternalId: Record<string, ErpExtraData> = {}
  const rules = getSyncRules()
  const currentExtraData = await getErpExtraData(db)

  try {
    let cursor: string | number | undefined = undefined
    let hasMore = true

    while (hasMore) {
      let fetchResult

      try {
        fetchResult = await withRetry(() => adapter.fetchPage(cursor), {
          maxAttempts: 3,
          baseDelayMs: 1000,
        })
        consecutiveFetchErrors = 0
      } catch (err) {
        consecutiveFetchErrors++
        logger.error('Fetch page failed', {
          cursor,
          consecutive: consecutiveFetchErrors,
          error: String(err),
        })
        if (consecutiveFetchErrors >= MAX_CONSECUTIVE_FETCH_ERRORS) {
          throw new Error(`Aborting: ${MAX_CONSECUTIVE_FETCH_ERRORS} consecutive fetch errors`)
        }
        continue
      }

      await heartbeat()

      const { products, hasMore: more, nextCursor } = fetchResult
      productsTotal += products.length
      hasMore = more
      cursor = nextCursor

      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE)
        const batchIndex = Math.floor(productsSynced / BATCH_SIZE)
        const withId = batch.filter(p => p.externalId)

        if (withId.length < batch.length) {
          logger.info('Skipping products with missing externalId', {
            batchIndex,
            skipped: batch.length - withId.length,
          })
        }

        const feedUnique: ErpProduct[] = []
        const duplicateIds: string[] = []
        for (const p of withId) {
          if (seenExternalIds.has(p.externalId)) {
            duplicateIds.push(p.externalId)
            continue
          }
          seenExternalIds.add(p.externalId)
          feedUnique.push(p)
        }
        if (duplicateIds.length > 0) {
          logger.recordBatchError(batchIndex, new Error('Duplicate externalId in feed'), duplicateIds)
        }

        if (feedUnique.length === 0) continue

        await heartbeat()

        // Exact externalId is the only permitted identity relation. Unknown XML
        // records and soft-deleted claimants are diagnostics, never inserts.
        const claimants = await db.product.findMany({
          where: { externalId: { in: feedUnique.map(product => product.externalId) } },
          select: { externalId: true, isDeleted: true },
        })
        const claimsById = new Map<string, Array<{ isDeleted: boolean }>>()
        for (const claimant of claimants) {
          if (!claimant.externalId) continue
          const claims = claimsById.get(claimant.externalId) ?? []
          claims.push(claimant)
          claimsById.set(claimant.externalId, claims)
        }
        const conflicting = [...claimsById].filter(([, claims]) => claims.length !== 1).map(([id]) => id)
        if (conflicting.length) throw new Error(`Duplicate externalId claimants: ${conflicting.join(', ')}`)
        const valid = feedUnique.filter(product => {
          const claim = claimsById.get(product.externalId)?.[0]
          if (!claim) { unlinkedXml++; return false }
          if (claim.isDeleted) { softDeletedSkipped++; return false }
          return true
        })
        for (const product of valid) if (product.prices || product.warehouseQuantities) {
          const incoming = {
            prices: {
              price1: product.prices?.price1 ?? 0,
              price2: product.prices?.price2 ?? 0,
              price3: product.prices?.price3 ?? 0,
              price4: product.prices?.price4 ?? 0,
            },
            warehouseQuantities: product.warehouseQuantities ?? {},
          }
          extraDataByExternalId[product.externalId] = mergeEnabledPriceTiers(currentExtraData[product.externalId], incoming, rules.enabledPriceTiers)
        }
        if (valid.length === 0) continue

        try {
          const committed = await withRetry(() => db.$transaction(async tx => {
            const affected = await upsertProducts(tx as ExtendedPrismaClient, valid, runId)
            await tx.syncRun.update({ where: { id: runId }, data: { productsTotal, productsSynced: productsSynced + affected } })
            return affected
          }), {
            maxAttempts: 3,
            baseDelayMs: 1000,
          })
          productsSynced += committed
          logger.info('Batch upserted', { batchIndex, count: valid.length, total: productsSynced })
        } catch (err) {
          logger.recordBatchError(batchIndex, err, valid.map(p => p.externalId))
        }
      }

      // Progress is committed in the same transaction as each deterministic batch.
    }

    const errorCount = logger.getErrorCount()
    const errorSample = logger.getErrorSample()

    if (errorCount > 0) {
      logger.error('Sync completed with batch errors — skipping deactivation', { errorCount })
      const sample = buildErrorSample(options, errorSample, { unlinkedXml, softDeletedSkipped })
      await db.syncRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          productsTotal,
          deactivated: 0,
          errorCount,
          // cast required: Prisma Json field does not accept typed arrays directly
          ...(sample !== undefined && { errorSample: sample as unknown as never }),
        },
      })
      await releaseSyncLock(db, runId).catch(() => {})
      return { runId, status: 'failed', productsSynced, deactivated: 0, errorCount, unlinkedXml, softDeletedSkipped }
    }

    await heartbeat()
    const completedSample = options.diagnostics
      ? buildErrorSample(options, [], { unlinkedXml, softDeletedSkipped })
      : undefined

    // Missing/local-only Products retain their publication state. Metadata and
    // the completed marker commit together, so a partial run cannot look done.
    await db.$transaction(async tx => {
      if (Object.keys(extraDataByExternalId).length > 0) {
        await replaceErpExtraData(tx as ExtendedPrismaClient, { ...currentExtraData, ...extraDataByExternalId })
      }
      await tx.syncRun.update({
        where: { id: runId },
        data: {
          status: 'completed', finishedAt: new Date(), productsTotal, productsSynced, deactivated: 0, errorCount: 0,
          ...(completedSample !== undefined && { errorSample: completedSample as unknown as never }),
        },
      })
    }, { timeout: 60_000 })

    await releaseSyncLock(db, runId).catch(() => {})
    return { runId, status: 'completed', productsSynced, deactivated, errorCount: 0, unlinkedXml, softDeletedSkipped }
  } catch (err) {
    logger.error('Sync failed', { error: String(err) })

    const fatal = err instanceof Error ? err.message : String(err)
    const sample = buildErrorSample(options, logger.getErrorSample(), { fatal, unlinkedXml, softDeletedSkipped })
    await db.syncRun
      .update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          productsTotal,
          errorCount: logger.getErrorCount() + 1,
          ...(sample !== undefined && { errorSample: sample as unknown as never }),
        },
      })
      .catch(() => {})

    await releaseSyncLock(db, runId).catch(() => {})

    return {
      runId,
      status: 'failed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount() + 1,
      unlinkedXml,
      softDeletedSkipped,
      fatal,
    }
  }
}
