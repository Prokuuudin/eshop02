import { createHash, randomUUID } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import type { ErpAdapter, ErpProduct } from './erp-adapter'
import { getErpExtraData } from './erp-extra-data-store'
import { auditGrinsXml, parseGrinsXml, type GrinsXmlAudit } from './grins-xml-parser'
import { acquireSyncLock, isSyncLockHeld, releaseSyncLock } from './sync-lock'
import { buildSyncDryRunReport } from './sync-dry-run'
import { evaluatePreflight, loadPreflightState, type PreflightResult } from './sync-preflight'
import type { runSync as RunSync, SyncRunResult } from './sync-runner'

// Manual (admin-uploaded) GrinS export.xml import. It is the scheduled FULL sync
// with a different source: same parser, same fail-closed preflight, same
// update-only runSync and the same lock. Nothing here decides prices or stock.

export const MANUAL_IMPORT_MAX_BYTES = 20 * 1024 * 1024
export const MANUAL_IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000
export const MANUAL_IMPORT_KIND = 'admin-manual-import'
export const MANUAL_IMPORT_RESTORE_KIND = 'admin-manual-import-restore'
const PENDING_KEY = 'grins-manual-import-pending'
export const BACKUP_KEY_PREFIX = 'grins-manual-import-backup:'
const BACKUPS_KEPT = 5
const SAMPLE_SIZE = 10
const RESTORE_BATCH_SIZE = 500
const LOCK_STALE_MS = 30 * 60 * 1000

export const sha256Hex = (content: string | Uint8Array): string =>
  createHash('sha256').update(content).digest('hex')

export type UploadErrorCode = 'file_required' | 'empty_file' | 'file_too_large' | 'not_xml_file' | 'invalid_encoding' | 'forbidden_xml_construct'

/**
 * Validates the raw upload before any XML parsing. The decoded string keeps a
 * BOM, so sha256(xml as UTF-8) equals sha256 of the uploaded bytes.
 */
export function decodeUpload(bytes: Uint8Array, fileName: string): { ok: true; xml: string; sha256: string } | { ok: false; error: UploadErrorCode } {
  if (bytes.byteLength === 0) return { ok: false, error: 'empty_file' }
  if (bytes.byteLength > MANUAL_IMPORT_MAX_BYTES) return { ok: false, error: 'file_too_large' }
  if (!/\.xml$/iu.test(fileName.trim())) return { ok: false, error: 'not_xml_file' }
  let xml: string
  try {
    xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return { ok: false, error: 'invalid_encoding' }
  }
  const declared = /^﻿?<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/iu.exec(xml)?.[1]
  if (declared && declared.toLowerCase() !== 'utf-8') return { ok: false, error: 'invalid_encoding' }
  // The parser never expands entities; refusing DTDs outright removes XXE and
  // entity-expansion vectors instead of relying on parser settings alone.
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) return { ok: false, error: 'forbidden_xml_construct' }
  return { ok: true, xml, sha256: sha256Hex(bytes) }
}

export interface ManualImportSummary {
  rows: number
  matched: number
  unlinked: number
  softDeletedSkipped: number
  priceChanges: number
  largePriceChanges: number
  priceZero: number
  stockChanges: number
  stockToZero: number
  duplicateSkus: number
  conflicts: number
  invalidValues: number
  negativeValues: number
  linkedMissingFromXml: number
  inserts: 0
  deactivations: 0
}

export interface ManualImportSamples {
  unlinked: string[]
  duplicates: string[]
  invalidValues: Array<{ sku: string; field: string; value: string }>
  priceChanges: Array<{ externalId: string; before: unknown; after: unknown }>
  stockChanges: Array<{ externalId: string; before: unknown; after: unknown }>
}

export interface FeedEvaluation {
  audit: GrinsXmlAudit
  products: ErpProduct[]
  preflight: PreflightResult
  summary: ManualImportSummary
  samples: ManualImportSamples
}

