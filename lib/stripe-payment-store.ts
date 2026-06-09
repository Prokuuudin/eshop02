import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

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

const readStore = async (): Promise<StripePaymentStore> => {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { orders: {}, processedEventIds: [] }
  const parsed = row.value as StripePaymentStore
  return {
    orders: parsed?.orders ?? {},
    processedEventIds: Array.isArray(parsed?.processedEventIds) ? parsed.processedEventIds : [],
  }
}

const writeStore = async (store: StripePaymentStore): Promise<void> => {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: store as unknown as Prisma.InputJsonValue },
    update: { value: store as unknown as Prisma.InputJsonValue },
  })
}

export const getOrderPaymentStatus = async (orderId: string): Promise<StripeOrderPayment | null> => {
  const store = await readStore()
  return store.orders[orderId] ?? null
}

export const saveOrderPaymentStatus = async (input: {
  orderId: string
  paymentStatus: StripePaymentStatus
  sessionId?: string
  paymentIntentId?: string
  customerEmail?: string
  eventId?: string
}): Promise<StripeOrderPayment> => {
  const store = await readStore()

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

  await writeStore(store)
  return store.orders[input.orderId]
}

export const isStripeEventProcessed = async (eventId: string): Promise<boolean> => {
  const store = await readStore()
  return store.processedEventIds.includes(eventId)
}
