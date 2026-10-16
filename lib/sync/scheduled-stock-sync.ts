import { createHash } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'
import { assertSafeStockFeatureFlags, stockLedgerFlags } from '@/lib/stock-ledger-config'
import type { FtpsDownload } from './ftps-client'
import { manifestPathFor, verifyStockReconciliationManifest } from './ftps-source-verification'
import { auditStockXml, stockStructuralFailures } from './manual-stock-preview'
import { parseGrinsXml } from './grins-xml-parser'
import { evaluateStockSyncPreflight } from './stock-sync-preflight'
import { applyStockSnapshot } from './stock-snapshot'
import type { sendSyncFailureAlert as SendAlert } from './sync-alert'
import { isSyncLockHeld } from './sync-lock'
import { MANUAL_IMPORT_MAX_BYTES } from './manual-import'

export interface ScheduledStockSyncDeps {
  env: Record<string, string | undefined>
  getDb: () => Promise<ExtendedPrismaClient>
  downloadXml: () => Promise<FtpsDownload>
  downloadManifest: (remotePath: string) => Promise<FtpsDownload>
  sendAlert: typeof SendAlert
  now?: () => Date
  /** Optional fail-closed target assertion for operator-only adapters. It runs
   * before every read or write performed by this orchestration. */
  verifyTarget?: (db: ExtendedPrismaClient) => Promise<void>
  sourceLabel?: string
  triggeredBy?: 'cron' | 'manual'
}

export interface ScheduledStockSyncOutcome {
  status: 'disabled' | 'skipped' | 'completed' | 'failed'
  runId?: string
  exitCode: 0 | 1
  reason?: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)