/** Read-only: parse + scheduled preflight + change counts against the current DB. */
export async function evaluateFeed(db: ExtendedPrismaClient, xml: string): Promise<FeedEvaluation> {
  const audit = auditGrinsXml(xml)
  const products = audit.validXml && audit.itemCount > 0 ? parseGrinsXml(xml) : []
  const preflight = evaluatePreflight({ audit, products, ...(await loadPreflightState(db)) })
  const report = products.length > 0
    ? buildSyncDryRunReport(products, await db.product.findMany({
      select: { id: true, externalId: true, sku: true, price: true, stock: true, isActive: true, isDeleted: true },
    }), await getErpExtraData(db))
    : null
  const m = preflight.metrics
  return {
    audit,
    products,
    preflight,
    summary: {
      rows: audit.itemCount,
      matched: m.linked,
      unlinked: m.unlinked,
      softDeletedSkipped: m.softDeletedSkipped,
      priceChanges: m.priceChanged,
      largePriceChanges: m.largePriceChanges,
      priceZero: m.priceZero,
      stockChanges: report?.changes.stock.count ?? 0,
      stockToZero: report?.stockAnalysis.positiveToZero ?? 0,
      duplicateSkus: audit.duplicateExternalIds.length,
      conflicts: report?.conflicts ?? 0,
      invalidValues: audit.invalidPrices.length + audit.invalidStocks.length,
      negativeValues: audit.negativePrices.length + audit.negativeStocks.length,
      linkedMissingFromXml: m.linkedMissingFromXml,
      inserts: 0,
      deactivations: 0,
    },
    samples: {
      unlinked: report?.unlinkedXmlSample.slice(0, SAMPLE_SIZE) ?? [],
      duplicates: audit.duplicateExternalIds.slice(0, SAMPLE_SIZE),
      invalidValues: [...audit.invalidPrices, ...audit.invalidStocks].slice(0, SAMPLE_SIZE),
      priceChanges: (report?.changes.price.samples ?? []).slice(0, SAMPLE_SIZE).map(({ externalId, before, after }) => ({ externalId, before, after })),
      stockChanges: (report?.changes.stock.samples ?? []).slice(0, SAMPLE_SIZE).map(({ externalId, before, after }) => ({ externalId, before, after })),
    },
  }
}

// ─── Pending preview: the exact uploaded snapshot, bound to its SHA-256 ──────

export interface PendingPreview {
  previewId: string
  sha256: string
  fileName: string
  sizeBytes: number
  actorId: string
  createdAt: string
  expiresAt: string
  xml: string
}

/** Stores the previewed file. A newer preview replaces an older one (single slot). */
export async function savePendingPreview(
  db: ExtendedPrismaClient,
  input: Omit<PendingPreview, 'previewId' | 'createdAt' | 'expiresAt'>,
  now: Date = new Date(),
): Promise<PendingPreview> {
  const preview: PendingPreview = {
    ...input,
    previewId: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MANUAL_IMPORT_PREVIEW_TTL_MS).toISOString(),
  }
  const value = preview as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({ where: { key: PENDING_KEY }, create: { key: PENDING_KEY, value }, update: { value } })
  return preview
}

export type ConsumeError = 'preview_not_found' | 'preview_mismatch' | 'preview_expired' | 'content_mismatch'

/**
 * Atomically takes the pending preview out of storage. Only the uploader, with
 * the exact previewId and SHA-256 they saw, can consume it — and only once.
 */
export async function consumePendingPreview(
  db: ExtendedPrismaClient,
  input: { previewId: string; sha256: string; actorId: string },
  now: Date = new Date(),
): Promise<{ ok: true; preview: PendingPreview } | { ok: false; error: ConsumeError }> {
  const rows = await db.$queryRawUnsafe<Array<{ value: PendingPreview }>>(
    `DELETE FROM "KeyValueSetting"
      WHERE key = $1 AND value->>'previewId' = $2 AND value->>'sha256' = $3 AND value->>'actorId' = $4
      RETURNING value`,
    PENDING_KEY, input.previewId, input.sha256, input.actorId,
  )
  const preview = rows[0]?.value
  if (!preview) {
    const existing = await db.keyValueSetting.findUnique({ where: { key: PENDING_KEY }, select: { key: true } })
    return { ok: false, error: existing ? 'preview_mismatch' : 'preview_not_found' }
  }
  if (Date.parse(preview.expiresAt) < now.getTime()) return { ok: false, error: 'preview_expired' }
  if (typeof preview.xml !== 'string' || sha256Hex(preview.xml) !== input.sha256) return { ok: false, error: 'content_mismatch' }
  return { ok: true, preview }
}

// ─── Pre-apply backup and restore ────────────────────────────────────────────

/** [externalId, price, stock, erpPriceMissing, manualPriceApproved, manualApprovedPrice] */
export type BackupRow = [string, string, number, boolean, boolean, string | null]

interface BackupValue {
  createdAt: string
  previewId: string
  sha256: string
  rows: BackupRow[]
}

