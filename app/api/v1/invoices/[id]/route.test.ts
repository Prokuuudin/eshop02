import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/api-helpers', () => ({
  authenticateRequest: vi.fn(),
  errorResponse: (error: string, status = 400) => NextResponse.json({ error }, { status }),
  successResponse: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
}))
vi.mock('@/lib/invoices-data-store', () => ({ getInvoiceById: vi.fn() }))

import { authenticateRequest } from '@/lib/api-helpers'
import { getInvoiceById } from '@/lib/invoices-data-store'
import { GET } from './route'

const req = new NextRequest('https://shop.test/api/v1/invoices/inv-1')
const context = { params: Promise.resolve({ id: 'inv-1' }) }

describe('GET /api/v1/invoices/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires authentication before loading the invoice', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({ authenticated: false, error: 'Unauthorized', status: 401 })
    expect((await GET(req, context)).status).toBe(401)
    expect(getInvoiceById).not.toHaveBeenCalled()
  })

  it('hides an invoice owned by another tenant', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({ authenticated: true, user: { id: 'u1', companyId: 'a', apiAccess: true } })
    vi.mocked(getInvoiceById).mockResolvedValue({ id: 'inv-1', companyId: 'b' } as never)
    expect((await GET(req, context)).status).toBe(404)
  })
})
