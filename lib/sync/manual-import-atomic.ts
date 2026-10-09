import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { releaseSyncLock } from './sync-lock'
import { buildManualPriceQuery } from './manual-price-query'
import { grinsMaintenanceClosed } from '@/lib/grins-import-maintenance'
import {
  BACKUP_KEY_PREFIX, MANUAL_IMPORT_MODE, MANUAL_IMPORT_KIND, MANUAL_IMPORT_RESTORE_KIND,
  consumePendingPreview, evaluateFeed,
  type ManualApplyDeps, type ManualApplyOutcome, type RestoreResult,
} from './manual-import'

const LEASE_MS = 30 * 60 * 1000
const SHA_PREFIX = 'grins-manual-import-applied:prices-only:'
const json = (value: unknown) => value as Prisma.InputJsonValue
type SnapshotRow = { id: string; externalId: string; price: string; erpPriceMissing: boolean; manualPriceApproved: boolean; manualApprovedPrice: string | null }
type Snapshot = { rows: SnapshotRow[]; fingerprint: string }
type SafeBackup = { version: 3; mode: typeof MANUAL_IMPORT_MODE; runId: string; sha256: string; rows: SnapshotRow[]; afterFingerprint: string; afterExtraHash: string; restored?: boolean }
const rowSignature = (row: SnapshotRow) => JSON.stringify([row.id, row.externalId, row.price, row.erpPriceMissing, row.manualPriceApproved, row.manualApprovedPrice])

