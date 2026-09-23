import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export type AdminDashboardPrefs = {
  cardOrder: string[] | null
  favoriteCardIds: string[]
}

const DEFAULT_PREFS: AdminDashboardPrefs = { cardOrder: null, favoriteCardIds: [] }

const kvKey = (userId: string) => `admin-dashboard-prefs:${userId}`

function normalize(input?: Partial<AdminDashboardPrefs> | null): AdminDashboardPrefs {
  const source = input ?? {}
  return {
    cardOrder: Array.isArray(source.cardOrder)
      ? source.cardOrder.filter((id): id is string => typeof id === 'string')
      : null,
    favoriteCardIds: Array.isArray(source.favoriteCardIds)
      ? source.favoriteCardIds.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

export async function getAdminDashboardPrefs(
  userId: string,
  db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma,
): Promise<AdminDashboardPrefs> {
  try {
    const row = await db.keyValueSetting.findUnique({ where: { key: kvKey(userId) } })
    if (!row) return DEFAULT_PREFS
    return normalize(row.value as Partial<AdminDashboardPrefs>)
  } catch {
    return DEFAULT_PREFS
  }
}

export async function saveAdminDashboardPrefs(
  userId: string,
  input: Partial<AdminDashboardPrefs>,
  db: ExtendedTransactionClient = prisma,
): Promise<AdminDashboardPrefs> {
  const existing = await getAdminDashboardPrefs(userId, db)
  const next = normalize({ ...existing, ...input })

  await db.keyValueSetting.upsert({
    where: { key: kvKey(userId) },
    create: { key: kvKey(userId), value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })

  return next
}
