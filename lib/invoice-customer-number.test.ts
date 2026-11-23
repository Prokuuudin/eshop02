import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    company: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getInvoiceCustomerNumbers } from './invoice-customer-number'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.user.findMany).mockResolvedValue([])
  vi.mocked(prisma.company.findMany).mockResolvedValue([])
})

describe('getInvoiceCustomerNumbers', () => {
  it('uses the order owner card for an individual payer', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1', cardNumber: 'U-100' }] as never)

    await expect(getInvoiceCustomerNumbers([
      { id: 'order-1', userId: 'user-1', companyId: 'company-1', legalDetails: { customerType: 'individual' } },
    ])).resolves.toEqual({ 'order-1': 'U-100' })
    expect(prisma.company.findMany).not.toHaveBeenCalled()
  })

  it('uses the company card for a company payer', async () => {
    vi.mocked(prisma.company.findMany).mockResolvedValue([{ id: 'company-1', cardNumber: 'C-200' }] as never)

    await expect(getInvoiceCustomerNumbers([
      { id: 'order-2', userId: 'user-1', companyId: 'company-1', legalDetails: { customerType: 'company' } },
    ])).resolves.toEqual({ 'order-2': 'C-200' })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('omits orders whose payer has no card number', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1', cardNumber: null }] as never)

    await expect(getInvoiceCustomerNumbers([
      { id: 'order-3', userId: 'user-1' },
      { id: 'guest-order' },
    ])).resolves.toEqual({})
  })
})