const date = (value: string | undefined): Date | undefined => {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function stockSourceIdentity(input: {
  manifestVerified: boolean
  runStartedAt?: Date
  transportModifiedAt?: Date
  sha256: string
}): string {
  if (input.manifestVerified) {
    if (!input.runStartedAt) throw new Error('verified_manifest_missing_run_started_at')
    return `manifest:${input.runStartedAt.toISOString()}:${input.sha256}`
  }
  if (!input.transportModifiedAt) throw new Error('legacy_stock_source_missing_mdtm')
  return `legacy:${input.transportModifiedAt.toISOString()}:${input.sha256}`
}

export async function runScheduledStockSync(deps: ScheduledStockSyncDeps): Promise<ScheduledStockSyncOutcome> {
  const flags = stockLedgerFlags(deps.env)
  if (!flags.scheduledStocksEnabled) return { status: 'disabled', exitCode: 0 }
  try {
    assertSafeStockFeatureFlags(flags)
  } catch (error) {
    return { status: 'failed', exitCode: 1, reason: errorMessage(error) }
  }

  const now = deps.now ?? (() => new Date())
  const startedAt = now()
  const db = await deps.getDb()
  const triggeredBy = deps.triggeredBy ?? 'cron'
  const sourceLabel = deps.sourceLabel ?? 'FTPS'
  if (deps.verifyTarget) {
    try {
      await deps.verifyTarget(db)
    } catch (error) {
      // A target-identity failure must not attempt even a diagnostic SyncRun.
      return { status: 'failed', exitCode: 1, reason: `target verification failed: ${errorMessage(error)}` }
    }
  }
  const fail = async (reason: string, details: Record<string, unknown> = {}): Promise<ScheduledStockSyncOutcome> => {
    let runId: string | undefined
    try {
      const run = await db.syncRun.create({
        data: {
          status: 'failed', mode: 'stocks-only', triggeredBy, startedAt, finishedAt: now(), errorCount: 1,
          errorSample: { kind: 'scheduled-stocks-only', fatal: reason, ...details } as never,
        },
      })
      runId = run.id
    } catch {}
    logOperationalEvent({ event: 'grins_stock_sync_failed', level: 'error', alert: true, runId, reason })
    await deps.sendAlert({ at: now(), runId, reason, hardFailures: details.hard as string[] | undefined, warnings: details.warnings as string[] | undefined })
    return { status: 'failed', runId, exitCode: 1, reason }
  }

  try {
    if (await isSyncLockHeld(db)) {
      const run = await db.syncRun.create({
        data: { status: 'skipped', mode: 'stocks-only', triggeredBy, startedAt, finishedAt: now(), errorSample: { reason: 'already_running' } as never },
      })
      return { status: 'skipped', runId: run.id, exitCode: 0, reason: 'already_running' }
    }
  } catch (error) {
    return fail(`database unavailable before stock sync: ${errorMessage(error)}`)
  }

  let downloaded: FtpsDownload
  try {
    downloaded = await deps.downloadXml()
  } catch (error) {
    return fail(`${sourceLabel} XML read failed: ${errorMessage(error)}`)
  }
  const downloadedBytes = Buffer.byteLength(downloaded.content, 'utf-8')
  if ((downloaded.remoteSizeBytes !== undefined && downloaded.remoteSizeBytes > MANUAL_IMPORT_MAX_BYTES)
    || downloadedBytes > MANUAL_IMPORT_MAX_BYTES) {
    return fail(`${sourceLabel} XML exceeds the configured import size limit`)
  }
  const sha256 = createHash('sha256').update(downloaded.content, 'utf-8').digest('hex')
  const transportModifiedAt = date(downloaded.modifiedAt)

  let runStartedAt: Date | undefined
  let generatedAt: Date | undefined
  let manifestVerified = false
  if (flags.manifestEnabled) {
    let manifest: FtpsDownload
    try {
      manifest = await deps.downloadManifest(manifestPathFor(deps.env.GRINS_FTPS_REMOTE_PATH || 'export.xml'))
    } catch (error) {
      return fail(`${sourceLabel} manifest read failed: ${errorMessage(error)}`, { sha256 })
    }
    const verification = verifyStockReconciliationManifest(downloaded.content, manifest.content, now(), {
      maxAgeHours: flags.manifestMaxAgeHours,
    })
    if (verification.verdict !== 'PASS') return fail('stock manifest verification failed', { sha256, hard: verification.failures })
    runStartedAt = date(verification.runStartedAt)
    generatedAt = date(verification.generatedAt)
    manifestVerified = true
  } else if (!transportModifiedAt) {
    return fail('legacy stock source has no manifest and FTPS MDTM is unavailable; ordering cannot fail closed', { sha256 })
  }

  const audit = auditStockXml(downloaded.content)
  const structural = stockStructuralFailures(audit)
  if (structural.length) return fail('stock XML structural validation failed', { sha256, hard: structural })
  const products = parseGrinsXml(downloaded.content)

  const [linkedProducts, previousStockRun, previousFullRun] = await Promise.all([
    db.product.findMany({
      where: { externalId: { not: null } },
      select: { id: true, externalId: true, stock: true, grinsStock: true, isActive: true, isDeleted: true },
    }),
    db.syncRun.findFirst({ where: { mode: 'stocks-only', status: 'completed' }, orderBy: { finishedAt: 'desc' }, select: { productsTotal: true } }),
    db.syncRun.findFirst({ where: { mode: 'full', status: 'completed' }, orderBy: { finishedAt: 'desc' }, select: { productsTotal: true } }),
  ])
  const preflight = evaluateStockSyncPreflight(
    audit,
    products,
    linkedProducts.flatMap((row) => row.externalId ? [{ ...row, externalId: row.externalId }] : []),
    previousStockRun?.productsTotal ?? previousFullRun?.productsTotal ?? null,
  )
  if (preflight.hard.length) return fail('stock preflight HARD checks failed', { sha256, hard: preflight.hard, warnings: preflight.warnings, metrics: preflight.metrics })

  const sourceIdentity = stockSourceIdentity({ manifestVerified, runStartedAt, transportModifiedAt, sha256 })
  const result = await applyStockSnapshot(db, products, {
    identity: sourceIdentity,
    sha256,
    transportModifiedAt,
    runStartedAt,
    generatedAt,
    manifestVerified,
  }, preflight, triggeredBy, deps.env)
  if (result.status === 'completed') {
    logOperationalEvent({ event: 'grins_stock_sync_completed', runId: result.runId, matched: result.matched, reconciled: result.reconciled, awaiting: result.awaiting })
    return { status: 'completed', runId: result.runId, exitCode: 0 }
  }
  if (result.status === 'skipped') return { status: 'skipped', runId: result.runId, exitCode: 0, reason: result.reason }
  await deps.sendAlert({ at: now(), runId: result.runId, reason: result.reason ?? 'stock snapshot failed', xmlSha256: sha256, warnings: preflight.warnings, metrics: preflight.metrics })
  return { status: 'failed', runId: result.runId, exitCode: 1, reason: result.reason }
}
