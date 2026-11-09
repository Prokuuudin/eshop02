import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

// Media bytes live only in the MediaAsset table; there is no filesystem or
// external storage copy, so every mutation and its audit row share one
// PostgreSQL transaction and roll back together.

export type MediaAuditContext = { actor: ServerUser; request: NextRequest }
type MediaFingerprint = { path: string; mimeType: string; size: number; sha256: string }
type LockedAsset = { name: string; mimeType: string; size: number; sha256: string }

// Uploads of up to 50 MB video travel inside the interactive transaction.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 }

export const mediaPath = (name: string): string => `/api/media/${name}`

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function fingerprint(name: string, mimeType: string, size: number, sha256: string): MediaFingerprint {
  return { path: mediaPath(name), mimeType, size, sha256 }
}

/**
 * Row-locks the named assets (stable order, no deadlocks between batches) and
 * returns their metadata. The hash is computed by PostgreSQL so the bytes are
 * never loaded into the application just to be audited.
 */
async function lockAssets(tx: ExtendedTransactionClient, names: string[]): Promise<LockedAsset[]> {
  if (names.length === 0) return []
  const rows = await tx.$queryRaw<LockedAsset[]>`
    SELECT name, "mimeType", size, encode(sha256(data), 'hex') AS sha256
    FROM "MediaAsset"
    WHERE name = ANY(${names})
    ORDER BY name
    FOR UPDATE`
  return rows.map((row) => ({ ...row, size: Number(row.size) }))
}

export async function createMediaAsset(
  input: { name: string; mimeType: string; size: number; bytes: Uint8Array<ArrayBuffer> },
  audit: MediaAuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.create({
      data: { name: input.name, mimeType: input.mimeType, size: input.size, data: input.bytes },
    })
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'media.uploaded', entityType: 'media_asset', entityId: input.name, entityTitle: input.name,
      before: null,
      after: fingerprint(input.name, input.mimeType, input.size, digest(input.bytes)),
    })
  }, TRANSACTION_OPTIONS)
}

export type ReplaceMediaResult = 'replaced' | 'unchanged' | 'not_found'

/** Replaces bytes in place under the same name, so every existing link keeps working. */
export async function replaceMediaAsset(
  name: string,
  input: { mimeType: string; size: number; bytes: Uint8Array<ArrayBuffer> },
  audit: MediaAuditContext,
): Promise<ReplaceMediaResult> {
  return prisma.$transaction(async (tx) => {
    const [current] = await lockAssets(tx, [name])
    if (!current) return 'not_found'
    const sha256 = digest(input.bytes)
    if (current.sha256 === sha256 && current.mimeType === input.mimeType && current.size === input.size) {
      return 'unchanged'
    }
    await tx.mediaAsset.update({
      where: { name },
      data: { data: input.bytes, mimeType: input.mimeType, size: input.size },
    })
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'media.replaced', entityType: 'media_asset', entityId: name, entityTitle: name,
      before: fingerprint(name, current.mimeType, current.size, current.sha256),
      after: fingerprint(name, input.mimeType, input.size, sha256),
    })
    return 'replaced'
  }, TRANSACTION_OPTIONS)
}

/** Deletes the existing assets among `names`; resolves to the names actually deleted. */
export async function deleteMediaAssets(names: string[], audit: MediaAuditContext): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await lockAssets(tx, [...new Set(names)])
    if (rows.length === 0) return []
    const deleted = rows.map((row) => row.name)
    await tx.mediaAsset.deleteMany({ where: { name: { in: deleted } } })
    // One request id groups the per-file rows of a bulk delete.
    const requestId = randomUUID()
    for (const row of rows) {
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'media.deleted', entityType: 'media_asset', entityId: row.name, entityTitle: row.name,
        requestId,
        before: fingerprint(row.name, row.mimeType, row.size, row.sha256),
        after: null,
      })
    }
    return deleted
  }, TRANSACTION_OPTIONS)
}
