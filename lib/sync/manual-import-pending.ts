import { createHash } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'

// Leaf module shared by manual-import.ts and manual-import-atomic.ts, so the
// atomic apply path does not import back from manual-import.ts.

export const MANUAL_IMPORT_MODE = 'prices-only' as const
export const MANUAL_IMPORT_KIND = 'admin-manual-import'
export const MANUAL_IMPORT_RESTORE_KIND = 'admin-manual-import-restore'
export const PENDING_KEY = 'grins-manual-import-pending'
export const BACKUP_KEY_PREFIX = 'grins-manual-import-backup:'

export const sha256Hex = (content: string | Uint8Array): string =>
  createHash('sha256').update(content).digest('hex')

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
