import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  companyFindFirstMock,
  userFindFirstMock,
  transactionMock,
  hashPasswordMock,
  createSessionMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  companyFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: companyFindFirstMock },
    user: { findFirst: userFindFirstMock, update: vi.fn() },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  createSession: createSessionMock,
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
  cardNumber: '5678',
  mustChangePassword: true,
  pkLast3: '221',
}

const DORMANT_USER_NO_PK = {
  id: 'user_dormant_2',
  email: 'nopk@example.com',
  cardNumber: '5679',
  mustChangePassword: true,
  pkLast3: null,
}

const ACTIVATED_USER = {
  id: 'user_active_1',
  email: 'active@example.com',
  cardNumber: '9012',
  mustChangePassword: false,
}

function makeTx() {
  return {
    user: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })) },
    companyMember: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue({ limited: false, resetAt: 0 })
  hashPasswordMock.mockResolvedValue('hashed')
  createSessionMock.mockResolvedValue('token')
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

  it('activates a dormant individual cardholder (ERP import) on the correct last-3 code, without creating a new user', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: '221' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: expect.objectContaining({ id: 'user_dormant_1' }) })
    expect(createSessionMock).toHaveBeenCalledWith('user_dormant_1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=token')
    expect(sendEmail).toHaveBeenCalledWith(
      'master@example.com',
      expect.any(String),
      expect.any(String)
    )
  })

  it('accepts the code regardless of dashes/case/whitespace', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: ' 2-2-1 ' }))

    expect(res.status).toBe(200)
  })

  it('does not notify anyone when the last-3 code is wrong', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: '999' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'wrong_code' })
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects with a distinct error when the card has no personal code on file', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER_NO_PK)

    const res = await POST(makeRequest({ cardNumber: '5679', password: '123' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'no_personal_code_on_file' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects a brand-new company card claim with the wrong password', async () => {
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue(COMPANY)

    const res = await POST(makeRequest({ cardNumber: '1234', password: 'wrong-guess' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'wrong_password' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates a real user bound to the company and a session on success', async () => {
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue(COMPANY)
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const res = await POST(makeRequest({ cardNumber: '1234', name: 'Ivan', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(201)
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'card.1234@client.local',
          companyId: 'company_1',
          companyName: 'SIA MIKS PLUS',
          teamRole: 'buyer',
          cardNumber: '1234',
          mustChangePassword: true,
        }),
      })
    )
    expect(tx.companyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company_1', role: 'buyer' }),
      })
    )
    expect(createSessionMock).toHaveBeenCalled()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=token')
    expect(sendEmail).toHaveBeenCalledWith('office@example.com', expect.any(String), expect.any(String))
  })

  it('skips the activation notice when the company has no contact email on file', async () => {
    userFindFirstMock.mockResolvedValue(null)
    companyFindFirstMock.mockResolvedValue({ ...COMPANY, contactEmail: null })
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const res = await POST(makeRequest({ cardNumber: '1234', password: FIRST_LOGIN_PASSWORD }))

    expect(res.status).toBe(201)
    expect(sendEmail).not.toHaveBeenCalled()
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
    expect(companyFindFirstMock).toHaveBeenCalledWith({
      where: { cardNumber: { equals: '1', mode: 'insensitive' } },
    })
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
