import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/account-owner-lock', async () => (await import('@/tests/helpers/account-owner-lock-mock')).accountOwnerLockPassthrough())

type Token = { tokenHash: string; userId: string; status: string }

const h = vi.hoisted(() => ({
  tokens: [] as Token[],
  transactions: 0,
  sendEmail: vi.fn(),
  buildInviteEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const db = {
    $executeRaw: async () => 0,
    invitationToken: {
      findFirst: async ({ where }: { where: { userId: string; status: string } }) =>
        h.tokens.find((t) => t.userId === where.userId && t.status === where.status) ?? null,
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = h.tokens.length
        h.tokens = h.tokens.filter((t) => t.userId !== where.userId || t.status === 'accepted')
        return { count: before - h.tokens.length }
      },
      create: async ({ data }: { data: { tokenHash: string; userId: string } }) => {
        h.tokens.push({ tokenHash: data.tokenHash, userId: data.userId, status: 'sent' })
      },
      updateMany: async ({ where, data }: { where: { tokenHash: string; status: string }; data: { status: string } }) => {
        let count = 0
        for (const t of h.tokens) if (t.tokenHash === where.tokenHash && t.status === where.status) { t.status = data.status; count += 1 }
        return { count }
      },
    },
  }
  return {
    prisma: {
      ...db,
      $transaction: async (run: (tx: typeof db) => Promise<unknown>) => {
        h.transactions += 1
        return run(db)
      },
    },
  }
})
vi.mock('@/lib/revoked-card-policy', () => ({ assertCardAssignable: vi.fn(async () => undefined) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn(async () => []) }))
vi.mock('@/lib/bonus-config-server-store', () => ({ getBonusProgramConfig: vi.fn(async () => ({ enabled: false })) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://shop.test') }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({
  buildInviteEmail: h.buildInviteEmail,
  pickInviteTemplate: vi.fn(() => undefined),
}))

import { sendCardActivationInvite } from '@/lib/card-activation'

const USER = {
  id: 'user-1', email: 'holder@inbox.test', name: 'Card Holder', cardNumber: '9001',
  platformRole: 'customer', teamRole: null, superAdmin: false, mustChangePassword: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.tokens = []
  h.transactions = 0
  h.sendEmail.mockResolvedValue(undefined)
  h.buildInviteEmail.mockImplementation(() => ({ subject: 'Invite', html: '<p>Invite</p>' }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendCardActivationInvite — opt-out link secret (regression 2026-11-27)', () => {
  it('issues and mails a link when the secret is available', async () => {
    await sendCardActivationInvite(USER, 'lv')

    expect(h.tokens).toEqual([expect.objectContaining({ userId: 'user-1', status: 'sent' })])
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('without NEWSLETTER_UNSUB_SECRET in production issues nothing and sends nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEWSLETTER_UNSUB_SECRET', '')

    await sendCardActivationInvite(USER, 'lv')

    expect(h.transactions).toBe(0)
    expect(h.tokens).toHaveLength(0)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('a failure while building the email retires the just-issued link, so a later request can issue a new one', async () => {
    h.buildInviteEmail.mockImplementationOnce(() => { throw new Error('template failure') })

    await sendCardActivationInvite(USER, 'lv')

    expect(h.tokens).toEqual([expect.objectContaining({ status: 'error' })])
    expect(h.sendEmail).not.toHaveBeenCalled()

    await sendCardActivationInvite(USER, 'lv')
    expect(h.tokens).toEqual([expect.objectContaining({ status: 'sent' })])
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })
})
