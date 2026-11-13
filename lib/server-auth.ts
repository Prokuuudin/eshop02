import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import type { User as PrismaUser } from '@/generated/prisma/client'
import { SESSION_COOKIE } from '@/lib/auth-constants'
import {
  getPermissionAccessLevel,
  hasAdminPermission,
  type AdminPermission,
} from '@/lib/admin-permissions'
import type { CheckoutProfile } from '@/lib/auth-types'
import {
  adminSessionAbsoluteDeadline,
  adminSessionPresenceDeadline,
  evaluateAdminSession,
  shouldRefreshAdminPresence,
} from '@/lib/admin-session-policy'

export { SESSION_COOKIE } from '@/lib/auth-constants'
const SESSION_DURATION_DAYS = 30
// Staff sessions follow lib/admin-session-policy.ts instead: 8 hours from sign-in
// at most, and they end shortly after the browser stops reporting presence.

export type ServerUser = {
  id: string
  email: string
  name?: string
  platformRole: string
  companyId?: string
  companyName?: string
  teamRole?: string
  /** Only meaningful for platform admins; grants staff.manage. */
  superAdmin?: boolean
  approvalRequired: boolean
  auditLoggingEnabled: boolean
  phone?: string
  cardNumber?: string
  avatarUrl?: string
  checkoutProfile?: CheckoutProfile
  bonusPoints: number
  mustChangePassword: boolean
  mfaEnabled?: boolean
  createdAt: string
}

export function mapDbToServerUser(u: PrismaUser): ServerUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? undefined,
    platformRole: u.platformRole,
    companyId: u.companyId ?? undefined,
    companyName: u.companyName ?? undefined,
    teamRole: u.teamRole ?? undefined,
    superAdmin: u.platformRole === 'admin' && u.superAdmin === true,
    approvalRequired: u.approvalRequired,
    auditLoggingEnabled: u.auditLoggingEnabled,
    phone: u.phone ?? undefined,
    cardNumber: u.cardNumber ?? undefined,
    avatarUrl: u.avatarUrl ?? undefined,
    checkoutProfile: (u.checkoutProfile as CheckoutProfile | null) ?? undefined,
    bonusPoints: u.bonusPoints,
    mustChangePassword: u.mustChangePassword,
    mfaEnabled: u.mfaEnabled,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

// The DB only ever stores this hash, never the raw token — a leaked DB row (backup, replica,
// query log) can't be replayed as a session cookie.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Anyone who can reach the admin panel (platform admin or staff manager) must
 * pass TOTP before holding a usable session. Customers are never subject to it.
 */
export function requiresAdminMfa(subject: { platformRole?: string | null; teamRole?: string | null } | null | undefined): boolean {
  return getPermissionAccessLevel(subject) !== 'none'
}

/**
 * Cookie Max-Age for this user's session. Staff get none: a browser session
 * cookie, never written to disk as a persistent cookie. The server-side limits
 * in lib/admin-session-policy.ts are what actually end a staff session, because
 * browsers that restore the previous session also restore session cookies.
 */
export function sessionCookieMaxAgeSeconds(subject: { platformRole?: string | null; teamRole?: string | null }): number | undefined {
  return requiresAdminMfa(subject) ? undefined : SESSION_DURATION_DAYS * 60 * 60 * 24
}

/**
 * `mfaVerified` must only be true when the caller has just checked a TOTP or
 * recovery code (or is rotating a session that getServerUser already accepted).
 * `authenticatedAt` is only for such a rotation: the new staff session keeps the
 * original sign-in time, so rotating never extends the 8-hour limit.
 */
export async function createSession(
  userId: string,
  options: { mfaVerified?: boolean; authenticatedAt?: Date } = {},
  db: Pick<ExtendedTransactionClient, 'user' | 'session'> = prisma,
): Promise<string> {
  const token = generateToken()
  const user = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true, teamRole: true } })
  const now = new Date()
  let createdAt: Date | undefined
  let expiresAt: Date
  if (user && requiresAdminMfa(user)) {
    createdAt = options.authenticatedAt && options.authenticatedAt < now ? options.authenticatedAt : now
    expiresAt = adminSessionPresenceDeadline(createdAt, now)
  } else {
    expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)
  }

  await db.session.create({
    data: {
      id: `sess_${Date.now()}_${randomBytes(4).toString('hex')}`,
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      mfaVerified: options.mfaVerified === true,
      ...(createdAt ? { createdAt } : {}),
    },
  })

  return token
}

type ResolvedSession = { user: ServerUser; staffAbsoluteExpiresAt?: Date }

