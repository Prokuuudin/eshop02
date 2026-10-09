import { createHash, randomUUID } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import type { ErpProduct } from './erp-adapter'
import type { GrinsXmlAudit } from './grins-xml-parser'
import { applyAtomic, restoreAtomic } from './manual-import-atomic'
import { evaluatePriceFeed, priceCatalogFingerprint } from './manual-price-preflight'
import type { PreflightResult } from './sync-preflight'
import type { runSync as RunSync, SyncRunResult } from './sync-runner'

// Manual GrinS allows only price2 updates, with exact cents, dedicated price
// gates and an atomic transaction. XML stock is never a write input.

export const MANUAL_IMPORT_MAX_BYTES = 20 * 1024 * 1024
export const MANUAL_IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1000
export const MANUAL_IMPORT_MODE = 'prices-only' as const
export const MANUAL_IMPORT_KIND = 'admin-manual-import'
export const MANUAL_IMPORT_RESTORE_KIND = 'admin-manual-import-restore'
const PENDING_KEY = 'grins-manual-import-pending'
export const BACKUP_KEY_PREFIX = 'grins-manual-import-backup:'

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
  catalogFingerprint: string
  audit: GrinsXmlAudit
  products: ErpProduct[]
  preflight: PreflightResult
  summary: ManualImportSummary
  samples: ManualImportSamples
}

/** Read-only: parse + scheduled preflight + change counts against the current DB. */
export async function evaluateFeed(db: ExtendedPrismaClient, xml: string): Promise<FeedEvaluation> {
  return evaluatePriceFeed(db, xml)
}

// ─── Pending preview: the exact uploaded snapshot, bound to its SHA-256 ──────

export interface PendingPreview {
  mode: typeof MANUAL_IMPORT_MODE
  catalogFingerprint: string
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
  input: Omit<PendingPreview, 'previewId' | 'createdAt' | 'expiresAt' | 'mode' | 'catalogFingerprint'> & { catalogFingerprint?: string },
  now: Date = new Date(),
): Promise<PendingPreview> {
  const preview: PendingPreview = {
    ...input,
    mode: MANUAL_IMPORT_MODE,
    catalogFingerprint: input.catalogFingerprint ?? await priceCatalogFingerprint(db),
    previewId: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MANUAL_IMPORT_PREVIEW_TTL_MS).toISOString(),
  }
  const value = preview as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({ where: { key: PENDING_KEY }, create: { key: PENDING_KEY, value }, update: { value } })
  return preview
}

export type ConsumeError = 'preview_not_found' | 'preview_mismatch' | 'preview_expired' | 'content_mismatch' | 'preview_mode_mismatch'

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
  if (preview.mode !== MANUAL_IMPORT_MODE || typeof preview.catalogFingerprint !== 'string') return { ok: false, error: 'preview_mode_mismatch' }
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
  // Recovery snapshots are pinned; retention requires a separate reviewed procedure.
  return { key, rows: rows.length }
}

export async function listPreImportBackups(db: ExtendedPrismaClient): Promise<string[]> {
  const rows = await db.keyValueSetting.findMany({ where: { key: { startsWith: BACKUP_KEY_PREFIX } }, orderBy: { key: 'desc' }, select: { key: true } })
  return rows.map(r => r.key)
}

export interface RestoreResult {
  key: string
  backupRows: number
  differing: number
  restored: number
  runId?: string
}

/** Version-2 recovery refuses any catalog/ERP change since the successful
 * import. Legacy snapshots permit inspection only. No automatic recovery. */
export async function restorePreImportBackup(
  db: ExtendedPrismaClient,
  key: string,
  options: { execute: boolean },
): Promise<RestoreResult> {
  if (options.execute) return restoreAtomic(db, key, true)
  const stored = await db.keyValueSetting.findUnique({ where: { key } })
  if ((stored?.value as { version?: number } | undefined)?.version === 3) return restoreAtomic(db, key, false)
  if (!key.startsWith(BACKUP_KEY_PREFIX)) throw new Error('Not a manual-import backup key')
  const backup = stored?.value as unknown as BackupValue | undefined
  if (!backup || !Array.isArray(backup.rows)) throw new Error('Backup not found')
  const current = new Map((await readSyncOwnedState(db)).map(row => [row[0], JSON.stringify(row)]))
  return { key, backupRows: backup.rows.length, differing: backup.rows.filter(row => current.get(row[0]) !== JSON.stringify(row)).length, restored: 0 }
}

export type ApplyRejection = ConsumeError | 'sync_running' | 'preflight_failed' | 'backup_failed' | 'already_applied' | 'maintenance_required'

export type ManualApplyOutcome =
  | { status: 'rejected'; error: ApplyRejection; hard?: string[]; runId?: string }
  | { status: SyncRunResult['status']; result: SyncRunResult; backupKey: string; fileName: string; sha256: string }

export interface ManualApplyDeps {
  db: ExtendedPrismaClient
  /** Compatibility with existing callers; the batch runner is never called. */
  runSync?: typeof RunSync
  now?: () => Date
}

export async function applyManualImport(
  deps: ManualApplyDeps,
  input: { previewId: string; sha256: string; actorId: string },
): Promise<ManualApplyOutcome> {
  return applyAtomic(deps, input)
}
