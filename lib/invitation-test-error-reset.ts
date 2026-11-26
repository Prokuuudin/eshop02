import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { lockInvitationUsers } from '@/lib/invitation-dispatch'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

/**
 * One-off reset (scripts/reset-invitation-test-errors.ts). Invitation tokens that failed during
 * test mailings before the shop launch (2026-10-25) still show «ошибка отправки» in the admin
 * invitations list. Such a token is already dead (/api/auth/invite rejects status `error`), so
 * removing it only returns the client to «не приглашён»; the admin sends a normal invitation
 * later. A snapshot of every removed row goes to the audit chain (and to the local report), so
 * the send history stays available for diagnostics. Errors from real mailings after the launch
 * are never touched.
 */
export const RESET_RUN_ID = 'invitation-test-errors-2026-11-26'
export const RESET_ACTION = 'invitation.test_error_voided'
export const LAUNCH_CUTOFF = new Date('2026-10-25T00:00:00.000Z')

export type ErrorTokenRow = {
  id: string; userId: string; email: string; cardNumber: string; language: string; status: string
  createdAt: string; expiresAt: string; acceptedAt: string | null
  /** Delivery rows / invitation audit events of this user between the token and the launch. */
  deliveriesBeforeLaunch: number; auditEventsBeforeLaunch: number
  /** Informational: the token is what the admin list shows, and the client is still listed there. */
  isLatestToken: boolean; listedInInvitations: boolean
}
export type ResetDecision = { id: string; userId: string; outcome: 'void' | 'abort'; reasons: string[] }
export type ResetPlan = {
  runId: string; cutoff: string; decisions: ResetDecision[]; postLaunchErrors: number
  fingerprint: string; refused: boolean; changes: number; visibleInList: number
}

