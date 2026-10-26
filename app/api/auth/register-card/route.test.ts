import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const {
  afterCallbacks,
  userFindFirstMock,
  tokenDeleteManyMock,
  tokenCreateMock,
  tokenUpdateManyMock,
  transactionMock,
  checkRateLimitMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
  userFindFirstMock: vi.fn(),
  tokenDeleteManyMock: vi.fn(),
  tokenCreateMock: vi.fn(),
  tokenUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  sendEmailMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => { afterCallbacks.push(callback) },
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: userFindFirstMock },
    invitationToken: { updateMany: tokenUpdateManyMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  gcRateLimitStore: vi.fn(),
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.test' }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { NextRequest } from 'next/server'
import { POST } from './route'

const NOT_LIMITED = { limited: false, remaining: 9, resetAt: Date.now() + 60_000 }
const LIMITED = { limited: true, remaining: 0, resetAt: Date.now() + 60_000 }

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/register-card', {
    method: 'POST',
    body: JSON.stringify({ privacyAcknowledged: true, ...body }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
  })
}

async function runAfterResponse(): Promise<void> {
  const callbacks = afterCallbacks.splice(0)
  await Promise.all(callbacks.map((callback) => callback()))
}

const DORMANT = {
  id: 'u_dormant',
  email: 'Salon@Example.lv',
  name: 'Salon Owner',
  cardNumber: '4321',
  platformRole: 'customer',
  teamRole: null,
  superAdmin: false,
  mustChangePassword: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  afterCallbacks.length = 0
  checkRateLimitMock.mockResolvedValue(NOT_LIMITED)
  sendEmailMock.mockResolvedValue(undefined)
  tokenDeleteManyMock.mockResolvedValue({ count: 0 })
  tokenCreateMock.mockResolvedValue({})
  tokenUpdateManyMock.mockResolvedValue({ count: 1 })
  transactionMock.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ invitationToken: { deleteMany: tokenDeleteManyMock, create: tokenCreateMock } }))
})

