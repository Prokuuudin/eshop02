import type { ExtendedPrismaClient } from '@/lib/prisma'

export async function deactivateMissing(db: ExtendedPrismaClient, runId: string): Promise<number> {
  const affected = await db.$executeRawUnsafe(
    `UPDATE "Product"
     SET "isActive" = false, "updatedAt" = now()
     WHERE "externalId" IS NOT NULL
       AND ("lastSyncRunId" IS NULL OR "lastSyncRunId" != $1)`,
    runId,
  )
  return affected
}
