import 'server-only'

import { after, NextRequest } from 'next/server'
import type { User as PrismaUser } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { createSession, deleteSession, hashToken, mapDbToServerUser, requiresAdminMfa } from '@/lib/server-auth'
import { logApiError } from '@/lib/observability'

// Persistent AuditLog events for staff sign-in and sign-out. Only accounts that
// reach the admin panel (requiresAdminMfa) produce events; customer logins and
// logouts never do. No password, token, cookie, MFA code or session hash is
// ever recorded.

export type StaffLoginMethod = 'totp' | 'backup_code' | 'enrollment'
export type StaffLoginRejection = 'invalid_password' | 'invalid_mfa_code'

const FORWARDED_HEADERS = ['x-forwarded-for', 'x-real-ip', 'user-agent', 'x-request-id'] as const

/**
 * appendServerAudit stores a hash of the request's session cookie. Auth events
 * must not, so they are written with a copy of the request that keeps only the
 * client-identification headers.
 */
export function withoutSessionCookie(req: NextRequest): NextRequest {
  const headers = new Headers()
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new NextRequest(req.url, { headers })
}

/**
 * Issues the MFA-verified staff session and records the sign-in in the same
 * transaction: a session never exists without its audit row (fail closed).
 */
export async function createStaffSessionWithAudit(
  req: NextRequest,
  user: PrismaUser,
  method: StaffLoginMethod,
): Promise<string> {
  const request = withoutSessionCookie(req)
  return prisma.$transaction(async (tx) => {
    const token = await createSession(user.id, { mfaVerified: true }, tx)
    await appendServerAudit(tx, request, mapDbToServerUser(user), {
      action: 'auth.admin_login_succeeded',
      entityType: 'user',
      entityId: user.id,
      after: { method, mfaVerified: true },
    })
    return token
  })
}

/**
 * Records a rejected sign-in for a recognised staff account. Written after the
 * response is sent (next/server `after`) so the response time does not reveal
 * that the identifier belongs to staff; a failed write is only logged and never
 * changes the response.
 */
export function recordRejectedStaffLogin(req: NextRequest, user: PrismaUser, reason: StaffLoginRejection): void {
  if (!requiresAdminMfa(user)) return
  const request = withoutSessionCookie(req)
  after(async () => {
    try {
      await prisma.$transaction((tx) => appendServerAudit(tx, request, mapDbToServerUser(user), {
        action: 'auth.admin_login_rejected',
        entityType: 'user',
        entityId: user.id,
        after: { reason },
      }))
    } catch (error) {
      logApiError('[auth] rejected staff login audit failed', error)
    }
  })
}

/**
 * Revokes the session behind `token`. When it was a live staff session the
 * deletion and the sign-out event commit together. If that transaction fails,
 * the session is still deleted on its own: an audit problem never keeps a
 * session alive. Repeated logouts find nothing to revoke and record nothing.
 */
export async function revokeSessionWithAudit(req: NextRequest, token: string): Promise<void> {
  const tokenHash = hashToken(token)
  const request = withoutSessionCookie(req)
  try {
    await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { tokenHash }, include: { user: true } })
      if (!session) return
      const { count } = await tx.session.deleteMany({ where: { tokenHash } })
      // A concurrent logout already revoked it; only the winner records the event.
      if (count !== 1) return
      if (session.expiresAt <= new Date() || !requiresAdminMfa(session.user)) return
      await appendServerAudit(tx, request, mapDbToServerUser(session.user), {
        action: 'auth.admin_logout',
        entityType: 'user',
        entityId: session.userId,
        after: { sessionRevoked: true, mfaVerified: session.mfaVerified },
      })
    })
  } catch (error) {
    logApiError('[auth/logout] audited revoke failed; revoking without audit', error)
    await deleteSession(token)
  }
}
