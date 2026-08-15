import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-helpers', () => ({
  authenticateRequest: vi.fn(),
  errorResponse: (error: string, status = 400) => NextResponse.json({ error }, { status }),
  successResponse: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
}))
vi.mock('@/lib/invoices-data-store', () => ({ getInvoiceById: vi.fn(), recordPaymentInDb: vi.fn() }))
vi.mock('@/lib/audit-log-store', () => ({ logAuditAction: vi.fn() }))
vi.mock('@/lib/webhook-sender', () => ({ triggerCompanyWebhook: vi.fn() }))

import { authenticateRequest } from '@/lib/api-helpers'
import { getInvoiceById, recordPaymentInDb } from '@/lib/invoices-data-store'
import { POST } from './route'

const context = { params: Promise.resolve({ id: 'invoice-b' }) }
const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/v1/invoices/invoice-b/payments', {
  method: 'POST', body: JSON.stringify(body),
}), context)

describe('POST /api/v1/invoices/:id/payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authenticateRequest).mockResolvedValue({
      authenticated: true, user: { id: 'api-a', companyId: 'company-a', apiAccess: true },
    })
  })

  it('hides a cross-tenant invoice and does not record a payment', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue({ id: 'invoice-b', companyId: 'company-b', status: 'issued' } as never)
    const response = await post({ amount: 10 })
    expect(response.status).toBe(404)
    expect(recordPaymentInDb).not.toHaveBeenCalled()
  })

  it.each(['10', null, Number.POSITIVE_INFINITY])('rejects a non-finite numeric amount %s', async (amount) => {
    const response = await post({ amount })
    expect(response.status).toBe(400)
    expect(getInvoiceById).not.toHaveBeenCalled()
  })

  it('rejects overpayment without mutating the invoice', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue({
      id: 'invoice-b', companyId: 'company-a', status: 'issued', remainingAmount: 25,
    } as never)
    const response = await post({ amount: 30 })
    expect(response.status).toBe(400)
    expect(recordPaymentInDb).not.toHaveBeenCalled()
  })
})
