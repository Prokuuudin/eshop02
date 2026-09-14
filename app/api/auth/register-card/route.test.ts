import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  companyFindFirstMock,
  userFindFirstMock,
  userUpdateMock,
  transactionMock,
  hashPasswordMock,
  createSessionMock,
  verifyPasswordMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  companyFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userUpdateMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: companyFindFirstMock },
    user: { findFirst: userFindFirstMock, update: userUpdateMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  createSession: createSessionMock,
  verifyPassword: verifyPasswordMock,
  mapDbToServerUser: vi.fn((u: unknown) => u),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  gcRateLimitStore: vi.fn(),
}))
vi.mock('@/lib/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { FIRST_LOGIN_PASSWORD } from '@/lib/auth-constants'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/register-card', {
    method: 'POST',
    body: JSON.stringify({ privacyAcknowledged: true, ...body }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const COMPANY = {
  id: 'company_1',
  companyName: 'SIA MIKS PLUS',
  cardNumber: '1234',
  approvalWorkflowEnabled: false,
  contactEmail: 'office@example.com',
}

const DORMANT_USER = {
  id: 'user_dormant_1',
  email: 'master@example.com',
  phone: '+371 27 654 321',
  cardNumber: '5678',
  mustChangePassword: true,
}

const DORMANT_USER_NO_CONTACT = {
  id: 'user_dormant_2',
  email: `card.5679@client.local`,
  phone: null,
  cardNumber: '5679',
  mustChangePassword: true,
}

const ACTIVATED_USER = {
  id: 'user_active_1',
  email: 'active@example.com',
  cardNumber: '9012',
  mustChangePassword: false,
}

function makeTx() {
  return {
    user: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      update: vi.fn(async () => ({ bonusPoints: 500 })),
    },
    companyMember: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })) },
    bonusTransaction: { findFirst: vi.fn(async () => null), create: vi.fn() },
    keyValueSetting: { findUnique: vi.fn(async () => null) },
  }
}

// The dormant-cardholder activation branch runs its user update and the
// welcome-bonus grant in one $transaction — both go through this same
// tx.user.update mock, so it must keep merging `data` like the plain
// prisma.user.update it replaced.
function makeActivationTx() {
  return {
    user: { update: userUpdateMock },
    bonusTransaction: { findFirst: vi.fn(async (): Promise<{ id: string } | null> => null), create: vi.fn() },
    keyValueSetting: { findUnique: vi.fn(async () => null) },
  }
}
let activationTx: ReturnType<typeof makeActivationTx>

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue({ limited: false, resetAt: 0 })
  hashPasswordMock.mockResolvedValue('hashed')
  createSessionMock.mockResolvedValue('token')
  verifyPasswordMock.mockResolvedValue(false)
  userUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...DORMANT_USER,
    ...data,
    bonusPoints: 500,
  }))
  activationTx = makeActivationTx()
  transactionMock.mockImplementation(async (fn) => fn(activationTx))
})

