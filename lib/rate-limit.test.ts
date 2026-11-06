import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryRawMock, updateManyMock } = vi.hoisted(() => ({ queryRawMock: vi.fn(), updateManyMock: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock, rateLimit: { updateMany: updateManyMock, deleteMany: vi.fn() } } }))

import { checkRateLimit, refundRateLimit } from './rate-limit'

beforeEach(() => vi.clearAllMocks())

describe('refundRateLimit', () => {
  it('returns exactly one attempt, never below zero, and keeps the window', async () => {
    await refundRateLimit('login:ip:203.0.113.10')
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { key: 'login:ip:203.0.113.10', count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    })
  })

  it('never fails the login when the counter store is unavailable', async () => {
    updateManyMock.mockRejectedValueOnce(new Error('db down'))
    await expect(refundRateLimit('login:ip:x')).resolves.toBeUndefined()
  })
})

describe('checkRateLimit', () => {
  it('decides window expiry with the app clock, never the DB session clock/TimeZone', async () => {
    queryRawMock.mockResolvedValue([{ count: 1, resetAt: new Date(Date.now() + 60_000) }])
    const before = Date.now()

    await checkRateLimit('mfa:token:x', { windowMs: 60_000, maxAttempts: 5 })

    const [strings, ...values] = queryRawMock.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    expect(strings.join('?')).not.toMatch(/now\(\)/i)
    const dates = values.filter((v): v is Date => v instanceof Date).map((d) => d.getTime())
    // One "now" for the expiry comparison and one "now + window" for the new resetAt.
    expect(dates.some((t) => t >= before && t <= Date.now())).toBe(true)
    expect(dates.some((t) => t >= before + 60_000)).toBe(true)
  })

  it('limits once the counter exceeds maxAttempts', async () => {
    queryRawMock.mockResolvedValue([{ count: 6, resetAt: new Date(Date.now() + 60_000) }])
    expect((await checkRateLimit('k', { maxAttempts: 5 })).limited).toBe(true)
    queryRawMock.mockResolvedValue([{ count: 5, resetAt: new Date(Date.now() + 60_000) }])
    expect((await checkRateLimit('k', { maxAttempts: 5 })).limited).toBe(false)
  })
})
