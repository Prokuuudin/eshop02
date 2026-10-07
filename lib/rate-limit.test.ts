import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryRawMock } = vi.hoisted(() => ({ queryRawMock: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock, rateLimit: { deleteMany: vi.fn() } } }))

import { checkRateLimit } from './rate-limit'

beforeEach(() => vi.clearAllMocks())

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