describe('POST /api/auth/register-card — activation link request', () => {
  it('mails a one-time invitation to the e-mail on file for a dormant card', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT)

    const res = await POST(makeRequest({ cardNumber: '4321', language: 'ru' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('set-cookie')).toBeNull()
    // Nothing is issued or sent before the response is complete.
    expect(tokenCreateMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()

    await runAfterResponse()

    expect(tokenDeleteManyMock).toHaveBeenCalledWith({ where: { userId: 'u_dormant', status: { not: 'accepted' } } })
    expect(tokenCreateMock).toHaveBeenCalledTimes(1)
    const created = tokenCreateMock.mock.calls[0][0].data
    expect(created).toMatchObject({ userId: 'u_dormant', email: 'salon@example.lv', cardNumber: '4321', language: 'ru' })
    const ttlHours = (created.expiresAt.getTime() - Date.now()) / 3_600_000
    expect(ttlHours).toBeGreaterThan(23.9)
    expect(ttlHours).toBeLessThanOrEqual(24)

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const [to, , html] = sendEmailMock.mock.calls[0]
    expect(to).toBe('salon@example.lv')
    const token = /\/auth\/invite\?token=([0-9a-f]{64})/.exec(html)?.[1]
    expect(token).toBeDefined()
    expect(createHash('sha256').update(token!).digest('hex')).toBe(created.tokenHash)
    expect(html).not.toContain('/auth/register')
  })

  it('never mails an address typed by the visitor', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT)

    const res = await POST(makeRequest({ cardNumber: '4321', email: 'attacker@evil.test', phoneLast4: '1234' }))
    await runAfterResponse()

    expect(res.status).toBe(202)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock.mock.calls[0][0]).toBe('salon@example.lv')
  })

  it.each([
    ['an unknown card', null],
    ['an already activated card', { ...DORMANT, mustChangePassword: false }],
    ['a card without a usable e-mail (import placeholder)', { ...DORMANT, email: 'card.4321@client.local' }],
    ['a GDPR-anonymised card', { ...DORMANT, email: 'erased-u_dormant@deleted.invalid' }],
    ['a platform admin', { ...DORMANT, platformRole: 'admin' }],
    ['a Super Admin', { ...DORMANT, platformRole: 'admin', superAdmin: true }],
    ['a staff manager', { ...DORMANT, teamRole: 'manager' }],
    ['a stray Super Admin flag on a customer', { ...DORMANT, superAdmin: true }],
  ])('answers %s exactly like an eligible card and issues nothing', async (_label, candidate) => {
    userFindFirstMock.mockResolvedValue(candidate)

    const res = await POST(makeRequest({ cardNumber: '4321' }))
    await runAfterResponse()

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(transactionMock).not.toHaveBeenCalled()
    expect(tokenCreateMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('returns a byte-identical response for eligible, unknown, staff and activated cards', async () => {
    const bodies: string[] = []
    for (const candidate of [DORMANT, null, { ...DORMANT, platformRole: 'admin' }, { ...DORMANT, mustChangePassword: false }]) {
      userFindFirstMock.mockResolvedValueOnce(candidate)
      const res = await POST(makeRequest({ cardNumber: '4321' }))
      bodies.push(`${res.status} ${await res.text()}`)
    }
    expect(new Set(bodies)).toEqual(new Set(['202 {"ok":true}']))
  })

  it('caps activation e-mails per card account (each new link replaces the previous one)', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT)
    checkRateLimitMock.mockImplementation(async (key: string) => (key === 'card-activation-send:u_dormant' ? LIMITED : NOT_LIMITED))

    const res = await POST(makeRequest({ cardNumber: '4321' }))
    await runAfterResponse()

    expect(res.status).toBe(202)
    expect(checkRateLimitMock).toHaveBeenCalledWith('card-activation-send:u_dormant', { windowMs: 86_400_000, maxAttempts: 3 })
    expect(tokenCreateMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('retires the token when the e-mail cannot be delivered', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT)
    sendEmailMock.mockRejectedValue(new Error('smtp down'))

    const res = await POST(makeRequest({ cardNumber: '4321' }))
    await runAfterResponse()

    expect(res.status).toBe(202)
    const tokenHash = tokenCreateMock.mock.calls[0][0].data.tokenHash
    expect(tokenUpdateManyMock).toHaveBeenCalledWith({ where: { tokenHash, status: 'sent' }, data: { status: 'error' } })
  })

  it('rate-limits by IP before reading the body or the database', async () => {
    checkRateLimitMock.mockResolvedValueOnce(LIMITED)

    const res = await POST(makeRequest({ cardNumber: '4321' }))

    expect(res.status).toBe(429)
    expect(checkRateLimitMock).toHaveBeenCalledWith('register-card:203.0.113.7')
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })

  it('rate-limits per card before the lookup, so a limit says nothing about the card', async () => {
    checkRateLimitMock.mockImplementation(async (key: string) => (key === 'register-card:card:4321' ? LIMITED : NOT_LIMITED))

    const res = await POST(makeRequest({ cardNumber: '4321' }))

    expect(res.status).toBe(429)
    expect(checkRateLimitMock).toHaveBeenCalledWith('register-card:card:4321', { windowMs: 3_600_000, maxAttempts: 5 })
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })

  it.each([
    ['privacy notice not acknowledged', { cardNumber: '4321', privacyAcknowledged: false }, 'privacy_acknowledgement_required'],
    ['blank card number', { cardNumber: '   ' }, 'card_required'],
    ['card number longer than six digits', { cardNumber: '1234567' }, 'invalid_card'],
    ['non-numeric card number', { cardNumber: 'ABC12' }, 'invalid_card'],
  ])('rejects %s on input alone, without a lookup', async (_label, body, error) => {
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error })
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })

  it('treats leading zeroes as display padding', async () => {
    userFindFirstMock.mockResolvedValue(null)
    await POST(makeRequest({ cardNumber: '0042' }))
    expect(userFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { cardNumber: { equals: '42', mode: 'insensitive' } },
    }))
  })
})
