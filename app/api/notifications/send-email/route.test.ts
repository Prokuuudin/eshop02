import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

const { sendEmailMock, getServerUserMock, checkRateLimitMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  getServerUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }))

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notifications/send-email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/notifications/send-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
  })

  it('returns 401 when not authenticated', async () => {
    getServerUserMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(401)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('returns 400 when title is missing', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'a@b.com' })
    const res = await POST(makeRequest({ message: 'M', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('returns 400 when message is missing', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'a@b.com' })
    const res = await POST(makeRequest({ title: 'T', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('rate-limits by authenticated user before SMTP', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'a@b.com' })
    checkRateLimitMock.mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ title: 'T', message: 'M' }))
    expect(res.status).toBe(429)
    expect(checkRateLimitMock).toHaveBeenCalledWith('notification-email:user:u1', expect.any(Object))
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('rejects oversized title and message before SMTP', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'a@b.com' })
    const res = await POST(makeRequest({ title: 'T'.repeat(161), message: 'M' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('field_too_long')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('calls sendEmail with user email and returns 200', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@shop.com' })
    sendEmailMock.mockResolvedValue(undefined)
    const res = await POST(makeRequest({ title: 'Order shipped', message: 'Your order is on the way', type: 'success' }))
    expect(res.status).toBe(200)
    expect(sendEmailMock).toHaveBeenCalledOnce()
    const [to, subject, html] = sendEmailMock.mock.calls[0]
    expect(to).toBe('user@shop.com')
    expect(subject).toContain('Order shipped')
    expect(html).toContain('Order shipped')
    expect(html).toContain('Your order is on the way')
  })

  it('includes link button when link is provided', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@shop.com' })
    sendEmailMock.mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: '/account' }))
    const html = sendEmailMock.mock.calls[0][2]
    expect(html).toContain('/account')
  })

  it('returns 500 when sendEmail throws', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@shop.com' })
    sendEmailMock.mockRejectedValue(new Error('smtp error'))
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(500)
  })

  it('rejects javascript: link — does not include it in html', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@shop.com' })
    sendEmailMock.mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: 'javascript:alert(1)' }))
    const html = sendEmailMock.mock.calls[0][2]
    expect(html).not.toContain('javascript:')
  })

  it('rejects protocol-relative link — does not include it in html', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@shop.com' })
    sendEmailMock.mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: '//evil.com' }))
    const html = sendEmailMock.mock.calls[0][2]
    expect(html).not.toContain('evil.com')
  })
})
