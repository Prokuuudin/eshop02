import { beforeEach, describe, expect, it, vi } from 'vitest'

const order = {
  id: 'o-late',
  createdAt: new Date('2026-10-12T10:00:00Z'),
  items: [{ id: 'p1', title: 'P1', brand: 'B', image: '', category: 'hair', price: 10, rating: 0, stock: 1, quantity: 1 }],
  legalDetails: null,
  subtotal: 10, tax: 0, delivery: 0, deliveryLocation: null, deliveryMethod: 'pickup', pickupStoreId: null,
  paymentMethod: 'paysera', promoCode: null, discount: 0, total: 10,
  firstName: 'Late', lastName: 'Payment', email: 'late@example.invalid', phone: '0', address: 'A', city: 'Riga',
  trackingNumber: null, trackingUrl: null, labelUrl: null, shipmentCarrier: null, country: 'LV', postalCode: null,
  bonusSpent: null, bonusEarned: null, paymentStatus: 'pending', paymentProvider: 'paysera', paymentSessionId: 's1',
  stockReservationStatus: 'released', stockReservedUntil: null, stockReleasedAt: new Date('2026-10-12T10:30:00Z'),
  language: 'lv', userId: null, companyId: null, checkoutKey: null,
}

const tx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  order: {
    findUnique: vi.fn(async () => order),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(order, data)),
  },
  product: {
    findMany: vi.fn().mockResolvedValue([{ id: 'p1', stock: 0, externalId: 'S1', grinsStock: 0 }]),
    updateMany: vi.fn(),
  },
  stockAllocation: { create: vi.fn() },
  orderOperationalException: { upsert: vi.fn().mockResolvedValue({ id: 'exception-1' }) },
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
}))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { logOperationalEvent } from '@/lib/observability'
import { updateServerOrderPayment } from './orders-data-store'

describe('late payment after reservation release', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.paymentStatus = 'pending'
    order.stockReservationStatus = 'released'
    tx.order.updateMany.mockResolvedValue({ count: 0 })
    tx.product.findMany.mockResolvedValue([{ id: 'p1', stock: 0, externalId: 'S1', grinsStock: 0 }])
  })

  it('persists paid, leaves stock untouched, records one admin-visible exception, and is idempotent', async () => {
    await expect(updateServerOrderPayment('o-late', { paymentStatus: 'paid', paymentProvider: 'paysera' }))
      .resolves.toMatchObject({ id: 'o-late', paymentStatus: 'paid', stockReservationStatus: 'released' })

    expect(order.paymentStatus).toBe('paid')
    expect(order.stockReservationStatus).toBe('released')
    expect(tx.product.updateMany).not.toHaveBeenCalled()
    expect(tx.stockAllocation.create).not.toHaveBeenCalled()
    expect(tx.orderOperationalException.upsert).toHaveBeenCalledOnce()
    expect(tx.orderOperationalException.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ code: 'late_payment_stock_unavailable', productIds: ['p1'] }),
    }))
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'late_payment_stock_unavailable', alert: true, orderId: 'o-late',
    }))

    await expect(updateServerOrderPayment('o-late', { paymentStatus: 'paid', paymentProvider: 'paysera' }))
      .resolves.toMatchObject({ paymentStatus: 'paid' })
    expect(tx.orderOperationalException.upsert).toHaveBeenCalledOnce()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
})
