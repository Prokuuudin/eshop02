import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { sendEmail } from '@/lib/mailer'
import { getServerUser } from '@/lib/server-auth'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notifications/send-email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/notifications/send-email', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const res = await POST(makeRequest({ message: 'M', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when message is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const res = await POST(makeRequest({ title: 'T', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('calls sendEmail with user email and returns 200', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    const res = await POST(makeRequest({ title: 'Order shipped', message: 'Your order is on the way', type: 'success' }))
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [to, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(to).toBe('user@shop.com')
    expect(subject).toContain('Order shipped')
    expect(html).toContain('Order shipped')
    expect(html).toContain('Your order is on the way')
  })

  it('includes link button when link is provided', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: '/account' }))
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).toContain('/account')
  })

  it('returns 500 when sendEmail throws', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp error'))
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(500)
  })

  it('rejects javascript: link — does not include it in html', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: 'javascript:alert(1)' }))
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).not.toContain('javascript:')
  })

  it('rejects protocol-relative link — does not include it in html', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: '//evil.com' }))
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).not.toContain('evil.com')
  })
})
