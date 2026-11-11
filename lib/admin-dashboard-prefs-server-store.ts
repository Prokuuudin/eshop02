import 'server-only'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

export type AdminDashboardPrefs = {
  cardOrder: string[] | null
  favoriteCardIds: string[]
}

export type DashboardPrefsAuditContext = { actor: ServerUser; request: NextRequest }

const DEFAULT_PREFS: AdminDashboardPrefs = { cardOrder: null, favoriteCardIds: [] }
const PREF_FIELDS = ['cardOrder', 'favoriteCardIds'] as const

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

/**
 * Partial update of the acting admin's dashboard preferences. The per-user
 * advisory lock makes read-merge-write atomic, so a card-order change and a
 * favourites change sent in parallel cannot overwrite each other. Normalised
 * values are compared: an unchanged request writes nothing and creates no
 * event; otherwise the KV write and its audit row (changed fields only)
 * commit together.
 */
export async function saveAdminDashboardPrefs(
  userId: string,
  input: Partial<AdminDashboardPrefs>,
  audit: DashboardPrefsAuditContext,
): Promise<AdminDashboardPrefs> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${kvKey(userId)}))`
    const row = await tx.keyValueSetting.findUnique({ where: { key: kvKey(userId) } })
    const existing = row ? normalize(row.value as Partial<AdminDashboardPrefs>) : DEFAULT_PREFS
    const next = normalize({ ...existing, ...input })
    const changed = PREF_FIELDS.filter((field) => JSON.stringify(existing[field]) !== JSON.stringify(next[field]))
    if (changed.length === 0) return next

    await tx.keyValueSetting.upsert({
      where: { key: kvKey(userId) },
      create: { key: kvKey(userId), value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    })
    const pick = (prefs: AdminDashboardPrefs) => Object.fromEntries(changed.map((field) => [field, prefs[field]]))
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'admin.dashboard_prefs_updated',
      entityType: 'admin_dashboard_prefs',
      entityId: userId,
      before: pick(existing),
      after: pick(next),
    })
    return next
  })
}
