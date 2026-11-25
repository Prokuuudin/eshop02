import 'server-only'

import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { MOVED_REFERENCES, referenceKey } from '@/lib/admin-account-merge-references'
import {
  ACCOUNT_MERGE_RECORD_PREFIX,
  ACCOUNT_MERGE_RECORD_VERSION,
  AccountMergeError,
  TARGET_RESTORE_COLUMNS,
  userJson,
  type MergeRecoveryRecord,
} from '@/lib/admin-account-merge'

/**
 * Undo of an account merge from its recovery record (lib/admin-account-merge). Runs inside the
 * caller's transaction and puts back, exactly as PostgreSQL stored them:
 *  - the target columns the merge changed (email, contact, profile, consents, updatedAt);
 *  - the source row (all columns; its password hash is never stored, so the restored account
 *    gets a new random, unknown hash — it was a never-activated import, the customer resets it);
 *  - every moved row back onto the source, every dropped duplicate row re-inserted;
 *  - the mailing block the merge created, if it is still the one it created.
 * The record is deleted at the end. Refused when anything changed since the merge (the target was
 * edited, a moved row was moved again): such a case is resolved by hand, never half-restored.
 */

type Db = ExtendedTransactionClient

const ident = (name: string) => Prisma.raw(`"${name.replace(/"/gu, '')}"`)

export type RestoreOutcome = {
  sourceId: string
  targetId: string
  restoredEmail: string
  movedBack: Record<string, number>
  reinserted: Record<string, number>
  suppressionRemoved: boolean
}

function readRecord(value: unknown): MergeRecoveryRecord {
  const record = value as Partial<MergeRecoveryRecord> | null
  if (!record || record.version !== ACCOUNT_MERGE_RECORD_VERSION || !record.source || !record.targetBefore || !record.targetAfter
    || typeof record.sourceId !== 'string' || typeof record.targetId !== 'string') {
    throw new AccountMergeError('unsupported_record', 409)
  }
  return record as MergeRecoveryRecord
}

export async function restoreAccountMerge(tx: Db, sourceId: string): Promise<RestoreOutcome> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`
  const key = `${ACCOUNT_MERGE_RECORD_PREFIX}${sourceId}`
  const row = await tx.keyValueSetting.findUnique({ where: { key }, select: { value: true } })
  if (!row) throw new AccountMergeError('not_found', 404)
  const record = readRecord(row.value)
  const { targetId } = record

  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "User" WHERE id IN (${sourceId}, ${targetId}) ORDER BY id FOR UPDATE`
  if (locked.some((r) => r.id === sourceId)) throw new AccountMergeError('source_exists', 409)
  if (!locked.some((r) => r.id === targetId)) throw new AccountMergeError('target_changed', 409)
  const current = await userJson(tx, targetId)
  if (current.email !== record.targetAfter.email || current.updatedAt !== record.targetAfter.updatedAt) {
    throw new AccountMergeError('target_changed', 409)
  }

  // 1. Target columns back (this also frees the source's email), updatedAt included.
  const columns = TARGET_RESTORE_COLUMNS.map((column) => ident(column))
  const before = JSON.stringify(record.targetBefore)
  await tx.$executeRaw`
    UPDATE "User" u SET (${Prisma.join(columns, ', ')}) = (
      SELECT ${Prisma.join(columns.map((c) => Prisma.sql`r.${c}`), ', ')} FROM jsonb_populate_record(NULL::"User", ${before}::jsonb) r
    ) WHERE u.id = ${targetId}`

  // 2. Source row back with a fresh unknown password hash (the old one was never stored).
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
  const source = JSON.stringify({ ...record.source, passwordHash, mfaBackupCodes: [] })
  await tx.$executeRaw`INSERT INTO "User" SELECT * FROM jsonb_populate_record(NULL::"User", ${source}::jsonb)`

  // 3. Moved rows back; each must still be on the target.
  const movedBack: Record<string, number> = {}
  for (const ref of MOVED_REFERENCES) {
    const ids = record.movedIds[referenceKey(ref)] ?? []
    if (ids.length === 0) { movedBack[referenceKey(ref)] = 0; continue }
    const count = await tx.$executeRaw`
      UPDATE ${ident(ref.table)} SET ${ident(ref.column)} = ${sourceId}
      WHERE id IN (${Prisma.join(ids)}) AND ${ident(ref.column)} = ${targetId}`
    if (count !== ids.length) throw new AccountMergeError('moved_rows_changed', 409)
    movedBack[referenceKey(ref)] = count
  }

  // 4. Dropped duplicates back, as stored.
  const reinserted: Record<string, number> = {}
  for (const ref of MOVED_REFERENCES.filter((r) => r.uniqueWith)) {
    const rows = record.dropped[referenceKey(ref)] ?? []
    for (const dropped of rows) {
      await tx.$executeRaw`INSERT INTO ${ident(ref.table)} SELECT * FROM jsonb_populate_record(NULL::${ident(ref.table)}, ${JSON.stringify(dropped)}::jsonb)`
    }
    reinserted[referenceKey(ref)] = rows.length
  }

  // 5. The mailing block the merge created for the new address, if nobody changed it since.
  let suppressionRemoved = false
  const created = record.sideEffects.suppressionCreated
  if (created) {
    const removed = await tx.$executeRaw`
      DELETE FROM "KeyValueSetting" WHERE key = ${created.key} AND value = ${JSON.stringify(created.value)}::jsonb`
    suppressionRemoved = removed === 1
  }

  await tx.keyValueSetting.delete({ where: { key } })
  return { sourceId, targetId, restoredEmail: String(record.source.email), movedBack, reinserted, suppressionRemoved }
}