/** Every field runSync can change on a linked, non-deleted Product. */
async function readSyncOwnedState(db: ExtendedPrismaClient): Promise<BackupRow[]> {
  const rows = await db.$queryRawUnsafe<Array<{ externalId: string; price: string; stock: number; erpPriceMissing: boolean; manualPriceApproved: boolean; manualApprovedPrice: string | null }>>(
    `SELECT "externalId", price::text AS price, stock, "erpPriceMissing", "manualPriceApproved", "manualApprovedPrice"::text AS "manualApprovedPrice"
       FROM "Product" WHERE "externalId" IS NOT NULL AND "isDeleted" = false ORDER BY "externalId"`,
  )
  return rows.map(r => [r.externalId, r.price, r.stock, r.erpPriceMissing, r.manualPriceApproved, r.manualApprovedPrice])
}

export async function createPreImportBackup(
  db: ExtendedPrismaClient,
  meta: { previewId: string; sha256: string },
  now: Date = new Date(),
): Promise<{ key: string; rows: number }> {
  const rows = await readSyncOwnedState(db)
  const key = `${BACKUP_KEY_PREFIX}${now.toISOString()}:${meta.previewId}`
  const value: BackupValue = { createdAt: now.toISOString(), ...meta, rows }
  await db.keyValueSetting.create({ data: { key, value: value as unknown as Prisma.InputJsonValue } })
  const backups = await db.keyValueSetting.findMany({
    where: { key: { startsWith: BACKUP_KEY_PREFIX } },
    orderBy: { key: 'desc' },
    select: { key: true },
  })
  const stale = backups.slice(BACKUPS_KEPT).map(b => b.key)
  if (stale.length > 0) await db.keyValueSetting.deleteMany({ where: { key: { in: stale } } })
  return { key, rows: rows.length }
}

export async function listPreImportBackups(db: ExtendedPrismaClient): Promise<string[]> {
  const rows = await db.keyValueSetting.findMany({ where: { key: { startsWith: BACKUP_KEY_PREFIX } }, orderBy: { key: 'desc' }, select: { key: true } })
  return rows.map(r => r.key)
}

function buildRestoreQuery(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, i) => {
    const b = i * 6
    return `($${b + 1}::text,$${b + 2}::numeric,$${b + 3}::integer,$${b + 4}::boolean,$${b + 5}::boolean,$${b + 6}::numeric)`
  }).join(',')
  return `
    UPDATE "Product" AS p
       SET price = v.price, stock = v.stock, "erpPriceMissing" = v.epm,
           "manualPriceApproved" = v.mpa, "manualApprovedPrice" = v.map,
           "revision" = p."revision" + 1, "updatedAt" = now()
      FROM (VALUES ${values}) AS v("externalId", price, stock, epm, mpa, map)
     WHERE p."externalId" = v."externalId" AND p."isDeleted" = false
       AND (p.price IS DISTINCT FROM v.price OR p.stock IS DISTINCT FROM v.stock
         OR p."erpPriceMissing" IS DISTINCT FROM v.epm OR p."manualPriceApproved" IS DISTINCT FROM v.mpa
         OR p."manualApprovedPrice" IS DISTINCT FROM v.map)`
}

export interface RestoreResult {
  key: string
  backupRows: number
  differing: number
  restored: number
  runId?: string
}

/**
 * Puts the sync-owned fields back to the pre-import backup. Dry-run unless
 * execute=true; execute holds the shared sync lock and commits all-or-nothing.
 * ERP extra metadata (price1-4, per-warehouse quantities) is not restored: the
 * next correct import replaces it.
 */
