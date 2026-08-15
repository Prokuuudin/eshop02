import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export type CompanyActivityAction =
  | 'rfq_created'
  | 'payment_recorded'
  | 'team_member_login'
  | 'team_member_logout'

export type RecordCompanyActivityInput = {
  companyId: string
  userId: string
  userName?: string | null
  userEmail?: string | null
  action: CompanyActivityAction
  details?: Record<string, unknown>
  ipAddress?: string | null
}

const RETENTION_DAYS = 90

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Persists one company activity event and opportunistically purges entries
 * older than the retention window for that company. No cron infra exists in
 * this deployment, so retention is enforced lazily on write instead — this is
 * what makes the "logs are stored 90 days" copy on account/audit-logs true.
 */
export async function recordCompanyActivity(input: RecordCompanyActivityInput): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.$transaction([
    prisma.companyActivityLog.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        userId: input.userId,
        userName: input.userName ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        details: jsonValue(input.details),
        ipAddress: input.ipAddress ?? null,
      },
    }),
    prisma.companyActivityLog.deleteMany({
      where: { companyId: input.companyId, createdAt: { lt: cutoff } },
    }),
  ])
}

export type CompanyActivityEntry = {
  id: string
  companyId: string
  userId: string
  userName: string | null
  userEmail: string | null
  action: string
  details: unknown
  ipAddress: string | null
  timestamp: string
}

function mapEntry(row: {
  id: string; companyId: string; userId: string; userName: string | null; userEmail: string | null
  action: string; details: unknown; ipAddress: string | null; createdAt: Date
}): CompanyActivityEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    action: row.action,
    details: row.details,
    ipAddress: row.ipAddress,
    timestamp: row.createdAt.toISOString(),
  }
}

/** Company-scoped read, used by the self-service account/audit-logs page. */
export async function getCompanyActivity(companyId: string, take = 100): Promise<CompanyActivityEntry[]> {
  const rows = await prisma.companyActivityLog.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(take, 1), 200),
  })
  return rows.map(mapEntry)
}

/** Admin read, optionally scoped to one user (customers/history) or global (system/logs). */
export async function getCompanyActivityForAdmin(opts: { userId?: string; take?: number }): Promise<CompanyActivityEntry[]> {
  const rows = await prisma.companyActivityLog.findMany({
    where: opts.userId ? { userId: opts.userId } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(opts.take ?? 500, 1), 1000),
  })
  return rows.map(mapEntry)
}

/** Real (non-append-only) purge for the admin "clear old logs" action. */
export async function purgeCompanyActivityOlderThan(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const result = await prisma.companyActivityLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return result.count
}
