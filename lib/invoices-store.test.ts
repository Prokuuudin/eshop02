import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hydrateInvoicesFromServer, useInvoicesStore } from './invoices-store'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  useInvoicesStore.setState({ invoices: new Map(), invoiceNumberCounter: 1000 })
})

describe('hydrateInvoicesFromServer', () => {
  it('replaces this company\'s invoices in the store with what the server returns', async () => {
    const serverInvoice = {
      id: 'inv_1',
      invoiceNumber: 'INV-2026-000001',
      companyId: 'company_1',
      orderId: 'order_1',
      subtotal: 100,
      taxRate: 21,
      taxAmount: 21,
      total: 121,
      status: 'issued',
      issuedDate: '2026-01-01T00:00:00.000Z',
      dueDate: '2026-02-01T00:00:00.000Z',
      paymentRecords: [],
      paidAmount: 0,
      remainingAmount: 121,
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ invoices: [serverInvoice] }),
    } as Response)

    await hydrateInvoicesFromServer('company_1')

    expect(fetch).toHaveBeenCalledWith('/api/invoices?companyId=company_1')
    const stored = useInvoicesStore.getState().getInvoicesByCompany('company_1')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('inv_1')
    expect(stored[0].issuedDate).toBeInstanceOf(Date)
  })

  it('does not touch invoices belonging to a different company', async () => {
    useInvoicesStore.setState({
      invoices: new Map([['inv_other', {
        id: 'inv_other', invoiceNumber: 'INV-1', companyId: 'company_2', orderId: 'o',
        subtotal: 1, taxRate: 0, taxAmount: 0, total: 1, status: 'issued',
        issuedDate: new Date(), dueDate: new Date(), paymentRecords: [], paidAmount: 0, remainingAmount: 1,
      }]]),
      invoiceNumberCounter: 1000,
    })
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ invoices: [] }) } as Response)

    await hydrateInvoicesFromServer('company_1')

    expect(useInvoicesStore.getState().getInvoicesByCompany('company_2')).toHaveLength(1)
  })

  it('leaves the store untouched when the request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await hydrateInvoicesFromServer('company_1')

    expect(useInvoicesStore.getState().getInvoicesByCompany('company_1')).toHaveLength(0)
  })
})
