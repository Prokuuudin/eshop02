import { beforeEach, describe, expect, it, vi } from 'vitest'

type Ledger = {
  orders: Record<string, Record<string, unknown>>
  processedEventIds: string[]
}

let ledger: Ledger
let transactionTail: Promise<unknown>
const orderUpdate = vi.fn()

const prismaMock = vi.hoisted(() => ({
  keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { applyStripePaymentEvent } from '@/lib/stripe-payment-store'

function makeTransactionClient(draft: Ledger) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    keyValueSetting: {
      findUnique: vi.fn(async () => ({ key: 'stripe-payments', value: structuredClone(draft) })),
      upsert: vi.fn(async ({ create, update }: { create: { value: Ledger }; update: { value: Ledger } }) => {
        const value = draft.processedEventIds.length === 0 ? create.value : update.value
        draft.orders = structuredClone(value.orders)
        draft.processedEventIds = [...value.processedEventIds]
        return { key: 'stripe-payments', value }
      }),
    },
    order: { updateMany: orderUpdate },
  }
}

beforeEach(() => {
  ledger = { orders: {}, processedEventIds: [] }
  transactionTail = Promise.resolve()
  vi.clearAllMocks()
  orderUpdate.mockResolvedValue({ count: 1 })
  prismaMock.$transaction.mockImplementation((operation: (tx: ReturnType<typeof makeTransactionClient>) => unknown) => {
    const current = transactionTail.then(async () => {
      const draft = structuredClone(ledger)
      const result = await operation(makeTransactionClient(draft))
      ledger = draft
      return result
    })
    transactionTail = current.catch(() => undefined)
    return current
  })
})

describe('Stripe webhook idempotency transaction', () => {
  it('serializes concurrent deliveries and applies the event exactly once', async () => {
    const event = {
      eventId: 'evt_same',
      orderId: '1001',
      paymentStatus: 'paid' as const,
      sessionId: 'cs_1001',
      paymentIntentId: 'pi_1001',
    }

    const results = await Promise.all([
      applyStripePaymentEvent(event),
      applyStripePaymentEvent(event),
    ])

    expect(results).toEqual([true, false])
    expect(orderUpdate).toHaveBeenCalledTimes(1)
    expect(ledger.processedEventIds).toEqual(['evt_same'])
    expect(ledger.orders['1001']).toMatchObject({
      paymentStatus: 'paid',
      sessionId: 'cs_1001',
      lastEventId: 'evt_same',
    })
  })
})
