import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/invoices-data-store', () => ({ getInvoicesByCompany: vi.fn(), createInvoiceInDb: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ getServerOrderById: vi.fn(), canAccessOrder: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { createInvoiceInDb, getInvoicesByCompany } from '@/lib/invoices-data-store'
import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { GET, POST } from './route'

const request = (url: string, body?: unknown) => new NextRequest(url, body === undefined ? undefined : {
  method: 'POST', body: JSON.stringify(body),
})

describe('/api/invoices tenant and money boundaries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects reading another company invoice list', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ platformRole: 'customer', companyId: 'company-a' } as never)
    const response = await GET(request('https://shop.test/api/invoices?companyId=company-b'))
    expect(response.status).toBe(403)
    expect(getInvoicesByCompany).not.toHaveBeenCalled()
  })

  it('does not create an invoice for an order the caller cannot access', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ platformRole: 'customer', companyId: 'company-a' } as never)
    vi.mocked(getServerOrderById).mockResolvedValue({ id: 'o1', companyId: 'company-b' } as never)
    vi.mocked(canAccessOrder).mockReturnValue(false)
    const response = await POST(request('https://shop.test/api/invoices', {
      id: 'i1', invoiceNumber: 'INV-1', companyId: 'company-a', orderId: 'o1', total: 0.01,
    }))
    expect(response.status).toBe(403)
    expect(createInvoiceInDb).not.toHaveBeenCalled()
  })

  it('derives all monetary values and items from the authoritative order', async () => {
    const user = { id: 'u1', email: 'buyer@test.com', platformRole: 'customer', companyId: 'company-a' }
    vi.mocked(getServerUser).mockResolvedValue(user as never)
    vi.mocked(getServerOrderById).mockResolvedValue({
      id: 'o1', companyId: 'company-a', subtotal: 100, tax: 21, total: 121,
      items: [{ id: 'p1', title: 'Product', price: 50, quantity: 2 }],
    } as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)
    vi.mocked(createInvoiceInDb).mockImplementation(async (invoice) => invoice as never)

    const response = await POST(request('https://shop.test/api/invoices', {
      id: 'i1', invoiceNumber: 'INV-1', companyId: 'company-a', orderId: 'o1',
      subtotal: 0.01, taxAmount: 0, total: 0.01, status: 'paid', items: [],
    }))
    expect(response.status).toBe(200)
    expect(createInvoiceInDb).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-a', orderId: 'o1', subtotal: 100, taxAmount: 21, total: 121,
      status: 'issued', items: [{ productId: 'p1', productTitle: 'Product', quantity: 2, unitPrice: 50, total: 100 }],
    }))
  })
})
