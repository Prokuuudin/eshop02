import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/invoice-template', () => ({ buildInvoiceHtml: vi.fn(() => '<html>invoice</html>') }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://hairshop-pro.lv') }))
vi.mock('@/lib/orders-data-store', () => ({ getServerOrderById: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({ getMergedProducts: vi.fn(async () => []) }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: txMock } }))

import { requireAdminPermission } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { appendServerAudit } from '@/lib/server-audit'
import { getServerOrderById } from '@/lib/orders-data-store'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const ORDER = { id: '1042', firstName: 'Ivan', lastName: 'Petrov', items: [] }

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/orders/send-invoice', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.ADMIN_API_TOKEN
  txMock.mockImplementation((cb: (tx: unknown) => unknown) => cb({}))
})

describe('POST /api/admin/orders/send-invoice', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const res = await POST(makeRequest({ orderId: '1042', email: 'a@b.com' }))

    expect(res.status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects missing fields', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    const res = await POST(makeRequest({ orderId: '', email: '' }))
    expect(res.status).toBe(422)
  })

  it('rejects an invalid email', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    const res = await POST(makeRequest({ orderId: '1042', email: 'not-an-email' }))
    expect(res.status).toBe(422)
  })

  it('rejects an unsupported language', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    const res = await POST(makeRequest({ orderId: '1042', email: 'a@b.com', language: 'ru' }))
    expect(res.status).toBe(422)
  })

  it('404s when the order does not exist', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(getServerOrderById).mockResolvedValue(null)

    const res = await POST(makeRequest({ orderId: 'missing', email: 'a@b.com' }))

    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends the invoice and records an audit entry on success', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)

    const res = await POST(makeRequest({ orderId: '1042', email: 'customer@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith('customer@example.com', expect.any(String), '<html>invoice</html>')
    expect(appendServerAudit).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), ADMIN_USER,
      expect.objectContaining({ action: 'order.invoice_sent', entityId: '1042' }),
    )
  })

  it('returns a controlled 500 (not an unhandled exception) if a step after order-lookup throws', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'))

    const res = await POST(makeRequest({ orderId: '1042', email: 'customer@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(appendServerAudit).not.toHaveBeenCalled()
  })

  it('enforces the X-Admin-Token header when ADMIN_API_TOKEN is configured', async () => {
    process.env.ADMIN_API_TOKEN = 'secret-token'
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)

    const res = await POST(makeRequest({ orderId: '1042', email: 'a@b.com' }))

    expect(res.status).toBe(401)
    expect(getServerOrderById).not.toHaveBeenCalled()
  })
})
