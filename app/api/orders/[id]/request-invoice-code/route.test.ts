import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  canAccessOrder: vi.fn(),
  getServerOrderById: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const CALLER = { id: 'user-1', email: 'buyer@example.com' }
const ORDER = { id: '1001', email: 'buyer@example.com', userId: 'user-1', firstName: 'Ivan', lastName: 'Petrov' }

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders/1001/request-invoice-code', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const context = { params: Promise.resolve({ id: '1001' }) }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CONTACT_TO = 'admin@shop.com'
  vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
  vi.mocked(getServerUser).mockResolvedValue(CALLER as never)
  vi.mocked(canAccessOrder).mockReturnValue(true)
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 1000 })
})

describe('POST /api/orders/[id]/request-invoice-code', () => {
  it('relays the code by email to staff and never touches the database', async () => {
    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(
      'admin@shop.com',
      expect.stringContaining('1001'),
      expect.stringContaining('010101-12345')
    )
  })

  it('returns 404 without leaking existence when the caller cannot access the order', async () => {
    vi.mocked(canAccessOrder).mockReturnValue(false)

    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)

    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 404 for a guest with no session — same as the order GET endpoint', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)

    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)

    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 404 when the order does not exist', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(null)

    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)

    expect(res.status).toBe(404)
  })

  it('rejects an empty personal code', async () => {
    const res = await POST(makeRequest({ personalCode: '   ' }), context)

    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects an unreasonably long personal code', async () => {
    const res = await POST(makeRequest({ personalCode: 'x'.repeat(65) }), context)

    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rate-limits repeated submissions per caller', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)

    expect(res.status).toBe(429)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('fails clearly instead of silently dropping the code when no admin inbox is configured', async () => {
    delete process.env.CONTACT_TO

    const res = await POST(makeRequest({ personalCode: '010101-12345' }), context)

    expect(res.status).toBe(503)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('escapes a hostile personal code before it reaches the email HTML', async () => {
    await POST(makeRequest({ personalCode: '<img src=x onerror=alert(1)>' }), context)

    const [, , html] = vi.mocked(sendEmail).mock.calls[0]
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })
})