export async function restorePreImportBackup(
  db: ExtendedPrismaClient,
  key: string,
  options: { execute: boolean },
): Promise<RestoreResult> {
  if (!key.startsWith(BACKUP_KEY_PREFIX)) throw new Error('Not a manual-import backup key')
  const row = await db.keyValueSetting.findUnique({ where: { key } })
  const backup = row?.value as unknown as BackupValue | undefined
  if (!backup || !Array.isArray(backup.rows)) throw new Error(`Backup not found: ${key}`)

  const current = new Map((await readSyncOwnedState(db)).map(r => [r[0], JSON.stringify(r)]))
  const differing = backup.rows.filter(r => current.has(r[0]) && current.get(r[0]) !== JSON.stringify(r))
  const result: RestoreResult = { key, backupRows: backup.rows.length, differing: differing.length, restored: 0 }
  if (!options.execute || differing.length === 0) return result

  const run = await db.syncRun.create({ data: { status: 'running', triggeredBy: 'restore' } })
  result.runId = run.id
  const diagnostics = { kind: MANUAL_IMPORT_RESTORE_KIND, backupKey: key, sourceSha256: backup.sha256 }
  if (!await acquireSyncLock(db, run.id, LOCK_STALE_MS)) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: 'skipped', finishedAt: new Date(), errorSample: { ...diagnostics, reason: 'already_running' } as unknown as never } })
    throw new Error('Another sync holds the lock; restore not started')
  }
  try {
    const restored = await db.$transaction(async tx => {
      let count = 0
      for (let i = 0; i < differing.length; i += RESTORE_BATCH_SIZE) {
        const batch = differing.slice(i, i + RESTORE_BATCH_SIZE)
        count += await tx.$executeRawUnsafe(buildRestoreQuery(batch.length), ...batch.flat())
      }
      await tx.syncRun.update({
        where: { id: run.id },
        data: { status: 'completed', finishedAt: new Date(), productsTotal: backup.rows.length, productsSynced: count, errorSample: diagnostics as unknown as never },
      })
      return count
    }, { timeout: 180_000, maxWait: 30_000 })
    result.restored = restored
    return result
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), errorCount: 1, errorSample: { ...diagnostics, fatal: err instanceof Error ? err.message : String(err) } as unknown as never },
    }).catch(() => {})
    throw err
  } finally {
    await releaseSyncLock(db, run.id).catch(() => {})
  }
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export type ApplyRejection = ConsumeError | 'sync_running' | 'preflight_failed' | 'backup_failed'

export type ManualApplyOutcome =
  | { status: 'rejected'; error: ApplyRejection; hard?: string[]; runId?: string }
  | { status: SyncRunResult['status']; result: SyncRunResult; backupKey: string; fileName: string; sha256: string }

export interface ManualApplyDeps {
  db: ExtendedPrismaClient
  runSync: typeof RunSync
  now?: () => Date
}

export async function applyManualImport(
  deps: ManualApplyDeps,
  input: { previewId: string; sha256: string; actorId: string },
): Promise<ManualApplyOutcome> {
  const { db } = deps
  const now = deps.now ?? (() => new Date())

  // Checked before consuming, so a busy lock does not burn the preview.
  if (await isSyncLockHeld(db)) return { status: 'rejected', error: 'sync_running' }

  const consumed = await consumePendingPreview(db, input, now())
  if (!consumed.ok) return { status: 'rejected', error: consumed.error }
  const { preview } = consumed
  const base = { kind: MANUAL_IMPORT_KIND, xmlSha256: preview.sha256, fileName: preview.fileName, sizeBytes: preview.sizeBytes, actorId: input.actorId, previewId: preview.previewId }

  const recordFailure = async (stage: string, fatal: string, extra: Record<string, unknown> = {}): Promise<string | undefined> => {
    try {
      const run = await db.syncRun.create({
        data: { status: 'failed', triggeredBy: 'manual', finishedAt: now(), errorCount: 1, errorSample: { ...base, stage, fatal, ...extra } as unknown as never },
      })
      return run.id
    } catch {
      return undefined
    }
  }

  // The DB may have changed since the preview: re-run the same gates on the stored snapshot.
  const evaluation = await evaluateFeed(db, preview.xml)
  const { preflight } = evaluation
  if (preflight.hard.length > 0) {
    const runId = await recordFailure('preflight', `preflight HARD checks failed (${preflight.hard.length})`, {
      hardFailures: preflight.hard, warnings: preflight.warnings, metrics: preflight.metrics,
    })
    return { status: 'rejected', error: 'preflight_failed', hard: preflight.hard, runId }
  }

  let backup: { key: string; rows: number }
  try {
    backup = await createPreImportBackup(db, { previewId: preview.previewId, sha256: preview.sha256 }, now())
  } catch (err) {
    const runId = await recordFailure('backup', `pre-import backup failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500))
    return { status: 'rejected', error: 'backup_failed', runId }
  }

  const products = evaluation.products
  const adapter: ErpAdapter = { name: 'grins-xml-admin-upload', fetchPage: async () => ({ products, hasMore: false }) }
  const result = await deps.runSync(adapter, db, 'manual', {
    diagnostics: {
      ...base, backupKey: backup.key, warnings: preflight.warnings, metrics: preflight.metrics,
      // productsSynced counts processed rows; these are the actual field changes at apply time.
      changes: { price: evaluation.summary.priceChanges, stock: evaluation.summary.stockChanges },
    },
  })
  return { status: result.status, result, backupKey: backup.key, fileName: preview.fileName, sha256: preview.sha256 }
}
