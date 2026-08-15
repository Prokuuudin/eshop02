import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    returnRequest: { findUnique: vi.fn() },
    $transaction: txMock,
  },
}))

import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'
import { appendServerAudit } from '@/lib/server-audit'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

const RETURN_RECORD = {
  id: 'ret-1',
  orderId: '1042',
  status: 'refunded',
  reason: 'defective',
  comment: null,
  items: [],
  refundAmount: 49.99,
  firstName: 'Ivan',
  lastName: 'Petrov',
  email: 'customer@example.com',
  phone: '+37126000000',
  resolution: 'Saved resolution',
  resolvedAt: new Date(),
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/returns/notify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  txMock.mockImplementation((cb: (tx: unknown) => unknown) => cb({}))
})

describe('POST /api/admin/returns/notify', () => {
  it('rejects non-admins before reading the return record', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const res = await POST(makeRequest({ returnId: 'ret-1' }))

    expect(res.status).toBe(403)
    expect(prisma.returnRequest.findUnique).not.toHaveBeenCalled()
  })

  it('404s on an unknown returnId instead of sending to a client-controlled address', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ returnId: 'does-not-exist' }))

    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('ignores a client-supplied "to" and always emails the record\'s own address', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue(RETURN_RECORD as never)

    const res = await POST(makeRequest({
      returnId: 'ret-1',
      to: 'attacker@evil.example',
      status: 'refunded',
      refundAmount: 999999,
    } as unknown as Record<string, unknown>))

    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledWith(
      'customer@example.com', // from the DB record, not the request body
      expect.any(String),
      expect.any(String),
    )
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).not.toContain('999999') // the inflated client refundAmount never reaches the email
    expect(html).toContain('49.99')
  })

  it('HTML-escapes an unsaved resolution draft before interpolating it', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue(RETURN_RECORD as never)

    await POST(makeRequest({ returnId: 'ret-1', resolution: '<img src=x onerror=alert(1)>' }))

    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('records an audit entry for the notification', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue(RETURN_RECORD as never)

    await POST(makeRequest({ returnId: 'ret-1' }))

    expect(appendServerAudit).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), ADMIN_USER,
      expect.objectContaining({ action: 'return.notified', entityId: 'ret-1' }),
    )
  })

  it('rejects when the record has no usable email', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue({ ...RETURN_RECORD, email: '' } as never)

    const res = await POST(makeRequest({ returnId: 'ret-1' }))

    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
