import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { User as PrismaUser } from '@/generated/prisma/client'

export const SESSION_COOKIE = 'eshop_session'
const SESSION_DURATION_DAYS = 30

export type ServerUser = {
  id: string
  email: string
  name?: string
  platformRole: string
  companyId?: string
  companyName?: string
  teamRole?: string
  approvalRequired: boolean
  auditLoggingEnabled: boolean
  phone?: string
  cardNumber?: string
  avatarUrl?: string
  bonusPoints: number
  mustChangePassword: boolean
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
    approvalRequired: u.approvalRequired,
    auditLoggingEnabled: u.auditLoggingEnabled,
    phone: u.phone ?? undefined,
    cardNumber: u.cardNumber ?? undefined,
    avatarUrl: u.avatarUrl ?? undefined,
    bonusPoints: u.bonusPoints,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt),
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
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

export async function createSession(userId: string): Promise<string> {
  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)

  await prisma.session.create({
    data: {
      id: `sess_${Date.now()}_${randomBytes(4).toString('hex')}`,
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  })

  return token
}

export async function getServerUser(): Promise<ServerUser | null> {
  try {
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

    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { tokenHash } })
      return null
    }

    return mapDbToServerUser(session.user)
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
  const user = await getServerUser()
  if (!user || user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return user
}

export type AdminAccessLevel = 'admin' | 'manager' | 'none'

/**
 * Mirrors the client-side access levels used by AdminGate, but derived from
 * the DB-backed ServerUser — safe to use for real (server-side) authorization.
 */
export function getAdminAccessLevel(user: ServerUser | null): AdminAccessLevel {
  if (!user) return 'none'
  if (user.platformRole === 'admin') return 'admin'
  if (user.teamRole === 'manager' || user.teamRole === 'admin') return 'manager'
  return 'none'
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
      bonusPoints: params.bonusPoints ?? 350,
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
