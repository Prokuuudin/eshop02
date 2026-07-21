import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpAdapter } from './erp-adapter'
import { upsertProducts } from './upsert-products'
import { deactivateMissing } from './deactivate-missing'
import { withRetry } from './retry'
import { SyncLogger } from './logger'

const BATCH_SIZE = 200
const STALE_THRESHOLD_MS = 30 * 60 * 1000
const MAX_CONSECUTIVE_FETCH_ERRORS = 5

export interface SyncRunResult {
  runId: string
  status: 'completed' | 'failed'
  productsSynced: number
  deactivated: number
  errorCount: number
}

export async function runSync(
  adapter: ErpAdapter,
  db: ExtendedPrismaClient,
  triggeredBy: 'cron' | 'manual' | 'webhook' = 'cron',
): Promise<SyncRunResult> {
  const logger = new SyncLogger()

  await db.syncRun.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    data: { status: 'failed', finishedAt: new Date() },
  })

  const activeRun = await db.syncRun.findFirst({ where: { status: 'running' } })
  if (activeRun) {
    throw new Error(`Sync already running (id: ${activeRun.id})`)
  }

  const syncRun = await db.syncRun.create({ data: { status: 'running', triggeredBy } })
  const runId = syncRun.id

  let productsSynced = 0
  let deactivated = 0
  let consecutiveFetchErrors = 0

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

      const { products, hasMore: more, nextCursor } = fetchResult
      hasMore = more
      cursor = nextCursor

      for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE)
        const batchIndex = Math.floor(productsSynced / BATCH_SIZE)
        const valid = batch.filter(p => p.externalId)

        if (valid.length < batch.length) {
          logger.info('Skipping products with missing externalId', {
            batchIndex,
            skipped: batch.length - valid.length,
          })
        }

        if (valid.length === 0) continue

        try {
          await withRetry(() => upsertProducts(db, valid, runId), {
            maxAttempts: 3,
            baseDelayMs: 1000,
          })
          productsSynced += valid.length
          logger.info('Batch upserted', { batchIndex, count: valid.length, total: productsSynced })
        } catch (err) {
          logger.recordBatchError(batchIndex, err, valid.map(p => p.externalId))
        }
      }

      await db.syncRun.update({ where: { id: runId }, data: { productsSynced } })
    }

    deactivated = await deactivateMissing(db, runId)
    logger.info('Deactivation complete', { deactivated })

    const errorSample = logger.getErrorSample()
    await db.syncRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        productsSynced,
        deactivated,
        errorCount: logger.getErrorCount(),
        // cast required: Prisma Json field does not accept typed arrays directly
        ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
      },
    })

    return {
      runId,
      status: 'completed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount(),
    }
  } catch (err) {
    logger.error('Sync failed', { error: String(err) })

    const errorSample = logger.getErrorSample()
    await db.syncRun
      .update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          productsSynced,
          errorCount: logger.getErrorCount() + 1,
          ...(errorSample.length > 0 && { errorSample: errorSample as unknown as never }),
        },
      })
      .catch(() => {})

    return {
      runId,
      status: 'failed',
      productsSynced,
      deactivated,
      errorCount: logger.getErrorCount() + 1,
    }
  }
}
