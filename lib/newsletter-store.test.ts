import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  subscribeToNewsletter,
  marketingUnsubToken,
  verifyMarketingUnsubToken,
  marketingUnsubUrl,
} from '@/lib/newsletter-store'

beforeEach(() => vi.clearAllMocks())

describe('marketing unsubscribe token', () => {
  it('verifies its own token and is case-insensitive on email', () => {
    const t = marketingUnsubToken('User@Test.com')
    expect(verifyMarketingUnsubToken('user@test.com', t)).toBe(true)
    expect(verifyMarketingUnsubToken('USER@TEST.COM', t)).toBe(true)
  })

  it('rejects a forged or mismatched token', () => {
    expect(verifyMarketingUnsubToken('user@test.com', 'deadbeef')).toBe(false)
    expect(verifyMarketingUnsubToken('user@test.com', marketingUnsubToken('other@test.com'))).toBe(false)
  })

  it('builds an unsubscribe URL with a matching token and lowercased email', () => {
    const url = marketingUnsubUrl('User@Test.com', 'https://shop.example')
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/api/newsletter/unsubscribe')
    const email = parsed.searchParams.get('email') ?? ''
    const token = parsed.searchParams.get('token') ?? ''
    expect(email).toBe('user@test.com')
    expect(verifyMarketingUnsubToken(email, token)).toBe(true)
  })
})

describe('subscribeToNewsletter', () => {
  it('calls upsert with lowercased email in key', async () => {
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({
      key: 'newsletter:subscriber:foo@bar.com',
      value: { email: 'foo@bar.com', consentAt: '2026-01-01T00:00:00.000Z' },
    })

    await subscribeToNewsletter('Foo@Bar.com')

    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'newsletter:subscriber:foo@bar.com' },
      })
    )
  })

  it('stores value with lowercased email and ISO timestamp in both create and update', async () => {
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({
      key: 'newsletter:subscriber:test@example.com',
      value: { email: 'test@example.com', consentAt: '2026-01-01T00:00:00.000Z' },
    })

    await subscribeToNewsletter('Test@Example.com')

    const call = vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0]

    // create/update.value are typed as the generic Prisma Json union, which doesn't
    // expose our subscriber shape — cast to the shape the store actually writes.
    const createValue = call.create.value as unknown as { email: string; consentAt: string }
    const updateValue = call.update.value as unknown as { email: string; consentAt: string }

    // Check create payload
    expect(createValue).toEqual(
      expect.objectContaining({
        email: 'test@example.com',
      })
    )
    expect(createValue.consentAt).toBeTruthy()
    // Verify consentAt is an ISO string
    expect(typeof createValue.consentAt).toBe('string')
    expect(createValue.consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

    // Check update payload
    expect(updateValue).toEqual(
      expect.objectContaining({
        email: 'test@example.com',
      })
    )
    expect(updateValue.consentAt).toBeTruthy()
    expect(typeof updateValue.consentAt).toBe('string')
  })

  it('handles re-subscribe by calling upsert both times without error', async () => {
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({
      key: 'newsletter:subscriber:user@test.com',
      value: { email: 'user@test.com', consentAt: '2026-01-01T00:00:00.000Z' },
    })

    // First subscribe
    await subscribeToNewsletter('user@test.com')
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledTimes(1)

    // Second subscribe (re-subscribe)
    await subscribeToNewsletter('user@test.com')
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledTimes(2)

    // Both calls should have the same key
    const firstCall = vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0]
    const secondCall = vi.mocked(prisma.keyValueSetting.upsert).mock.calls[1][0]
    expect(firstCall.where.key).toBe(secondCall.where.key)
  })
})