describe('POST /api/auth/register-card', () => {
  it('rejects a card number with no matching company or individual cardholder', async () => {
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue(null)

    const res = await POST(makeRequest({ cardNumber: '9999', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'card_not_found' })
  })

  it('rejects when the card belongs to an already-activated individual cardholder', async () => {
    userFindFirstMock.mockResolvedValue(ACTIVATED_USER)

    const res = await POST(makeRequest({ cardNumber: '9012', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'card_already_registered' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects a card that already has a registered user (company path, legacy shape)', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'existing-user' })
    companyFindFirstMock.mockResolvedValue(COMPANY)

    const res = await POST(makeRequest({ cardNumber: '1234', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'card_already_registered' })
  })

  it('activates a dormant individual cardholder (ERP import) on the correct phone last-4, without creating a new user', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '4321' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: expect.objectContaining({ id: 'user_dormant_1' }) })
    expect(createSessionMock).toHaveBeenCalledWith('user_dormant_1')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(hashPasswordMock).toHaveBeenCalledWith('4321')
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_dormant_1' },
      data: expect.objectContaining({
        passwordHash: 'hashed',
        mustChangePassword: true,
      }),
    }))
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=token')
    expect(sendEmail).toHaveBeenCalledWith(
      'master@example.com',
      expect.any(String),
      expect.any(String)
    )
  })

  it('grants the one-time welcome bonus on first card activation', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '4321' }))

    expect(res.status).toBe(200)
    expect(activationTx.bonusTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_dormant_1', type: 'welcome' } })
    )
    expect(activationTx.bonusTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user_dormant_1', type: 'welcome', points: 500 }) })
    )
  })

  it('does not grant the welcome bonus twice if one was already recorded', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)
    activationTx.bonusTransaction.findFirst.mockResolvedValue({ id: 'existing-welcome-tx' })

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '4321' }))

    expect(res.status).toBe(200)
    expect(activationTx.bonusTransaction.create).not.toHaveBeenCalled()
  })

  it('activates on a matching email alone, without a phone number', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', email: 'MASTER@example.com' }))

    expect(res.status).toBe(200)
    expect(createSessionMock).toHaveBeenCalledWith('user_dormant_1')
    expect(hashPasswordMock).toHaveBeenCalledWith('master@example.com')
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passwordHash: 'hashed',
        mustChangePassword: true,
      }),
    }))
  })

  it('uses the matched email as the password when a submitted phone suffix is wrong', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({
      cardNumber: '5678',
      phoneLast4: '0000',
      email: 'MASTER@example.com',
    }))

    expect(res.status).toBe(200)
    expect(hashPasswordMock).toHaveBeenCalledWith('master@example.com')
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: 'hashed', mustChangePassword: true }),
    }))
  })

  it('reclaims an anonymised account by its retained card and one-way email proof', async () => {
    const erasedUser = {
      ...DORMANT_USER,
      email: 'anon-user_dormant_1@deleted.invalid',
      phone: null,
      name: null,
      cardRecoveryEmailHash: 'email-proof',
      cardRecoveryPhoneHash: null,
    }
    userFindFirstMock.mockResolvedValue(erasedUser)
    verifyPasswordMock.mockImplementation(async (value: string, hash: string) =>
      value === 'email:master@example.com' && hash === 'email-proof'
    )
    userUpdateMock.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...erasedUser, ...data }))

    const res = await POST(makeRequest({ cardNumber: '5678', email: 'MASTER@example.com', name: 'Master' }))

    expect(res.status).toBe(200)
    expect(verifyPasswordMock).toHaveBeenCalledWith('email:master@example.com', 'email-proof')
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_dormant_1' },
      data: expect.objectContaining({
        email: 'master@example.com',
        name: 'Master',
        cardRecoveryEmailHash: null,
        cardRecoveryPhoneHash: null,
      }),
    }))
    expect(await res.json()).toMatchObject({ user: expect.objectContaining({ email: 'master@example.com' }) })
  })

  it('activates when both phone and email are submitted and only one matches', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '0000', email: 'master@example.com' }))

    expect(res.status).toBe(200)
  })

  it('ignores non-digit characters when comparing the phone last 4', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '43-21' }))

    expect(res.status).toBe(200)
  })

  it('rejects and never matches the synthetic client.local placeholder email', async () => {
    userFindFirstMock.mockResolvedValue({ ...DORMANT_USER, email: 'card.5678@client.local' })

    const res = await POST(makeRequest({ cardNumber: '5678', email: 'card.5678@client.local' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'wrong_contact' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('does not notify anyone when neither phone nor email match', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', phoneLast4: '9999', email: 'wrong@example.com' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'wrong_contact' })
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects when neither phone nor email is submitted', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'contact_required' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects with a distinct error when the card has no usable phone or email on file', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER_NO_CONTACT)

    const res = await POST(makeRequest({ cardNumber: '5679', phoneLast4: '1234' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'no_contact_on_file' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects when the card number is blank', async () => {
    const res = await POST(makeRequest({ cardNumber: '   ', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(400)
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
    expect(prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('treats leading zeroes as display padding for a short card number', async () => {
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue(null)

    await POST(makeRequest({ cardNumber: '0001', password: FIRST_LOGIN_PASSWORD }))

    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: { cardNumber: { equals: '1', mode: 'insensitive' } },
    })
    expect(companyFindFirstMock).not.toHaveBeenCalled()
  })

  it('rejects a new card identifier longer than six digits', async () => {
    const res = await POST(makeRequest({ cardNumber: '1234567', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_card' })
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })

  it('rate-limits repeated attempts against the same card number regardless of IP', async () => {
    // The shared welcome password means a single known card number is the only
    // thing standing between an attacker and someone else's account — cap
    // attempts per card, not just per IP, to slow that down.
    checkRateLimitMock.mockImplementation(async (key: string) =>
      key.startsWith('register-card:card:')
        ? { limited: true, resetAt: Date.now() + 60_000 }
        : { limited: false, resetAt: 0 }
    )
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue(null)

    const res = await POST(makeRequest({ cardNumber: '1234', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(429)
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  it('rate-limits repeated attempts from the same IP', async () => {
    checkRateLimitMock.mockResolvedValue({ limited: true, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest({ cardNumber: '1234', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(429)
  })
})