// Includes identity, deletion, revisions and timestamps for ALL Products. A sale
// or an ABA change must invalidate recovery, even when the current stock is equal.
async function snapshot(db: ExtendedPrismaClient): Promise<Snapshot> {
  const rows = await db.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT id, "externalId", price::text AS price, "erpPriceMissing", "manualPriceApproved", "manualApprovedPrice"::text AS "manualApprovedPrice"
     FROM "Product" WHERE "externalId" IS NOT NULL AND NOT "isDeleted" ORDER BY id`,
  )
  const hashes = await db.$queryRawUnsafe<Array<{ fingerprint: string }>>(
    `SELECT encode(sha256(convert_to(COALESCE(string_agg(row_to_json(p)::text, ',' ORDER BY p.id), ''), 'UTF8')), 'hex') AS fingerprint FROM "Product" p`,
  )
  return { rows, fingerprint: hashes[0].fingerprint }
}

async function lockTransaction(tx: ExtendedPrismaClient, runId: string) {
  await tx.$executeRawUnsafe(`SELECT set_config('lock_timeout', '10000', true)`)
  await tx.$executeRawUnsafe(`SELECT set_config('statement_timeout', '180000', true)`)
  // Table locks precede the lease row lock: otherwise a competing INSERT could
  // hold ROW EXCLUSIVE on settings while waiting for our lease row, deadlocking
  // our table-lock upgrade. Product first also matches catalog-editor writes.
  await tx.$executeRawUnsafe('LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE')
  await tx.$executeRawUnsafe('LOCK TABLE "KeyValueSetting" IN SHARE ROW EXCLUSIVE MODE')
  const owner = await tx.$queryRawUnsafe<Array<{ owned: boolean }>>(
    `SELECT (value->>'runId' = $1 AND (value->>'lockedUntil')::timestamptz > now()) AS owned
       FROM "KeyValueSetting" WHERE key = 'sync-run-lock' FOR UPDATE`, runId,
  )
  if (!owner[0]?.owned) throw new Error('sync_ownership_lost')
  // PostgreSQL writers (including old code and other server processes) cannot
  // interleave with the preflight/snapshot/catalog transaction. Reads continue.
}

async function acquire(db: ExtendedPrismaClient, runId: string) {
  // Never take an expired lease from a running/unknown worker. Expiration is
  // not proof of its death. Recovery requires operator investigation.
  const rows = await db.$queryRawUnsafe<Array<{ key: string }>>(
    `INSERT INTO "KeyValueSetting" (key,value,"updatedAt") VALUES ('sync-run-lock',$1::jsonb,now())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,"updatedAt"=now()
      WHERE ("KeyValueSetting".value->>'lockedUntil')::timestamptz < now()
        AND (("KeyValueSetting".value->>'lockedUntil')::timestamptz <= '1970-01-02'::timestamptz
          OR EXISTS (SELECT 1 FROM "SyncRun" s WHERE s.id = "KeyValueSetting".value->>'runId' AND s.status <> 'running'))
      RETURNING key`, JSON.stringify({ runId, lockedUntil: new Date(Date.now() + LEASE_MS).toISOString() }),
  )
  return rows.length > 0
}

async function extraHash(db: ExtendedPrismaClient): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ hash: string }>>(`SELECT encode(sha256(convert_to(value::text, 'UTF8')), 'hex') AS hash FROM "KeyValueSetting" WHERE key='erp-extra-data'`)
  return rows[0]?.hash ?? 'absent'
}

/** Resolves a lost COMMIT acknowledgement under the same row lock. Never
 * overwrite a committed completed marker with a catch-path failure. */
async function resolve(db: ExtendedPrismaClient, runId: string, base: Record<string, unknown>) {
  return db.$transaction(async transaction => {
    const tx = transaction as unknown as ExtendedPrismaClient
    await tx.$executeRawUnsafe(`SELECT set_config('lock_timeout', '10000', true)`)
    await tx.$queryRawUnsafe(`SELECT key FROM "KeyValueSetting" WHERE key = 'sync-run-lock' FOR UPDATE`)
    const run = await tx.syncRun.findUniqueOrThrow({ where: { id: runId } })
    if (run.status === 'completed') return run
    await tx.syncRun.update({ where: { id: runId }, data: {
      status: 'failed', finishedAt: new Date(), productsSynced: 0, errorCount: 1,
      errorSample: json({ ...base, ...(base.kind === MANUAL_IMPORT_KIND && { backupKey: null, uncommittedBackupKey: base.backupKey ?? null }), stage: 'rolled_back', fatal: 'atomic_import_failed' }),
    } })
    return null
  }, { timeout: 30_000 })
}

export async function applyAtomic(deps: ManualApplyDeps, input: { previewId: string; sha256: string; actorId: string }): Promise<ManualApplyOutcome> {
  const { db } = deps
  const now = deps.now?.() ?? new Date()
  const base: Record<string, unknown> = { kind: MANUAL_IMPORT_KIND, mode: MANUAL_IMPORT_MODE, writeFields: ['price', 'erpPriceMissing', 'manualPriceApproved', 'manualApprovedPrice', 'revision', 'updatedAt'], ...input, xmlSha256: input.sha256, stage: 'acquiring' }
  const run = await db.syncRun.create({ data: { status: 'running', triggeredBy: 'manual', errorSample: json(base) } })
  const runId = run.id
  let owned = false
  let resolved = true
  let backupKey = ''
  let fileName = ''
  let stage = 'acquiring'
  const result = (status: 'completed' | 'failed', productsSynced: number, errorCount: number) => ({ status, result: { runId, status, productsSynced, deactivated: 0, errorCount }, backupKey, fileName, sha256: input.sha256 })
  try {
    if (!await grinsMaintenanceClosed(db)) {
      await db.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: now, errorSample: json({ ...base, reason: 'maintenance_required' }) } })
      return { status: 'rejected', error: 'maintenance_required', runId }
    }
    owned = await acquire(db, runId)
    if (!owned) {
      await db.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: now, errorSample: json({ ...base, reason: 'sync_running' }) } })
      return { status: 'rejected', error: 'sync_running', runId }
    }
    stage = 'transaction'
    await db.syncRun.update({ where: { id: runId }, data: { errorSample: json({ ...base, stage: 'transaction_in_progress' }) } })
    resolved = false
    const outcome = await db.$transaction(async transaction => {
      const tx = transaction as unknown as ExtendedPrismaClient
      await lockTransaction(tx, runId)
      if (!await grinsMaintenanceClosed(tx)) {
        await tx.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: now, errorSample: json({ ...base, reason: 'maintenance_required' }) } })
        return { status: 'rejected', error: 'maintenance_required', runId } as ManualApplyOutcome
      }
      // SHA ledger is checked before preview consumption, allowing retries after
      // a lost response to discover the original successful operation.
      const applied = await tx.keyValueSetting.findUnique({ where: { key: SHA_PREFIX + input.sha256 } })
        ?? await tx.keyValueSetting.findUnique({ where: { key: 'grins-manual-import-applied:' + input.sha256 } })
      if (applied) {
        const original = applied.value as { runId?: string }
        await tx.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: now, errorSample: json({ ...base, stage: 'duplicate', originalRunId: original.runId }) } })
        return { status: 'rejected', error: 'already_applied', runId: original.runId } as ManualApplyOutcome
      }
      const consumed = await consumePendingPreview(tx, input, now)
      if (!consumed.ok) {
        await tx.syncRun.update({ where: { id: runId }, data: { status: 'skipped', finishedAt: now, errorSample: json({ ...base, stage: 'rejected', reason: consumed.error }) } })
        return { status: 'rejected', error: consumed.error, runId } as ManualApplyOutcome
      }
      const { preview } = consumed
      fileName = preview.fileName
      Object.assign(base, { fileName, sizeBytes: preview.sizeBytes, stage: 'preflight' })
      const evaluation = await evaluateFeed(tx, preview.xml)
      const { preflight, products } = evaluation
      if (evaluation.catalogFingerprint !== preview.catalogFingerprint) preflight.hard.push('catalog_changed_since_preview')
      if (preflight.hard.length) {
        await tx.syncRun.update({ where: { id: runId }, data: { status: 'failed', finishedAt: now, errorCount: 1, errorSample: json({ ...base, stage: 'preflight_rejected', hardFailures: preflight.hard, warnings: preflight.warnings, metrics: preflight.metrics }) } })
        return { status: 'rejected', error: 'preflight_failed', hard: preflight.hard, runId } as ManualApplyOutcome
      }
      stage = 'backup'
      const before = await snapshot(tx)
      const identities = new Set(before.rows.map(row => row.externalId))
      if (identities.size !== before.rows.length) throw new Error('duplicate_claimants')
      const valid = products.filter(product => identities.has(product.externalId))
      backupKey = `${BACKUP_KEY_PREFIX}${now.toISOString()}:${input.previewId}`
      Object.assign(base, { backupKey, stage: 'applying', warnings: preflight.warnings, metrics: preflight.metrics, changes: { price: evaluation.summary.priceChanges, stock: evaluation.summary.stockChanges } })
      const backup: SafeBackup = { version: 3, mode: MANUAL_IMPORT_MODE, runId, sha256: input.sha256, rows: before.rows, afterFingerprint: '', afterExtraHash: '' }
      await tx.keyValueSetting.create({ data: { key: backupKey, value: json(backup) } })
      stage = 'applying'
      let affected = 0
      for (let index = 0; index < valid.length; index += 200) {
        const batch = valid.slice(index, index + 200)
        affected += await tx.$executeRawUnsafe(buildManualPriceQuery(batch.length), ...batch.flatMap(product => [product.externalId, product.price.toFixed(2)]))
      }
      backup.afterFingerprint = (await snapshot(tx)).fingerprint
      backup.afterExtraHash = await extraHash(tx)
      await tx.keyValueSetting.update({ where: { key: backupKey }, data: { value: json(backup) } })
      await tx.keyValueSetting.create({ data: { key: SHA_PREFIX + input.sha256, value: json({ mode: MANUAL_IMPORT_MODE, scope: 'product-prices', runId, actorId: input.actorId, previewId: input.previewId, backupKey }) } })
      const unlinkedXml = products.filter(product => !identities.has(product.externalId)).length
      await tx.syncRun.update({ where: { id: runId }, data: {
        status: 'completed', finishedAt: new Date(), productsTotal: products.length, productsSynced: valid.length, errorCount: 0,
        errorSample: json({ ...base, stage: 'committed', affected, unlinkedXml }),
      } })
      return { ...result('completed', valid.length, 0), result: { ...result('completed', valid.length, 0).result, unlinkedXml } } as ManualApplyOutcome
    }, { timeout: 240_000, maxWait: 10_000 })
    resolved = true
    return outcome
  } catch {
    // Arbitrary adapter error strings can contain credentials. Persist only
    // operation/stage and a stable error code, never raw exception messages.
    try {
      const completed = await resolve(db, runId, { ...base, failureStage: stage })
      resolved = true
      if (completed) {
        const diagnostics = completed.errorSample as Record<string, unknown>
        backupKey = String(diagnostics.backupKey ?? '')
        fileName = String(diagnostics.fileName ?? '')
        return result('completed', completed.productsSynced, 0) as ManualApplyOutcome
      }
    } catch {
      // Durable initial running record means unresolved, NOT successful. Leave
      // its lease for investigation; no automatic restore or replay.
      resolved = false
    }
    if (resolved && stage === 'backup') return { status: 'rejected', error: 'backup_failed', runId }
    if (resolved) backupKey = '' // The in-transaction backup rolled back too.
    const failure = result('failed', 0, 1)
    return { ...failure, result: { ...failure.result, reason: resolved ? 'rolled_back' : 'outcome_unknown' } } as ManualApplyOutcome
  } finally {
    if (owned && resolved) await releaseSyncLock(db, runId).catch(() => {})
  }
}

export async function restoreAtomic(db: ExtendedPrismaClient, key: string, execute: boolean): Promise<RestoreResult> {
  if (!key.startsWith(BACKUP_KEY_PREFIX)) throw new Error('Not a manual-import backup key')
  const run = execute ? await db.syncRun.create({ data: { status: 'running', triggeredBy: 'restore', errorSample: json({ kind: MANUAL_IMPORT_RESTORE_KIND, mode: MANUAL_IMPORT_MODE, backupKey: key, stage: 'acquiring' }) } }) : null
  let owned = false
  let resolved = true
  let pendingResult: RestoreResult | undefined
  try {
    if (run) {
      if (!await grinsMaintenanceClosed(db)) throw new Error('maintenance_required')
      owned = await acquire(db, run.id)
      if (!owned) throw new Error('Another sync holds the lock; restore not started')
    }
    if (run) resolved = false
    const outcome = await db.$transaction(async transaction => {
      const tx = transaction as unknown as ExtendedPrismaClient
      if (run) {
        await lockTransaction(tx, run.id)
        if (!await grinsMaintenanceClosed(tx)) throw new Error('maintenance_required')
      }
      const stored = await tx.keyValueSetting.findUnique({ where: { key } })
      const backup = stored?.value as unknown as SafeBackup | undefined
      if (!backup || (backup.version !== 3 || backup.mode !== MANUAL_IMPORT_MODE)) throw new Error('Legacy backup has no conflict guard; execute is unsafe')
      const current = await snapshot(tx)
      const result: RestoreResult = { key, backupRows: backup.rows.length, differing: 0, restored: 0, ...(run && { runId: run.id }) }
      if (backup.restored) {
        if (run) await tx.syncRun.update({ where: { id: run.id }, data: { status: 'skipped', finishedAt: new Date(), errorSample: json({ kind: MANUAL_IMPORT_RESTORE_KIND, mode: MANUAL_IMPORT_MODE, backupKey: key, reason: 'already_restored' }) } })
        return result
      }
      if (current.fingerprint !== backup.afterFingerprint || await extraHash(tx) !== backup.afterExtraHash) throw new Error('restore_conflict: catalog changed after import; reconciliation required')
      // JSONB canonicalizes object key order; compare explicit fields rather
      // than treating serialization order as a Product change.
      const currentById = new Map(current.rows.map(row => [row.id, rowSignature(row)]))
      const differing = backup.rows.filter(row => currentById.get(row.id) !== rowSignature(row))
      result.differing = differing.length
      if (!execute) return result
      for (let index = 0; index < differing.length; index += 500) {
        const batch = differing.slice(index, index + 500)
        const values = batch.map((_, row) => {
          const offset = row * 5
          return `($${offset + 1}::text,$${offset + 2}::numeric,$${offset + 3}::boolean,$${offset + 4}::boolean,$${offset + 5}::numeric)`
        }).join(',')
        result.restored += await tx.$executeRawUnsafe(
          `UPDATE "Product" p SET price=v.price, "erpPriceMissing"=v.epm,
            "manualPriceApproved"=v.mpa, "manualApprovedPrice"=v.map, revision=p.revision+1, "updatedAt"=now()
            FROM (VALUES ${values}) v(id,price,epm,mpa,map) WHERE p.id=v.id`,
          ...batch.flatMap(row => [row.id, row.price, row.erpPriceMissing, row.manualPriceApproved, row.manualApprovedPrice]),
        )
      }
      await tx.keyValueSetting.update({ where: { key }, data: { value: json({ ...backup, restored: true }) } })
      await tx.syncRun.update({ where: { id: run!.id }, data: { status: 'completed', finishedAt: new Date(), productsSynced: result.restored, errorSample: json({ kind: MANUAL_IMPORT_RESTORE_KIND, mode: MANUAL_IMPORT_MODE, backupKey: key, stage: 'committed' }) } })
      pendingResult = result
      resolved = true
      return result
    }, { timeout: 240_000, maxWait: 10_000 })
    resolved = true
    return outcome
  } catch (error) {
    if (run) {
      try {
        const completed = await resolve(db, run.id, { kind: MANUAL_IMPORT_RESTORE_KIND, mode: MANUAL_IMPORT_MODE, backupKey: key })
        resolved = true
        if (completed && pendingResult) return pendingResult
      } catch { resolved = false }
    }
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('restore_conflict:') || message.startsWith('Legacy backup') || message.startsWith('Another sync') || message === 'sync_ownership_lost' || message === 'maintenance_required') throw error
    throw new Error('atomic_restore_failed')
  } finally {
    if (run && owned && resolved) await releaseSyncLock(db, run.id).catch(() => {})
  }
}
