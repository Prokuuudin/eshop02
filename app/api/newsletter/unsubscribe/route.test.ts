import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const unsubscribeFromMarketing = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/newsletter-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/newsletter-store')>()),
  unsubscribeFromMarketing,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { GET, POST } from './route'
import { marketingUnsubToken } from '@/lib/newsletter-store'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEWSLETTER_UNSUB_SECRET', 'test-only-unsubscribe-secret')
})

afterEach(() => vi.unstubAllEnvs())

const url = (email: string, token: string) =>
  `https://shop.test/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`

describe('newsletter unsubscribe link', () => {
  it('GET unsubscribes with a valid signed token', async () => {
    const res = await GET(new NextRequest(url('user@test.com', marketingUnsubToken('user@test.com'))))
    expect(res.status).toBe(200)
    expect(unsubscribeFromMarketing).toHaveBeenCalledWith('user@test.com')
  })

  it('GET rejects a forged token without changing data', async () => {
    const res = await GET(new NextRequest(url('user@test.com', 'f'.repeat(32))))
    expect(res.status).toBe(400)
    expect(unsubscribeFromMarketing).not.toHaveBeenCalled()
  })
})

describe('newsletter unsubscribe without NEWSLETTER_UNSUB_SECRET in production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEWSLETTER_UNSUB_SECRET', '')
  })

  it('GET answers a controlled 503 page instead of crashing', async () => {
    const res = await GET(new NextRequest(url('user@test.com', 'f'.repeat(32))))
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('Сервис временно недоступен')
    expect(unsubscribeFromMarketing).not.toHaveBeenCalled()
  })

  it('POST (one-click) answers 503 JSON and records nothing', async () => {
    const res = await POST(new NextRequest(url('user@test.com', 'f'.repeat(32)), { method: 'POST' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false, error: 'unavailable' })
    expect(unsubscribeFromMarketing).not.toHaveBeenCalled()
  })
})
