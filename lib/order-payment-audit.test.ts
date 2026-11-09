import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.audit }))

import { updateServerOrderPayment } from './orders-data-store'

const actor = { id: 'admin-1', email: 'admin@hairshop.test', name: 'Administrator' } as never
const request = new NextRequest('https://shop.test/api/orders/1001', { method: 'PATCH' })

function orderRow() {
  return {
    id: '1001', createdAt: new Date('2026-11-09T10:00:00Z'), items: [], legalDetails: null,
    subtotal: 25, tax: 4.34, delivery: 0, deliveryLocation: null, deliveryMethod: 'pickup',
    pickupStoreId: 'riga-office', paymentMethod: 'bank_transfer', promoCode: null, discount: 0,
    total: 25, firstName: 'Anna', lastName: 'Bērziņa', email: 'anna@example.test', phone: '+37120000000',
    customerComment: null, address: 'Rīga', city: 'Rīga', country: 'LV', postalCode: null,
    trackingNumber: null, trackingUrl: null, labelUrl: null, shipmentCarrier: null,
    bonusSpent: null, bonusEarned: null, paymentStatus: 'unpaid', paymentProvider: null,
    paymentSessionId: null, stockReservationStatus: 'committed', stockReservedUntil: null,
    stockReleasedAt: null, language: 'lv', userId: 'user-1', companyId: null, checkoutKey: null,
  }
}

describe('manual order payment persistent audit', () => {
  let committed: ReturnType<typeof orderRow>

  beforeEach(() => {
    vi.clearAllMocks()
    committed = orderRow()
    mocks.transaction.mockImplementation(async (run: (tx: never) => Promise<unknown>) => {
      let staged = structuredClone(committed)
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn(async () => staged),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
            staged = { ...staged, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }
            return staged
          }),
        },
      }
      const result = await run(tx as never)
      committed = staged
      return result
    })
  })

  it('records the order id and payment status/provider transition in the same transaction', async () => {
    const result = await updateServerOrderPayment(
      '1001',
      { paymentStatus: 'paid', paymentProvider: 'manual' },
      undefined,
      { actor, request },
    )

    expect(result).toMatchObject({ id: '1001', paymentStatus: 'paid', paymentProvider: 'manual' })
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), request, actor, {
      action: 'order.payment_status_updated',
      entityType: 'order',
      entityId: '1001',
      before: { paymentStatus: 'unpaid', paymentProvider: null },
      after: { paymentStatus: 'paid', paymentProvider: 'manual' },
    })
  })

  it('does not duplicate the event on a repeated paid request', async () => {
    await updateServerOrderPayment('1001', { paymentStatus: 'paid', paymentProvider: 'manual' }, undefined, { actor, request })
    await updateServerOrderPayment('1001', { paymentStatus: 'paid', paymentProvider: 'manual' }, undefined, { actor, request })

    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })

  it('rolls back the payment change when the audit append fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(updateServerOrderPayment(
      '1001',
      { paymentStatus: 'paid', paymentProvider: 'manual' },
      undefined,
      { actor, request },
    )).rejects.toThrow('audit unavailable')
    expect(committed).toMatchObject({ paymentStatus: 'unpaid', paymentProvider: null })
  })

  it('keeps automatic payment processing unchanged and free of administrator audit context', async () => {
    await updateServerOrderPayment('1001', { paymentStatus: 'paid', paymentProvider: 'paypal' })

    expect(committed).toMatchObject({ paymentStatus: 'paid', paymentProvider: 'paypal' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
