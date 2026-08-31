import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/invoices-data-store', () => {
  class InvoicePaymentConflictError extends Error {
    constructor(public readonly code: 'invoice_not_payable' | 'payment_exceeds_remaining') {
      super(code)
    }
  }
  return { getInvoiceById: vi.fn(), recordPaymentInDb: vi.fn(), InvoicePaymentConflictError }
})

import { getServerUser } from '@/lib/server-auth'
import { getInvoiceById, InvoicePaymentConflictError, recordPaymentInDb } from '@/lib/invoices-data-store'
import { POST } from './route'

const context = { params: Promise.resolve({ id: 'inv-1' }) }
const request = (amount: unknown) => new NextRequest('https://shop.test/api/invoices/inv-1/payment', {
  method: 'POST',
  body: JSON.stringify({ amount, method: 'bank_transfer' }),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin', platformRole: 'admin' } as never)
  vi.mocked(getInvoiceById).mockResolvedValue({ id: 'inv-1', remainingAmount: 50 } as never)
})

describe('POST /api/invoices/:id/payment', () => {
  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid amount %s', async (amount) => {
    const response = await POST(request(amount), context)
    expect(response.status).toBe(400)
    expect(recordPaymentInDb).not.toHaveBeenCalled()
  })

  it('rejects an overpayment', async () => {
    const response = await POST(request(50.01), context)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'amount_exceeds_remaining' })
    expect(recordPaymentInDb).not.toHaveBeenCalled()
  })

  it('does not let a buyer self-attest payment', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'buyer', platformRole: 'customer' } as never)
    const response = await POST(request(10), context)
    expect(response.status).toBe(403)
    expect(getInvoiceById).not.toHaveBeenCalled()
  })

  it('returns a conflict for a duplicate request after the invoice became paid', async () => {
    vi.mocked(recordPaymentInDb).mockRejectedValue(new InvoicePaymentConflictError('invoice_not_payable'))
    const response = await POST(request(10), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'invoice_not_payable' })
  })
})
