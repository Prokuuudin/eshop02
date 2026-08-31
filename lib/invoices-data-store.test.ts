import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { findManyMock, findUniqueMock, createMock, updateMock, queryRawMock, transactionMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(), findUniqueMock: vi.fn(), createMock: vi.fn(), updateMock: vi.fn(),
  queryRawMock: vi.fn(), transactionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  invoice: { findMany: findManyMock, findUnique: findUniqueMock, findFirst: vi.fn(), create: createMock, update: updateMock },
  $transaction: transactionMock,
} }))

import { createInvoiceInDb, getInvoicesByCompany, InvoicePaymentConflictError, recordPaymentInDb } from './invoices-data-store'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'i1', invoiceNumber: 'INV-1', companyId: 'c1', orderId: 'o1', subtotal: 100,
  taxRate: 21, taxAmount: 21, total: 121, status: 'issued', issuedDate: new Date('2026-01-01'),
  dueDate: new Date('2026-02-01'), paidDate: null, paymentRecords: [], paidAmount: 0,
  remainingAmount: 121, notes: null, items: [], ...overrides,
})

describe('invoices-data-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionMock.mockImplementation((callback) => callback({
      invoice: { findUnique: findUniqueMock, update: updateMock },
      $queryRaw: queryRawMock,
    }))
  })

  it('scopes invoice lists by company and normalizes monetary fields', async () => {
    findManyMock.mockResolvedValue([row()])
    const invoices = await getInvoicesByCompany('c1')
    expect(findManyMock).toHaveBeenCalledWith({ where: { companyId: 'c1' }, orderBy: { issuedDate: 'desc' } })
    expect(invoices[0]).toMatchObject({ total: 121, remainingAmount: 121 })
  })

  it('initializes payment state from the authoritative invoice total', async () => {
    createMock.mockImplementation(async ({ data }) => row(data))
    await createInvoiceInDb({
      id: 'i1', invoiceNumber: 'INV-1', companyId: 'c1', orderId: 'o1', subtotal: 100,
      taxRate: 21, taxAmount: 21, total: 121, status: 'issued', issuedDate: new Date(), dueDate: new Date(), items: [],
    })
    expect(createMock).toHaveBeenCalledWith({ data: expect.objectContaining({
      paymentRecords: [], paidAmount: 0, remainingAmount: 121,
    }) })
  })

  it('returns null and performs no update for a missing invoice payment', async () => {
    findUniqueMock.mockResolvedValue(null)
    expect(await recordPaymentInDb('missing', { amount: 10, method: 'bank_transfer', reference: 'r1' })).toBeNull()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('accumulates payments and marks an invoice paid at zero remaining balance', async () => {
    findUniqueMock.mockResolvedValue(row({
      paidAmount: 20, remainingAmount: 101, paymentRecords: [{ id: 'old', amount: 20 }],
    }))
    updateMock.mockImplementation(async ({ data }) => row(data))
    const invoice = await recordPaymentInDb('i1', { amount: 101, method: 'bank_transfer', reference: 'r2' })
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'i1' }, data: expect.objectContaining({
      paidAmount: 121, remainingAmount: 0, status: 'paid',
    }) })
    expect(invoice?.status).toBe('paid')
  })

  it('locks the invoice before reading and updating its balance', async () => {
    findUniqueMock.mockResolvedValue(row())
    updateMock.mockImplementation(async ({ data }) => row(data))
    await recordPaymentInDb('i1', { amount: 10, method: 'bank_transfer', reference: 'r3' })
    expect(transactionMock).toHaveBeenCalledOnce()
    expect(queryRawMock).toHaveBeenCalledOnce()
    expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(findUniqueMock.mock.invocationCallOrder[0])
    expect(findUniqueMock.mock.invocationCallOrder[0]).toBeLessThan(updateMock.mock.invocationCallOrder[0])
  })

  it('rejects a payment when a concurrent payment already consumed the balance', async () => {
    findUniqueMock.mockResolvedValue(row({ paidAmount: 111, remainingAmount: 10 }))
    await expect(recordPaymentInDb('i1', {
      amount: 11, method: 'bank_transfer', reference: 'stale-request',
    })).rejects.toEqual(new InvoicePaymentConflictError('payment_exceeds_remaining'))
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('rejects a repeated payment after the invoice became paid', async () => {
    findUniqueMock.mockResolvedValue(row({ status: 'paid', paidAmount: 121, remainingAmount: 0 }))
    await expect(recordPaymentInDb('i1', {
      amount: 1, method: 'bank_transfer', reference: 'duplicate',
    })).rejects.toEqual(new InvoicePaymentConflictError('invoice_not_payable'))
    expect(updateMock).not.toHaveBeenCalled()
  })
})
