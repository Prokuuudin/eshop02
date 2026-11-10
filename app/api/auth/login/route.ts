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
import { checkRateLimit, refundRateLimit, resetRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { normalizeCardNumber } from '@/lib/card-number'
import { recordCompanyActivity } from '@/lib/company-activity-log'
import { recordRejectedStaffLogin } from '@/lib/auth-session-audit'

// A structurally valid bcrypt hash that matches no real password - used to pay the
// same bcrypt.compare cost on the "account not found" path as on a real login attempt.
const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO0z2Q2K3z8QeYfNqL4z8s7z8jN9z8jNu'
// Successful logins are refunded, so this budget only counts failures. It is wider than the
// per-card limit (10) because several clients of one salon or office can share an address.
const LOGIN_IP_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 30 }

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
    const ipLimitKey = `login:ip:${ip}`
    const limits = await Promise.all([checkRateLimit(ipLimitKey, LOGIN_IP_LIMIT), checkRateLimit(identifierLimitKey)])
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
    // Email is a staff-only login identifier (platform admins and staff managers, who
    // always continue to the MFA step below). Customer accounts, including B2B company
    // owners, must authenticate with their assigned card number even when they have an email.
    const eligible = !!user && !!user.passwordHash && !(isEmail && !requiresAdminMfa(user))
    // Always run a bcrypt compare, even when no matching account exists (against a
    // fixed dummy hash) - otherwise the "account exists" path costs ~50-100ms more
    // than "account not found", letting an attacker enumerate valid card numbers/emails
    // purely from response timing without ever guessing a correct password.
    const valid = await verifyPassword(password, eligible ? user!.passwordHash! : DUMMY_PASSWORD_HASH)
    if (!eligible || !valid) {
      // Recognised staff account with a wrong password: audited after the response,
      // so neither the response nor its timing changes. Customers are never audited.
      if (eligible && requiresAdminMfa(user)) recordRejectedStaffLogin(req, user!, 'invalid_password')
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    // A not-yet-activated customer proves nothing with an old or shared password, and the
    // forced-change flow would turn it into a takeover. Only the e-mailed activation link
    // (register-card -> /api/auth/invite) or password recovery can activate the account.
    // Staff continue to the MFA step below. The attempt stays counted on both limits.
    if (!requiresAdminMfa(user) && user.mustChangePassword) {
      return NextResponse.json({ error: 'activation_required' }, { status: 403 })
    }
    // The card's own counter restarts; the IP budget only gets this attempt back, so failures
    // against other cards survive a successful login from the same address.
    await Promise.all([resetRateLimit(identifierLimitKey), refundRateLimit(ipLimitKey)])

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



