import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: {
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { subscribeToNewsletter } from '@/lib/newsletter-store'

beforeEach(() => vi.clearAllMocks())

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

    // Check create payload
    expect(call.create.value).toEqual(
      expect.objectContaining({
        email: 'test@example.com',
      })
    )
    expect(call.create.value.consentAt).toBeTruthy()
    // Verify consentAt is an ISO string
    expect(typeof call.create.value.consentAt).toBe('string')
    expect(call.create.value.consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

    // Check update payload
    expect(call.update.value).toEqual(
      expect.objectContaining({
        email: 'test@example.com',
      })
    )
    expect(call.update.value.consentAt).toBeTruthy()
    expect(typeof call.update.value.consentAt).toBe('string')
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
