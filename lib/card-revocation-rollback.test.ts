/**
 * Rollback safety of admin card revocation.
 *
 * Phase 1 runs the current code: an admin revokes one card and replaces another. Phase 2 swaps
 * the revoked-card module for a frozen copy of the previous release (771244eb) and drives the
 * card login, invitation and card-activation routes, which this change left untouched — i.e.
 * the previous release's behaviour on the data the new code wrote. Phase 3 rolls forward again.
 *
 * Expectations: no 503 anywhere, revoked cards stay unusable after the rollback (nothing gives
 * them back to their former holders), and accounts, bonus points and orders are untouched.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

type UserRow = {
  id: string; email: string; name: string; cardNumber: string | null; passwordHash: string
  platformRole: string; teamRole: string | null; superAdmin: boolean; companyId: string | null
  customerType: string; mustChangePassword: boolean; privacyAcknowledgedAt: Date | null
  bonusPoints: number; mfaEnabled: boolean; auditLoggingEnabled: boolean
}
type TokenRow = { id: string; tokenHash: string; userId: string; email: string; cardNumber: string; status: string; expiresAt: Date; acceptedAt: Date | null }

const { world, prismaFake, mailerMock, apiErrors } = vi.hoisted(() => {
  const world = {
    users: new Map<string, UserRow>(),
    settings: new Map<string, { value: unknown; updatedAt: Date }>(),
    tokens: [] as TokenRow[],
    sessions: [] as Array<{ userId: string }>,
    // Orders are not modelled on the fake client: any read or write of them would throw.
    orders: [] as Array<{ id: string; userId: string; total: string }>,
  }
  const clone = <T,>(value: T): T => structuredClone(value)
  const pick = (row: UserRow | undefined) => (row ? clone(row) : null)
  const byCard = (card: string) => [...world.users.values()].find((u) => (u.cardNumber ?? '').toLowerCase() === card.toLowerCase())
  const prismaFake: Record<string, unknown> = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        pick(where.id ? world.users.get(where.id) : [...world.users.values()].find((u) => u.email === where.email)),
      findFirst: async ({ where }: { where: { cardNumber?: { equals: string }; email?: { equals: string } } }) =>
        where.cardNumber
          ? pick(byCard(where.cardNumber.equals))
          : pick([...world.users.values()].find((u) => u.email.toLowerCase() === where.email!.equals.toLowerCase())),
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => world.users.get(id)).filter(Boolean).map((u) => clone(u!)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = world.users.get(where.id)
        if (!row) throw new Error('not found')
        if (data.cardNumber && [...world.users.values()].some((u) => u.id !== where.id && u.cardNumber === data.cardNumber)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
        }
        Object.assign(row, data)
        return clone(row)
      },
    },
    keyValueSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => clone(world.settings.get(where.key) ?? null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        world.settings.set(where.key, { value: clone(world.settings.has(where.key) ? update.value : create.value), updatedAt: new Date() })
      },
    },
    invitationToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => clone(world.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null),
      deleteMany: async ({ where }: { where: { status: { not: string }; OR: Array<{ userId?: string; cardNumber?: string }> } }) => {
        const doomed = (t: TokenRow) => t.status !== where.status.not && where.OR.some((c) => (c.userId && t.userId === c.userId) || (c.cardNumber && t.cardNumber === c.cardNumber))
        const before = world.tokens.length
        world.tokens = world.tokens.filter((t) => !doomed(t))
        return { count: before - world.tokens.length }
      },
    },
    session: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = world.sessions.length
        world.sessions = world.sessions.filter((s) => s.userId !== where.userId)
        return { count: before - world.sessions.length }
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?')
      if (sql.includes('FROM "User"') && sql.includes('FOR UPDATE')) return world.users.has(String(values[0])) ? [pick(world.users.get(String(values[0])))] : []
      throw new Error(`unexpected raw query: ${sql}`)
    },
    $executeRaw: async (strings: TemplateStringsArray) => {
      if (strings.join('?').includes('pg_advisory_xact_lock')) return 1
      throw new Error('unexpected raw statement')
    },
  }
  // All-or-nothing like a database transaction: a throw restores the world as it was.
  prismaFake.$transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const snapshot = { users: new Map([...world.users].map(([k, v]) => [k, clone(v)])), settings: new Map(world.settings), tokens: clone(world.tokens), sessions: clone(world.sessions) }
    try {
      return await run(prismaFake)
    } catch (error) {
      Object.assign(world, snapshot)
      throw error
    }
  }
  return { world, prismaFake, mailerMock: vi.fn(), apiErrors: [] as unknown[] }
})

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => { void callback() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaFake }))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: async () => world.users.get('admin-1'),
  verifyPassword: async (password: string, hash: string) => hash === `hash:${password}`,
  hashPassword: async (password: string) => `hash:${password}`,
  createSession: async (userId: string) => { world.sessions.push({ userId }); return `session-${userId}` },
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  mapDbToServerUser: (u: unknown) => u,
  sessionCookieMaxAgeSeconds: () => 60,
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 }),
  resetRateLimit: async () => undefined, refundRateLimit: async () => undefined, gcRateLimitStore: async () => undefined,
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: async () => undefined }))
vi.mock('@/lib/auth-session-audit', () => ({ recordRejectedStaffLogin: () => undefined }))
vi.mock('@/lib/mfa-challenge', () => ({ createMfaChallenge: async () => 'challenge', setSessionCookie: () => undefined }))
vi.mock('@/lib/company-activity-log', () => ({ recordCompanyActivity: () => undefined }))
vi.mock('@/lib/mailer', () => ({ sendEmail: mailerMock }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: async () => [] }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.test' }))
vi.mock('@/lib/observability', () => ({ logApiError: (_label: string, error: unknown) => { apiErrors.push(error) } }))

import { NextRequest } from 'next/server'
import { hashInviteToken } from '@/lib/invitations'
import { buildRevokedCardValue } from '@/lib/revoked-card-policy-fixture'

const BATCH_KEY = 'revoked-client-cards:v1'
const ADMIN_KEY = 'revoked-client-cards:admin:v1'
const ORIGIN = 'https://shop.test'

function customer(id: string, cardNumber: string, bonusPoints: number): UserRow {
  return {
    id, email: `${id}@example.com`, name: id, cardNumber, passwordHash: 'hash:secret-pass', platformRole: 'customer',
    teamRole: null, superAdmin: false, companyId: null, customerType: 'individual', mustChangePassword: false,
    privacyAcknowledgedAt: new Date('2026-10-01T00:00:00Z'), bonusPoints, mfaEnabled: false, auditLoggingEnabled: false,
  }
}
const pendingToken = (token: string, userId: string, cardNumber: string): TokenRow => ({
  id: `t-${token}`, tokenHash: hashInviteToken(token), userId, email: `${userId}@example.com`, cardNumber,
  status: 'sent', expiresAt: new Date(Date.now() + 86_400_000), acceptedAt: null,
})
const json = (url: string, method: string, body: unknown) => new NextRequest(url, {
  method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' },
})

type LoginPost = (req: NextRequest) => Promise<Response>
async function cardLogin(post: LoginPost, card: string): Promise<number> {
  return (await post(json(`${ORIGIN}/api/auth/login`, 'POST', { identifier: card, password: 'secret-pass' }))).status
}

const batchValue = buildRevokedCardValue()
let batchJsonBefore = ''
let accountsBefore: Map<string, Omit<UserRow, 'cardNumber'>>

beforeAll(async () => {
  world.users.set('admin-1', { ...customer('admin-1', '', 0), cardNumber: null, platformRole: 'admin', name: 'Admin' })
  world.users.set('anna', customer('anna', '4001', 1234))
  world.users.set('boris', customer('boris', '4002', 50))
  world.users.set('carl', customer('carl', '5000', 7))
  world.settings.set(BATCH_KEY, { value: structuredClone(batchValue), updatedAt: new Date('2026-11-16T11:52:59Z') })
  world.tokens.push(pendingToken('tok-anna', 'anna', '4001'), pendingToken('tok-boris', 'boris', '4002'), pendingToken('tok-carl', 'carl', '5000'))
  world.sessions.push({ userId: 'anna' }, { userId: 'boris' }, { userId: 'carl' })
  world.orders.push({ id: 'o-anna', userId: 'anna', total: '24.00' }, { id: 'o-boris', userId: 'boris', total: '10.00' })
  batchJsonBefore = JSON.stringify(world.settings.get(BATCH_KEY))
  accountsBefore = new Map([...world.users].map(([id, { cardNumber: _card, ...rest }]) => [id, structuredClone(rest)]))

  // Phase 1 — current release: revoke Anna's card, replace Boris's card 4002 → 4100.
  const revoked = await import('@/app/api/admin/revoked-cards/route')
  const cardInvite = await import('@/app/api/admin/invitations/card/route')
  const revokeResponse = await revoked.POST(json(`${ORIGIN}/api/admin/revoked-cards`, 'POST', { userId: 'anna', cardNumber: '4001', reason: 'Card lost' }))
  expect(revokeResponse.status).toBe(200)
  const replaceResponse = await cardInvite.POST(json(`${ORIGIN}/api/admin/invitations/card`, 'POST', { email: 'boris@example.com', cardNumber: '4100', confirmReplace: true }))
  expect(replaceResponse.status).toBe(200)
})

describe('after admin revocations, on the current release', () => {
  it('never wrote the 2026-11-16 batch row; admin revocations live in their own row', () => {
    expect(JSON.stringify(world.settings.get(BATCH_KEY))).toBe(batchJsonBefore)
    expect(Object.keys((world.settings.get(ADMIN_KEY)?.value as { cards: object }).cards).sort()).toEqual(['4001', '4002'])
  })

  it('detached the numbers, voided their open invitations and ended the sessions', () => {
    expect(world.users.get('anna')?.cardNumber).toBeNull()
    expect(world.users.get('boris')?.cardNumber).toBe('4100')
    expect(world.tokens.map((t) => t.id)).toEqual(['t-tok-carl'])
    expect(world.sessions).toEqual([{ userId: 'carl' }])
  })

  it('refuses to issue the revoked numbers again', async () => {
    const current = await import('@/lib/revoked-card-policy')
    for (const card of ['4001', '4002']) {
      await expect(current.assertCardAssignable(card)).rejects.toMatchObject({ code: 'card_revoked' })
    }
    await expect(current.assertCardAssignable('4300')).resolves.toBeUndefined()
  })
})

describe('after rolling back to the previous release (771244eb)', () => {
  let previous: typeof import('@/tests/compat/revoked-card-policy.771244eb')
  let login: { POST: LoginPost }
  let invite: typeof import('@/app/api/auth/invite/route')
  let registerCard: typeof import('@/app/api/auth/register-card/route')

  beforeAll(async () => {
    vi.resetModules()
    vi.doMock('@/lib/revoked-card-policy', () => import('@/tests/compat/revoked-card-policy.771244eb'))
    previous = await import('@/tests/compat/revoked-card-policy.771244eb')
    login = await import('@/app/api/auth/login/route')
    invite = await import('@/app/api/auth/invite/route')
    registerCard = await import('@/app/api/auth/register-card/route')
  })

  it('still loads the batch registry: no fail-closed 503 on card paths', async () => {
    const policy = await previous.getRevokedCardPolicy()
    expect(policy.active).toBe(true)
    expect(policy.cards.size).toBe(905)
    await expect(previous.assertCardAssignable('4300')).resolves.toBeUndefined()
    await expect(previous.isCardRevoked('4001')).resolves.toBe(false)
  })

  it('card login: revoked cards stay refused, other cards work, nothing answers 503', async () => {
    expect(await cardLogin(login.POST, '4001')).toBe(401)
    expect(await cardLogin(login.POST, '04002')).toBe(401)
    expect(await cardLogin(login.POST, '4100')).toBe(200)
    expect(await cardLogin(login.POST, '5000')).toBe(200)
  })

  it('invitations: links sent for the revoked cards are void and cannot re-attach them', async () => {
    for (const token of ['tok-anna', 'tok-boris']) {
      const shown = await invite.GET(new NextRequest(`${ORIGIN}/api/auth/invite?token=${token}`))
      expect(shown.status).toBe(404)
      const accepted = await invite.POST(json(`${ORIGIN}/api/auth/invite`, 'POST', { token, password: 'new-password-1', privacyAcknowledged: true }))
      expect(accepted.status).toBe(404)
    }
    expect(world.users.get('anna')?.cardNumber).toBeNull()
    expect(world.users.get('boris')?.cardNumber).toBe('4100')
  })

  it('card activation: a revoked number reaches no account and sends nothing', async () => {
    const tokensBefore = world.tokens.length
    const response = await registerCard.POST(json(`${ORIGIN}/api/auth/register-card`, 'POST', { cardNumber: '4001', privacyAcknowledged: true }))
    expect(response.status).toBe(202)
    expect(world.tokens).toHaveLength(tokensBefore)
    expect(mailerMock).not.toHaveBeenCalled()
  })

  it('card issuance keeps working; the previous release cannot see admin revocations, so it would not block a manual reissue', async () => {
    await expect(previous.assertCardsAssignable(['4300', '4301'])).resolves.toBeUndefined()
    // Known limit of rolling back: the number is free as far as the previous release knows.
    // It is on no account (nothing is given back automatically); an admin would have to issue it.
    await expect(previous.assertCardAssignable('4001')).resolves.toBeUndefined()
    expect([...world.users.values()].some((u) => u.cardNumber === '4001' || u.cardNumber === '4002')).toBe(false)
  })

  afterAllChecks()
})

describe('after rolling forward again', () => {
  beforeAll(() => {
    vi.doUnmock('@/lib/revoked-card-policy')
    vi.resetModules()
  })

  it('the admin revocations are enforced again', async () => {
    const current = await import('@/lib/revoked-card-policy')
    await expect(current.assertCardAssignable('4001')).rejects.toMatchObject({ code: 'card_revoked' })
  })
})

describe('accounts, bonus points and orders', () => {
  it('are untouched apart from the card numbers', () => {
    for (const [id, before] of accountsBefore) {
      const { cardNumber: _card, ...after } = world.users.get(id)!
      expect(after).toEqual(before)
    }
    expect(world.orders).toEqual([{ id: 'o-anna', userId: 'anna', total: '24.00' }, { id: 'o-boris', userId: 'boris', total: '10.00' }])
    expect(apiErrors).toEqual([])
  })
})

function afterAllChecks(): void {
  it('logged no server errors', () => {
    expect(apiErrors).toEqual([])
  })
}
