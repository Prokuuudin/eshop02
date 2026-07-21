import { prisma } from '@/lib/prisma'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { applyOrderReservationPaymentState } from '@/lib/orders-data-store'
import { canApplyStripePaymentTransition } from '@/lib/stripe-payment-state'

export type StripePaymentStatus = 'pending' | 'paid' | 'failed'

type StripeOrderPayment = {
  orderId: string
  paymentStatus: StripePaymentStatus
  sessionId?: string
  paymentIntentId?: string
  customerEmail?: string
  lastEventId?: string
  updatedAt: string
}

type StripePaymentStore = {
  orders: Record<string, StripeOrderPayment>
  processedEventIds: string[]
}

const KV_KEY = 'stripe-payments'
// `prisma` itself, or the `tx` handed to a `prisma.$transaction(async (tx) => ...)`
// callback — both are shapes of the extended (money-fields-converting) client, not
// the raw generated `Prisma.TransactionClient`.
type PaymentStoreClient = Pick<ExtendedPrismaClient | ExtendedTransactionClient, 'keyValueSetting'>

const readStore = async (client: PaymentStoreClient = prisma): Promise<StripePaymentStore> => {
  const row = await client.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { orders: {}, processedEventIds: [] }
  const parsed = row.value as StripePaymentStore
  return {
    orders: parsed?.orders ?? {},
    processedEventIds: Array.isArray(parsed?.processedEventIds) ? parsed.processedEventIds : [],
  }
}

const writeStore = async (store: StripePaymentStore, client: PaymentStoreClient = prisma): Promise<void> => {
  await client.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: store as unknown as Prisma.InputJsonValue },
    update: { value: store as unknown as Prisma.InputJsonValue },
  })
}

export const getOrderPaymentStatus = async (orderId: string): Promise<StripeOrderPayment | null> => {
  const store = await readStore()
  return store.orders[orderId] ?? null
}

/** Resolve only checkout sessions created and recorded by this application. */
export const getOrderPaymentBySessionId = async (sessionId: string): Promise<StripeOrderPayment | null> => {
  const store = await readStore()
  return Object.values(store.orders).find((payment) => payment.sessionId === sessionId) ?? null
}

export const saveOrderPaymentStatus = async (input: {
  orderId: string
  paymentStatus: StripePaymentStatus
  sessionId?: string
  paymentIntentId?: string
  customerEmail?: string
  eventId?: string
  /** Checkout verified that the previously bound session is no longer open. */
  replaceSession?: boolean
}): Promise<StripeOrderPayment> => prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${KV_KEY}))`
  const store = await readStore(tx)

  const current = store.orders[input.orderId]
  const canReplaceClosedSession = input.replaceSession && current?.paymentStatus !== 'paid'
  if (!canReplaceClosedSession && !canApplyStripePaymentTransition(current, input)) {
    return current
  }

  const nextRecord: StripeOrderPayment = {
    orderId: input.orderId,
    paymentStatus: input.paymentStatus,
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    customerEmail: input.customerEmail,
    lastEventId: input.eventId,
    updatedAt: new Date().toISOString(),
  }

  store.orders[input.orderId] = {
    ...store.orders[input.orderId],
    ...nextRecord,
  }

  if (input.eventId && !store.processedEventIds.includes(input.eventId)) {
    store.processedEventIds.push(input.eventId)
    if (store.processedEventIds.length > 2000) {
      store.processedEventIds = store.processedEventIds.slice(-2000)
    }
  }

  await writeStore(store, tx)
  return store.orders[input.orderId]
})

export const isStripeEventProcessed = async (eventId: string): Promise<boolean> => {
  const store = await readStore()
  return store.processedEventIds.includes(eventId)
}

/**
 * Atomically records a Stripe event and applies its canonical order payment state.
 * The transaction-scoped advisory lock serializes concurrent deliveries because the
 * legacy payment ledger is stored in a single JSON row rather than event rows.
 */
export const applyStripePaymentEvent = async (input: {
  eventId: string
  orderId: string
  paymentStatus: StripePaymentStatus
  sessionId: string
  paymentIntentId?: string
  customerEmail?: string
}): Promise<boolean> => prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${KV_KEY}))`

  const store = await readStore(tx)
  if (store.processedEventIds.includes(input.eventId)) return false

  const current = store.orders[input.orderId]
  if (!canApplyStripePaymentTransition(current, input)) {
    // Remember ignored events as well so Stripe retries remain cheap and idempotent.
    store.processedEventIds.push(input.eventId)
    if (store.processedEventIds.length > 2000) {
      store.processedEventIds = store.processedEventIds.slice(-2000)
    }
    await writeStore(store, tx)
    return false
  }

  const nextRecord: StripeOrderPayment = {
    orderId: input.orderId,
    paymentStatus: input.paymentStatus,
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    customerEmail: input.customerEmail,
    lastEventId: input.eventId,
    updatedAt: new Date().toISOString(),
  }
  store.orders[input.orderId] = { ...store.orders[input.orderId], ...nextRecord }
  store.processedEventIds.push(input.eventId)
  if (store.processedEventIds.length > 2000) {
    store.processedEventIds = store.processedEventIds.slice(-2000)
  }

  await writeStore(store, tx)
  await applyOrderReservationPaymentState(tx, input.orderId, input.paymentStatus)
  await tx.order.updateMany({
    where: input.paymentStatus === 'paid'
      ? { id: input.orderId }
      : { id: input.orderId, paymentStatus: { not: 'paid' } },
    data: {
      paymentStatus: input.paymentStatus,
      paymentProvider: 'stripe',
      paymentSessionId: input.sessionId,
    },
  })
  return true
})
