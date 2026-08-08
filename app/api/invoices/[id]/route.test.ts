import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/invoices-data-store', () => ({
  getInvoiceById: vi.fn(),
  updateInvoiceInDb: vi.fn(),
}))

import { getServerUser } from '@/lib/server-auth'
import { getInvoiceById, updateInvoiceInDb } from '@/lib/invoices-data-store'
import { GET, PATCH } from './route'

const context = { params: Promise.resolve({ id: 'inv-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getInvoiceById).mockResolvedValue({ id: 'inv-1', companyId: 'company-a' } as never)
})

describe('/api/invoices/:id authorization', () => {
  it('rejects cross-company invoice reads', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ platformRole: 'customer', companyId: 'company-b' } as never)
    const response = await GET(new NextRequest('https://shop.test/api/invoices/inv-1'), context)
    expect(response.status).toBe(403)
  })

  it('drops buyer attempts to change status or monetary fields', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ platformRole: 'customer', companyId: 'company-a' } as never)
    vi.mocked(updateInvoiceInDb).mockResolvedValue({ id: 'inv-1' } as never)
    const response = await PATCH(new NextRequest('https://shop.test/api/invoices/inv-1', {
      method: 'PATCH',
      body: JSON.stringify({ notes: 'ok', status: 'paid', total: 0.01, companyId: 'company-b' }),
    }), context)

    expect(response.status).toBe(200)
    expect(updateInvoiceInDb).toHaveBeenCalledWith('inv-1', { notes: 'ok' })
  })

  it('rejects an invalid status even from an admin', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ platformRole: 'admin' } as never)
    const response = await PATCH(new NextRequest('https://shop.test/api/invoices/inv-1', {
      method: 'PATCH', body: JSON.stringify({ status: 'forged' }),
    }), context)
    expect(response.status).toBe(400)
    expect(updateInvoiceInDb).not.toHaveBeenCalled()
  })
})
