import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getClientIp } from '@/lib/request-ip'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  createSession,
  mapDbToServerUser,
  requiresAdminMfa,
} from '@/lib/server-auth'
import { createMfaChallenge, setSessionCookie } from '@/lib/mfa-challenge'
import { checkRateLimit, resetRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { normalizeCardNumber } from '@/lib/card-number'
import { recordCompanyActivity } from '@/lib/company-activity-log'

// A structurally valid bcrypt hash that matches no real password - used to pay the
// same bcrypt.compare cost on the "account not found" path as on a real login attempt.
const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO0z2Q2K3z8QeYfNqL4z8s7z8jN9z8jNu'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Occasional GC
    if (Math.random() < 0.05) void gcRateLimitStore()

    const { identifier, email, password } = await req.json()
    const rawIdentifier = identifier ?? email
    if (!rawIdentifier || !password) {
      return NextResponse.json({ error: 'identifier_password_required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length > 128) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const normalizedIdentifier = String(rawIdentifier).trim()
    const isEmail = normalizedIdentifier.includes('@')
    const lookupValue = isEmail
      ? normalizedIdentifier.toLowerCase()
      : normalizeCardNumber(normalizedIdentifier)
    if (!lookupValue || lookupValue.length > (isEmail ? 254 : 64)) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    const ip = getClientIp(req)
    const identifierLimitKey = isEmail ? `login:email:${lookupValue}` : `login:card:${lookupValue}`
    const limitKeys = [`login:ip:${ip}`, identifierLimitKey]
    const limits = await Promise.all(limitKeys.map((key) => checkRateLimit(key)))
    const limited = limits.find((result) => result.limited)
    if (limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: limited.resetAt },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))) },
        }
      )
    }

    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: lookupValue } })
      : await prisma.user.findFirst({
          where: { cardNumber: { equals: lookupValue, mode: 'insensitive' } },
        })
    // Email is an administrator-only login identifier. Customer accounts must
    // authenticate with their assigned card number even when they have an email.
    const eligible = !!user && !!user.passwordHash && !(isEmail && user.platformRole !== 'admin')
    // Always run a bcrypt compare, even when no matching account exists (against a
    // fixed dummy hash) - otherwise the "account exists" path costs ~50-100ms more
    // than "account not found", letting an attacker enumerate valid card numbers/emails
    // purely from response timing without ever guessing a correct password.
    const valid = await verifyPassword(password, eligible ? user!.passwordHash! : DUMMY_PASSWORD_HASH)
    if (!eligible || !valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    // Successful login נreset attempt counter
    await Promise.all(limitKeys.map((key) => resetRateLimit(key)))

    // Anyone with admin-panel access gets no session from the password alone: either
    // the TOTP step (enrolled) or mandatory first-time enrollment comes next.
    if (requiresAdminMfa(user)) {
      const enrollmentRequired = !user.mfaEnabled
      const challengeToken = await createMfaChallenge(user.id, enrollmentRequired)
      return NextResponse.json({ mfaRequired: true, enrollmentRequired, challengeToken })
    }

    const token = await createSession(user.id)

    if (user.companyId && user.auditLoggingEnabled) {
      recordCompanyActivity({
        companyId: user.companyId,
        userId: user.id,
        userName: user.name ?? undefined,
        userEmail: user.email,
        action: 'team_member_login',
        ipAddress: ip,
      }).catch((err) => logApiError('[auth/login] activity log failed', err))
    }

    const res = NextResponse.json({ user: mapDbToServerUser(user) })
    setSessionCookie(res, token, user)
    return res
  } catch (e) {
    logApiError("[auth/login]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}