function decide(row: ErrorTokenRow): ResetDecision {
  const reasons: string[] = []
  if (row.status !== 'error') reasons.push(`status is ${row.status}`)
  if (Date.parse(row.createdAt) >= LAUNCH_CUTOFF.getTime()) reasons.push('created after the launch')
  if (row.acceptedAt) reasons.push('token was accepted')
  // A work mailing records deliveries and audit events; pre-launch test sends have none.
  if (row.deliveriesBeforeLaunch > 0) reasons.push(`${row.deliveriesBeforeLaunch} delivery record(s) before the launch`)
  if (row.auditEventsBeforeLaunch > 0) reasons.push(`${row.auditEventsBeforeLaunch} invitation audit event(s) before the launch`)
  if (reasons.length > 0) return { id: row.id, userId: row.userId, outcome: 'abort', reasons }
  return {
    id: row.id,
    userId: row.userId,
    outcome: 'void',
    reasons: [`pre-launch test send ${row.createdAt.slice(0, 10)}`, row.listedInInvitations && row.isLatestToken ? 'shown as send error' : 'not shown in the list'],
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

export function planInvitationTestErrorReset(rows: ErrorTokenRow[], postLaunchErrors: number): ResetPlan {
  const decisions = [...rows].sort((a, b) => a.id.localeCompare(b.id)).map(decide)
  const fingerprint = createHash('sha256')
    .update(canonical({ runId: RESET_RUN_ID, cutoff: LAUNCH_CUTOFF.toISOString(), decisions, rows, postLaunchErrors }))
    .digest('hex').slice(0, 16)
  return {
    runId: RESET_RUN_ID,
    cutoff: LAUNCH_CUTOFF.toISOString(),
    decisions,
    postLaunchErrors,
    fingerprint,
    refused: decisions.some((decision) => decision.outcome === 'abort'),
    changes: decisions.filter((decision) => decision.outcome === 'void').length,
    visibleInList: rows.filter((row) => row.isLatestToken && row.listedInInvitations).length,
  }
}

type Tx = ExtendedTransactionClient

export async function collectInvitationTestErrors(tx: Tx, lock = false): Promise<{ rows: ErrorTokenRow[]; postLaunchErrors: number }> {
  const where = { status: 'error', createdAt: { lt: LAUNCH_CUTOFF } }
  if (lock) {
    const ids = await tx.invitationToken.findMany({ where, select: { userId: true } })
    // Same per-user locks as the admin send endpoints: no invitation is issued meanwhile.
    await lockInvitationUsers(tx, ids.map((row) => row.userId))
    await tx.$queryRaw`SELECT id FROM "InvitationToken" WHERE status = 'error' AND "createdAt" < ${LAUNCH_CUTOFF} FOR UPDATE`
  }
  const tokens = await tx.invitationToken.findMany({ where, orderBy: { id: 'asc' } })
  const rows: ErrorTokenRow[] = []
  for (const token of tokens) {
    const [latest, user, deliveries, audits] = await Promise.all([
      tx.invitationToken.findFirst({ where: { email: token.email }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
      tx.user.findUnique({ where: { id: token.userId }, select: { privacyAcknowledgedAt: true, cardNumber: true } }),
      tx.invitationDelivery.count({ where: { userId: token.userId, sentAt: { gte: token.createdAt, lt: LAUNCH_CUTOFF } } }),
      tx.auditLog.count({ where: { entityId: token.userId, action: { startsWith: 'invitation.' }, at: { lt: LAUNCH_CUTOFF } } }),
    ])
    rows.push({
      id: token.id, userId: token.userId, email: token.email, cardNumber: token.cardNumber,
      language: token.language, status: token.status,
      createdAt: token.createdAt.toISOString(), expiresAt: token.expiresAt.toISOString(),
      acceptedAt: token.acceptedAt?.toISOString() ?? null,
      deliveriesBeforeLaunch: deliveries, auditEventsBeforeLaunch: audits,
      isLatestToken: latest?.id === token.id,
      listedInInvitations: !!user?.cardNumber && user.privacyAcknowledgedAt === null,
    })
  }
  const postLaunchErrors = await tx.invitationToken.count({ where: { status: 'error', createdAt: { gte: LAUNCH_CUTOFF } } })
  return { rows, postLaunchErrors }
}

export async function applyInvitationTestErrorReset(
  tx: Tx,
  input: { confirmFingerprint: string; operator: ServerUser; reason: string },
): Promise<{ plan: ResetPlan; voided: string[] }> {
  if (!input.reason.trim()) throw new Error('a reason is required')
  const state = await collectInvitationTestErrors(tx, true)
  const plan = planInvitationTestErrorReset(state.rows, state.postLaunchErrors)
  if (plan.refused) throw new Error('plan is refused (abort outcome); nothing changed')
  if (plan.fingerprint !== input.confirmFingerprint) {
    throw new Error(`state changed since review: plan ${plan.fingerprint} does not match --confirm; nothing changed`)
  }
  const request = new NextRequest('http://maintenance.invalid/reset-invitation-test-errors', {
    headers: { 'user-agent': 'scripts/reset-invitation-test-errors.ts', 'x-request-id': `${RESET_RUN_ID}-${plan.fingerprint}` },
  })
  const voided: string[] = []
  for (const decision of plan.decisions) {
    const row = state.rows.find((candidate) => candidate.id === decision.id)!
    const { count } = await tx.invitationToken.deleteMany({
      where: { id: row.id, userId: row.userId, status: 'error', createdAt: { lt: LAUNCH_CUTOFF } },
    })
    if (count !== 1) throw new Error(`expected to remove exactly one invitation token ${row.id}`)
    await appendServerAudit(tx, request, input.operator, {
      action: RESET_ACTION, entityType: 'user', entityId: row.userId,
      before: {
        invitationTokenId: row.id, status: row.status, email: row.email, cardNumber: row.cardNumber,
        language: row.language, createdAt: row.createdAt, expiresAt: row.expiresAt,
      },
      after: { status: 'none' },
      details: `run=${RESET_RUN_ID}; plan=${plan.fingerprint}; ${decision.reasons.join('; ')}`,
      reason: input.reason,
    })
    voided.push(row.id)
  }
  return { plan, voided }
}
