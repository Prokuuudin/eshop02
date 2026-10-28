import 'server-only'
import { randomBytes } from 'node:crypto'
import type { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { User as PrismaUser } from '@/generated/prisma/client'
import { hashToken, requiresAdminMfa, sessionCookieMaxAgeSeconds, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'

// A challenge token is the only state between "password correct" and "MFA passed".
// It is not a session: getServerUser() never accepts it, so it grants no access.
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000
// First-time enrollment needs time to install an app and scan the QR code.
const ENROLLMENT_CHALLENGE_TTL_MS = 15 * 60 * 1000

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const ATTEMPTS_PER_TOKEN = 5
const ATTEMPTS_PER_IP = 5
// Daily budget per account, so rotating IPs and re-logging in for fresh tokens
// cannot extend the guessing budget against one admin's 6-digit code
// (20/day ≈ 2% chance per year of guessing a code, with ±1 step drift accepted).
const USER_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000
const ATTEMPTS_PER_USER = 20

export async function createMfaChallenge(userId: string, enrollment: boolean): Promise<string> {
  const challengeToken = randomBytes(32).toString('hex')
  // One outstanding challenge per user: a fresh login must not multiply the per-token budget.
  await prisma.mfaChallenge.deleteMany({ where: { userId } })
  await prisma.mfaChallenge.create({
    data: {
      tokenHash: hashToken(challengeToken),
      userId,
      expiresAt: new Date(Date.now() + (enrollment ? ENROLLMENT_CHALLENGE_TTL_MS : LOGIN_CHALLENGE_TTL_MS)),
    },
  })
  return challengeToken
}

/** Live, unexpired challenge whose user still needs admin MFA — or null. */
export async function findActiveMfaChallenge(
  challengeToken: string
): Promise<{ tokenHash: string; user: PrismaUser } | null> {
  if (!challengeToken) return null
  const challenge = await prisma.mfaChallenge.findUnique({
    where: { tokenHash: hashToken(challengeToken) },
    include: { user: true },
  })
  if (!challenge || challenge.expiresAt < new Date()) return null
  // Re-check live state: the role may have changed since /api/auth/login.
  if (!requiresAdminMfa(challenge.user)) return null
  return { tokenHash: challenge.tokenHash, user: challenge.user }
}

/** Atomic single use: of two concurrent requests with the same token, only one gets true. */
export async function consumeMfaChallenge(tokenHash: string): Promise<boolean> {
  const { count } = await prisma.mfaChallenge.deleteMany({ where: { tokenHash } })
  return count === 1
}

const tokenKey = (tokenHash: string) => `mfa:token:${tokenHash}`
const ipKey = (ip: string) => `mfa:ip:${ip}`
const userKey = (userId: string) => `mfa:user:${userId}`

async function anyLimited(keys: Array<[string, number, number]>): Promise<boolean> {
  const results = await Promise.all(
    keys.map(([key, maxAttempts, windowMs]) => checkRateLimit(key, { windowMs, maxAttempts }))
  )
  return results.some((r) => r.limited)
}

/** Counts one attempt for this token and IP — checked before any DB lookup. */
export async function mfaAttemptLimited(tokenHash: string, ip: string): Promise<boolean> {
  return anyLimited([
    [tokenKey(tokenHash), ATTEMPTS_PER_TOKEN, ATTEMPT_WINDOW_MS],
    [ipKey(ip), ATTEMPTS_PER_IP, ATTEMPT_WINDOW_MS],
  ])
}

/** Counts one code attempt against the account itself. */
export async function mfaUserAttemptLimited(userId: string): Promise<boolean> {
  return anyLimited([[userKey(userId), ATTEMPTS_PER_USER, USER_ATTEMPT_WINDOW_MS]])
}

export async function resetMfaAttempts(tokenHash: string, ip: string, userId: string): Promise<void> {
  await Promise.all([tokenKey(tokenHash), ipKey(ip), userKey(userId)].map((key) => resetRateLimit(key)))
}

export function setSessionCookie(
  res: NextResponse,
  token: string,
  user: { platformRole?: string | null; teamRole?: string | null }
): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionCookieMaxAgeSeconds(user),
  })
}
