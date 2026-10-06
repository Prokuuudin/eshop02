import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Approved release semantics (2026-10-20): a verified Paysera payment that arrives after
// the reservation was released is still recorded as paid. Stock is re-held when possible;
// otherwise a late_payment_stock_unavailable exception and an alert are raised and nothing
// moves the order towards shipment automatically.

const baseOrder = {
  id: 'o-late',
  createdAt: new Date('2026-10-12T10:00:00Z'),
  items: [{ id: 'p1', title: 'P1', brand: 'B', image: '', category: 'hair', price: 10, rating: 0, stock: 1, quantity: 1 }],
  legalDetails: null,
  subtotal: 10, tax: 0, delivery: 0, deliveryLocation: null, deliveryMethod: 'pickup', pickupStoreId: null,
  paymentMethod: 'paysera', promoCode: null, discount: 0, total: 10,
  firstName: 'Late', lastName: 'Payment', email: 'late@example.invalid', phone: '0', address: 'A', city: 'Riga',
  trackingNumber: null, trackingUrl: null, labelUrl: null, shipmentCarrier: null, country: 'LV', postalCode: null,
  bonusSpent: null, bonusEarned: null, paymentStatus: 'pending', paymentProvider: 'paysera', paymentSessionId: 's1',
  stockReservationStatus: 'released', stockReservedUntil: null as Date | null, stockReleasedAt: new Date('2026-10-12T10:30:00Z') as Date | null,
  language: 'lv', userId: null, companyId: null, checkoutKey: null,
}
let order: typeof baseOrder

const tx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(0),
  order: {
    findUnique: vi.fn(async () => order),
    updateMany: vi.fn(async ({ where, data }: { where: { stockReservationStatus?: string }; data: Record<string, unknown> }) => {
      if (where.stockReservationStatus !== order.stockReservationStatus) return { count: 0 }
      Object.assign(order, data)
      return { count: 1 }
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
      Object.assign(order, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))),
  },
  product: {
    findMany: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  stockAllocation: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  orderOperationalException: { upsert: vi.fn().mockResolvedValue({ id: 'exception-1' }) },
  orderStatusRecord: { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
}))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { logOperationalEvent } from '@/lib/observability'
import { updateServerOrderPayment } from './orders-data-store'

const evidence = { sessionId: 's1', amount: 1000, amountPaid: 1000, currency: 'EUR' }
const latePaid = (proof: Partial<typeof evidence> = {}) =>
  updateServerOrderPayment('o-late', { paymentStatus: 'paid', paymentProvider: 'paysera' }, { ...evidence, ...proof })
const PAYMENT_FIELDS = ['paymentStatus', 'paymentProvider', 'paymentSessionId']

function expectNoAutomaticShipment() {
  expect(tx.orderStatusRecord.create).not.toHaveBeenCalled()
  expect(tx.orderStatusRecord.upsert).not.toHaveBeenCalled()
  expect(tx.orderStatusRecord.update).not.toHaveBeenCalled()
  expect(tx.orderStatusRecord.updateMany).not.toHaveBeenCalled()
  for (const [call] of tx.order.update.mock.calls) {
    expect(Object.keys(call.data).every(key => PAYMENT_FIELDS.includes(key))).toBe(true)
  }
  expect(order.trackingNumber).toBeNull()
  expect(order.shipmentCarrier).toBeNull()
}

describe.each([
  ['ON', 'true'],
  ['OFF', 'false'],
])('late payment after reservation release (Stock Ledger %s)', (mode, flag) => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GRINS_STOCK_LEDGER_ENABLED', flag)
    order = structuredClone(baseOrder)
    tx.product.findMany.mockResolvedValue([{ id: 'p1', stock: 0, externalId: 'S1', grinsStock: 0 }])
  })
  afterEach(() => vi.unstubAllEnvs())

  it('persists paid without stock, raises one exception and alert, and stays idempotent on redelivery', async () => {
    await expect(latePaid()).resolves.toMatchObject({ id: 'o-late', paymentStatus: 'paid', stockReservationStatus: 'released' })

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
    expectNoAutomaticShipment()

    // Duplicate webhook: no new hold attempt, exception or alert.
    await expect(latePaid()).resolves.toMatchObject({ paymentStatus: 'paid' })
    expect(tx.product.findMany).toHaveBeenCalledOnce()
    expect(tx.orderOperationalException.upsert).toHaveBeenCalledOnce()
    expect(logOperationalEvent).toHaveBeenCalledOnce()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
    expectNoAutomaticShipment()
  })

  it('re-holds and commits stock when it is still available, without an exception', async () => {
    tx.product.findMany.mockResolvedValue([{ id: 'p1', stock: 5, externalId: 'S1', grinsStock: 5 }])

    await expect(latePaid()).resolves.toMatchObject({ paymentStatus: 'paid', stockReservationStatus: 'committed' })

    expect(order.stockReleasedAt).toBeNull()
    expect(tx.product.updateMany).toHaveBeenCalledOnce()
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { decrement: 1 } } }))
    if (mode === 'ON') {
      expect(tx.stockAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-late', productId: 'p1', quantity: 1, status: 'committed' }) })
    } else {
      expect(tx.stockAllocation.create).not.toHaveBeenCalled()
    }
    expect(tx.orderOperationalException.upsert).not.toHaveBeenCalled()
    expect(logOperationalEvent).not.toHaveBeenCalled()
    expectNoAutomaticShipment()

    await latePaid()
    expect(tx.product.updateMany).toHaveBeenCalledOnce()
  })

  it.each([
    ['foreign session', { sessionId: 's-other' }, 'invalid_payment_session'],
    ['missing session', { sessionId: '' }, 'invalid_payment_session'],
    ['wrong amount', { amount: 999, amountPaid: 999 }, 'invalid_payment_amount'],
    ['partial amount', { amountPaid: 500 }, 'invalid_payment_amount'],
    ['wrong currency', { currency: 'USD' }, 'invalid_payment_amount'],
  ])('rejects a late callback with %s before touching stock or status', async (_name, proof, error) => {
    await expect(latePaid(proof)).rejects.toThrow(error)
    expect(order.paymentStatus).toBe('pending')
    expect(tx.product.findMany).not.toHaveBeenCalled()
    expect(tx.order.update).not.toHaveBeenCalled()
    expect(tx.orderOperationalException.upsert).not.toHaveBeenCalled()
  })

  it('keeps a late-paid order paid when a delayed cancellation arrives', async () => {
    await latePaid()
    await expect(updateServerOrderPayment('o-late', { paymentStatus: 'failed', paymentProvider: 'paysera' }, { sessionId: 's1' }))
      .resolves.toMatchObject({ paymentStatus: 'paid' })
    expect(order.paymentStatus).toBe('paid')
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
})
