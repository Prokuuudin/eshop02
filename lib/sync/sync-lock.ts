import type { ExtendedPrismaClient } from '@/lib/prisma'

const SYNC_LOCK_KEY = 'sync-run-lock'

export async function acquireSyncLock(
  db: ExtendedPrismaClient,
  runId: string,
  staleMs: number,
): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + staleMs).toISOString()
  const value = JSON.stringify({ runId, lockedUntil })

  const rows = await db.$queryRawUnsafe<Array<{ key: string }>>(
    `INSERT INTO "KeyValueSetting" (key, value, "updatedAt")
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, "updatedAt" = now()
       WHERE ("KeyValueSetting".value->>'lockedUntil')::timestamptz < now()
     RETURNING key`,
    SYNC_LOCK_KEY,
    value,
  )

  return rows.length > 0
}

export async function releaseSyncLock(db: ExtendedPrismaClient, runId: string): Promise<void> {
  const releasedValue = JSON.stringify({ runId, lockedUntil: new Date(0).toISOString() })
  await db.$executeRawUnsafe(
    `UPDATE "KeyValueSetting" SET value = $1::jsonb, "updatedAt" = now()
     WHERE key = $2 AND (value->>'runId') = $3`,
    releasedValue,
    SYNC_LOCK_KEY,
    runId,
  )
}
