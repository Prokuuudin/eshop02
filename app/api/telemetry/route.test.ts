import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { checkRateLimit } from '@/lib/rate-limit'
import { logOperationalEvent } from '@/lib/observability'
import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/telemetry', {
  method: 'POST', headers: { 'x-forwarded-for': '203.0.113.10' }, body: JSON.stringify(body),
}))

describe('POST /api/telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false } as never)
  })

  it('rejects unknown event types without logging', async () => {
    expect((await post({ type: 'forged' })).status).toBe(400)
    expect(logOperationalEvent).not.toHaveBeenCalled()
  })

  it('rate limits errors by client IP', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true } as never)
    const response = await post({ type: 'error', message: 'spam' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ throttled: true })
    expect(checkRateLimit).toHaveBeenCalledWith('telemetry-error:203.0.113.10')
    expect(logOperationalEvent).not.toHaveBeenCalled()
  })

  it('redacts credentials before logging client errors', async () => {
    await post({ type: 'error', message: 'password=secret', path: '/checkout?token=secret' })
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.not.objectContaining({ message: 'password=secret' }))
  })
})
