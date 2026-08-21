import { createHash, randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import type { ServerUser } from '@/lib/server-auth'
import { SESSION_COOKIE } from '@/lib/auth-constants'
import type { ExtendedTransactionClient } from '@/lib/prisma'

type AuditTx = ExtendedTransactionClient

export type ServerAuditInput = {
  action: string
  entityType: string
  entityId: string
  entityTitle?: string | null
  before?: unknown
  after?: unknown
  details?: string | null
  reason?: string | null
  /** Groups multiple audit rows into one batch (e.g. a multi-item revert). Overrides the `x-request-id` header. */
  requestId?: string
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}

export async function appendServerAudit(
  tx: AuditTx,
  request: NextRequest,
  actor: ServerUser,
  input: ServerAuditInput,
): Promise<void> {
  // Serialize writers so two concurrent mutations cannot fork the integrity chain.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(203948721)`
  const previous = await tx.auditLog.findFirst({ orderBy: { sequence: 'desc' }, select: { integrityHash: true } })
  const requestIdHeader = request.headers.get('x-request-id')
  const requestId = input.requestId
    ?? (requestIdHeader && /^[A-Za-z0-9._:-]{1,128}$/u.test(requestIdHeader) ? requestIdHeader : randomUUID())
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ipAddress = forwarded || request.headers.get('x-real-ip') || null
  const userAgent = request.headers.get('user-agent')?.slice(0, 1024) || null
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const sessionHash = token ? createHash('sha256').update(token).digest('hex') : null
  const at = new Date()
  const id = randomUUID()
  const previousHash = previous?.integrityHash ?? null
  const integrityPayload = {
    id, at: at.toISOString(), actorUserId: actor.id, adminEmail: actor.email,
    adminName: actor.name ?? null, requestId, ipAddress, userAgent, sessionHash,
    action: input.action, entityType: input.entityType, entityId: input.entityId,
    entityTitle: input.entityTitle ?? null, before: input.before ?? null,
    after: input.after ?? null, details: input.details ?? null, reason: input.reason ?? null, previousHash,
  }
  const integrityHash = createHash('sha256').update(canonical(integrityPayload)).digest('hex')

  await tx.auditLog.create({ data: {
    id, at, adminEmail: actor.email, adminName: actor.name ?? null, actorUserId: actor.id,
    action: input.action, entityType: input.entityType, entityId: input.entityId,
    entityTitle: input.entityTitle ?? null, before: jsonValue(input.before), after: jsonValue(input.after),
    details: input.details ?? null, reason: input.reason ?? null, requestId, ipAddress,
    userAgent, sessionHash, previousHash, integrityHash,
  } })
}

type VerifiableAuditRow = {
  id: string; at: Date; actorUserId: string | null; adminEmail: string; adminName: string | null
  requestId: string | null; ipAddress: string | null; userAgent: string | null; sessionHash: string | null
  action: string; entityType: string; entityId: string; entityTitle: string | null
  before: unknown; after: unknown; details: string | null; reason: string | null
  previousHash: string | null; integrityHash: string | null
}

export function verifyAuditIntegrity(rows: VerifiableAuditRow[]): { valid: boolean; checked: number; invalidId?: string } {
  let expectedPrevious: string | null = null
  let checked = 0
  for (const row of rows) {
    if (!row.integrityHash) continue // legacy rows predate the append-only chain
    const payload = {
      id: row.id, at: row.at.toISOString(), actorUserId: row.actorUserId, adminEmail: row.adminEmail,
      adminName: row.adminName, requestId: row.requestId, ipAddress: row.ipAddress,
      userAgent: row.userAgent, sessionHash: row.sessionHash, action: row.action,
      entityType: row.entityType, entityId: row.entityId, entityTitle: row.entityTitle,
      before: row.before, after: row.after, details: row.details, reason: row.reason,
      previousHash: row.previousHash,
    }
    const calculated = createHash('sha256').update(canonical(payload)).digest('hex')
    if (row.previousHash !== expectedPrevious || calculated !== row.integrityHash) {
      return { valid: false, checked, invalidId: row.id }
    }
    expectedPrevious = row.integrityHash
    checked += 1
  }
  return { valid: true, checked }
}
