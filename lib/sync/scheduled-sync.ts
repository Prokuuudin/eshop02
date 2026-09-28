import { createHash } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'
import type { ErpAdapter } from './erp-adapter'
import type { FtpsDownload } from './ftps-client'
import { auditGrinsXml, parseGrinsXml } from './grins-xml-parser'
import type { runSync as RunSync } from './sync-runner'
import type { sendSyncFailureAlert as SendAlert } from './sync-alert'
import { isSyncLockHeld } from './sync-lock'
import { evaluatePreflight, loadPreflightState, type PreflightResult } from './sync-preflight'

const SLOW_RUN_WARN_MS = 10 * 60 * 1000
const MAX_REASON_LENGTH = 500

export interface ScheduledSyncDeps {
  env: NodeJS.ProcessEnv
  /** Lazily resolved so a disabled run never touches the database. */
  getDb: () => Promise<ExtendedPrismaClient>
  /** Existing FTPS client download (downloadFtpsFileWithMetadata). */
  download: () => Promise<FtpsDownload>
  runSync: typeof RunSync
  sendAlert: typeof SendAlert
  now?: () => Date
}

export interface ScheduledSyncOutcome {
  status: 'disabled' | 'skipped' | 'completed' | 'failed'
  runId?: string
  exitCode: 0 | 1
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, MAX_REASON_LENGTH)

/**
 * Hourly FULL sync: kill switch → lock probe → FTPS download → full parse →
 * read-only preflight → existing runSync(). Every HARD preflight failure stops
 * before the first Product write. There is no bypass.
 */
export async function runScheduledSync(deps: ScheduledSyncDeps): Promise<ScheduledSyncOutcome> {
  const now = deps.now ?? (() => new Date())
  if (deps.env.SYNC_PULL_ENABLED !== 'true') {
    logOperationalEvent({ event: 'sync_disabled', reason: 'SYNC_PULL_ENABLED is not "true"' })
    return { status: 'disabled', exitCode: 0 }
  }

  const startedAt = now()
  const db = await deps.getDb()

  const fail = async (
    reason: string,
    details: { stage: 'lock-probe' | 'download' | 'preflight' | 'start'; xmlSha256?: string; preflight?: PreflightResult; source?: Record<string, unknown> },
  ): Promise<ScheduledSyncOutcome> => {
    let runId: string | undefined
    try {
      const run = await db.syncRun.create({
        data: {
          status: 'failed',
          triggeredBy: 'cron',
          startedAt,
          finishedAt: now(),
          errorCount: 1,
          errorSample: {
            kind: 'scheduled-full-sync',
            stage: details.stage,
            fatal: reason,
            ...(details.xmlSha256 && { xmlSha256: details.xmlSha256 }),
            ...(details.source && { source: details.source }),
            ...(details.preflight && {
              hardFailures: details.preflight.hard,
              warnings: details.preflight.warnings,
              metrics: details.preflight.metrics,
            }),
          } as unknown as never,
        },
      })
      runId = run.id
    } catch (err) {
      logOperationalEvent({ event: 'erp_sync_run_record_failed', level: 'error', error: message(err) })
    }
    logOperationalEvent({ event: 'erp_sync_failed', level: 'error', alert: true, runId, reason })
    await deps.sendAlert({
      at: now(),
      runId,
      reason,
      xmlSha256: details.xmlSha256,
      hardFailures: details.preflight?.hard,
      warnings: details.preflight?.warnings,
      metrics: details.preflight?.metrics as unknown as Record<string, unknown> | undefined,
    })
    return { status: 'failed', runId, exitCode: 1 }
  }

  // Advisory early exit so an overlapping run neither downloads nor produces a
  // spurious preflight failure. runSync's CAS lock stays the real guard.
  try {
    if (await isSyncLockHeld(db)) {
      const run = await db.syncRun.create({
        data: { status: 'skipped', triggeredBy: 'cron', startedAt, finishedAt: now(), errorSample: { reason: 'already_running' } as unknown as never },
      })
      logOperationalEvent({ event: 'erp_sync_skipped', runId: run.id, reason: 'already_running' })
      return { status: 'skipped', runId: run.id, exitCode: 0 }
    }
  } catch (err) {
    return fail(`database unavailable before sync: ${message(err)}`, { stage: 'lock-probe' })
  }

  let source: FtpsDownload
  try {
    source = await deps.download()
  } catch (err) {
    return fail(`FTPS download failed: ${message(err)}`, { stage: 'download' })
  }

  const xmlSha256 = createHash('sha256').update(source.content, 'utf-8').digest('hex')
  const sourceInfo = { modifiedAt: source.modifiedAt, sizeBytes: Buffer.byteLength(source.content, 'utf-8') }

  let preflight: PreflightResult
  let products: ReturnType<typeof parseGrinsXml>
  try {
    const audit = auditGrinsXml(source.content)
    products = audit.validXml && audit.itemCount > 0 ? parseGrinsXml(source.content) : []
    const state = await loadPreflightState(db)
    preflight = evaluatePreflight({ audit, products, ...state })
  } catch (err) {
    return fail(`preflight could not be evaluated: ${message(err)}`, { stage: 'preflight', xmlSha256, source: sourceInfo })
  }

  logOperationalEvent({ event: 'erp_sync_preflight', xmlSha256, hard: preflight.hard, warnings: preflight.warnings, metrics: preflight.metrics })
  for (const warning of preflight.warnings) logOperationalEvent({ event: 'erp_sync_warning', level: 'warn', xmlSha256, warning })

  if (preflight.hard.length > 0) {
    return fail(`preflight HARD checks failed (${preflight.hard.length})`, { stage: 'preflight', xmlSha256, preflight, source: sourceInfo })
  }

  const adapter: ErpAdapter = { name: 'grins-xml-scheduled', fetchPage: async () => ({ products, hasMore: false }) }
  const diagnostics = {
    kind: 'scheduled-full-sync',
    xmlSha256,
    source: sourceInfo,
    warnings: preflight.warnings,
    metrics: preflight.metrics,
  }

  let result: Awaited<ReturnType<typeof RunSync>>
  try {
    result = await deps.runSync(adapter, db, 'cron', { diagnostics })
  } catch (err) {
    return fail(`sync could not start: ${message(err)}`, { stage: 'start', xmlSha256, preflight, source: sourceInfo })
  }

  const durationMs = now().getTime() - startedAt.getTime()
  if (durationMs > SLOW_RUN_WARN_MS) {
    logOperationalEvent({ event: 'erp_sync_warning', level: 'warn', runId: result.runId, warning: `duration ${Math.round(durationMs / 1000)}s > ${SLOW_RUN_WARN_MS / 1000}s` })
  }
  logOperationalEvent({ event: 'sync_complete', ...result, durationMs, xmlSha256 })

  if (result.status === 'skipped') return { status: 'skipped', runId: result.runId, exitCode: 0 }
  if (result.status === 'completed') return { status: 'completed', runId: result.runId, exitCode: 0 }

  logOperationalEvent({ event: 'erp_sync_failed', level: 'error', alert: true, runId: result.runId, reason: result.fatal })
  await deps.sendAlert({
    at: now(),
    runId: result.runId,
    reason: result.fatal ?? `${result.errorCount} batch error(s); see SyncRun.errorSample`,
    xmlSha256,
    warnings: preflight.warnings,
    metrics: { ...preflight.metrics, productsSynced: result.productsSynced, errorCount: result.errorCount },
  })
  return { status: 'failed', runId: result.runId, exitCode: 1 }
}