async function resolveServerSession(options: { allowPasswordChangeRequired?: boolean }): Promise<ResolvedSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  // 1% chance: clean all expired sessions (amortised, no cron needed)
  if (Math.random() < 0.01) {
    cleanExpiredSessions().catch(() => {})
  }

  const tokenHash = hashToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  const now = new Date()
  if (!session || session.expiresAt < now) {
    if (session) await prisma.session.delete({ where: { tokenHash } })
    return null
  }

  let staffAbsoluteExpiresAt: Date | undefined
  if (requiresAdminMfa(session.user)) {
    // Admin access is never granted by a session that skipped the second factor —
    // whichever route created it. Checked against the live role, so a customer
    // promoted to staff must also log in again through MFA.
    if (!session.mfaVerified) return null

    // 8 hours from sign-in, the browser-presence deadline, and sessions issued
    // before this policy: anything but 'active' is revoked on the spot.
    if (evaluateAdminSession(session, now) !== 'active') {
      await prisma.session.deleteMany({ where: { tokenHash } })
      return null
    }
    if (shouldRefreshAdminPresence(session, now)) {
      // Conditional on the row still being live: a concurrent logout or expiry wins,
      // and a deleted/expired session can never be brought back by a late request.
      const { count } = await prisma.session.updateMany({
        where: { tokenHash, expiresAt: { gt: now } },
        data: { expiresAt: adminSessionPresenceDeadline(session.createdAt, now) },
      })
      if (count !== 1) return null
    }
    staffAbsoluteExpiresAt = adminSessionAbsoluteDeadline(session.createdAt)
  }

  const user = mapDbToServerUser(session.user)
  // A shared/temporary onboarding credential must never create a full account
  // session. Only the password-change and session-introspection endpoints opt
  // in to seeing this restricted user.
  if (user.mustChangePassword && !options.allowPasswordChangeRequired) return null
  return { user, staffAbsoluteExpiresAt }
}

export async function getServerUser(options: { allowPasswordChangeRequired?: boolean } = {}): Promise<ServerUser | null> {
  try {
    return (await resolveServerSession(options))?.user ?? null
  } catch {
    return null
  }
}

/**
 * Live staff session behind the request cookie (refreshing its browser presence),
 * or null. Customer sessions return null: the presence policy does not apply to them.
 */
export async function getStaffSessionStatus(): Promise<{ absoluteExpiresAt: Date } | null> {
  try {
    const resolved = await resolveServerSession({ allowPasswordChangeRequired: true })
    if (!resolved?.staffAbsoluteExpiresAt) return null
    return { absoluteExpiresAt: resolved.staffAbsoluteExpiresAt }
  } catch {
    return null
  }
}

/**
 * Guard for admin-only API routes.
 * Returns the authenticated admin ServerUser, or a 403 NextResponse to return directly.
 *
 * Usage:
 *   const gate = await requireAdmin()
 *   if (gate instanceof NextResponse) return gate
 *   // gate is the admin ServerUser here
 */
export async function requireAdmin(): Promise<ServerUser | NextResponse> {
  return requireAdminPermission('users.manage')
}

export async function requireAdminPermission(
  permission: AdminPermission,
): Promise<ServerUser | NextResponse> {
  const user = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!hasAdminPermission(user, permission)) {
    return NextResponse.json({ error: 'forbidden', permission }, { status: 403 })
  }
  return user
}

export type AdminAccessLevel = 'admin' | 'manager' | 'none'

/**
 * Mirrors the client-side access levels used by AdminGate, but derived from
 * the DB-backed ServerUser — safe to use for real (server-side) authorization.
 */
export function getAdminAccessLevel(user: ServerUser | null): AdminAccessLevel {
  return getPermissionAccessLevel(user)
}

export async function hasAdminUsersInDb(): Promise<boolean> {
  try {
    const count = await prisma.user.count({ where: { platformRole: 'admin' } })
    return count > 0
  } catch {
    return true
  }
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

export async function cleanExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}

export async function upsertUserInDb(params: {
  id: string
  email: string
  password: string
  name?: string
  platformRole?: string
  companyId?: string
  companyName?: string
  teamRole?: string
  phone?: string
  cardNumber?: string
  avatarUrl?: string
  bonusPoints?: number
  mustChangePassword?: boolean
  approvalRequired?: boolean
  auditLoggingEnabled?: boolean
}): Promise<PrismaUser> {
  const passwordHash = await hashPassword(params.password)
  const normalizedEmail = params.email.trim().toLowerCase()

  return prisma.user.upsert({
    where: { email: normalizedEmail },
    create: {
      id: params.id,
      email: normalizedEmail,
      passwordHash,
      name: params.name ?? null,
      platformRole: params.platformRole ?? 'customer',
      companyId: params.companyId ?? null,
      companyName: params.companyName ?? null,
      teamRole: params.teamRole ?? null,
      phone: params.phone ?? null,
      cardNumber: params.cardNumber?.trim() ?? null,
      avatarUrl: params.avatarUrl ?? null,
      bonusPoints: params.bonusPoints ?? 500,
      mustChangePassword: params.mustChangePassword ?? false,
      approvalRequired: params.approvalRequired ?? false,
      auditLoggingEnabled: params.auditLoggingEnabled ?? false,
    },
    update: {
      passwordHash,
      name: params.name ?? null,
      platformRole: params.platformRole ?? undefined,
      companyId: params.companyId ?? null,
      companyName: params.companyName ?? null,
      teamRole: params.teamRole ?? null,
      phone: params.phone ?? null,
      cardNumber: params.cardNumber?.trim() ?? null,
      avatarUrl: params.avatarUrl ?? null,
      bonusPoints: params.bonusPoints ?? undefined,
      mustChangePassword: params.mustChangePassword ?? undefined,
      approvalRequired: params.approvalRequired ?? undefined,
      auditLoggingEnabled: params.auditLoggingEnabled ?? undefined,
    },
  })
}
