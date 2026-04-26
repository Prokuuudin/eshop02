import { promises as fs } from 'node:fs'
import path from 'node:path'

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

const STORE_FILE_PATH = path.join(process.cwd(), 'data', 'stripe-payments.json')

const readStore = async (): Promise<StripePaymentStore> => {
  try {
    const raw = await fs.readFile(STORE_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as StripePaymentStore
    return {
      orders: parsed?.orders ?? {},
      processedEventIds: Array.isArray(parsed?.processedEventIds) ? parsed.processedEventIds : []
    }
  } catch {
    return {
      orders: {},
      processedEventIds: []
    }
  }
}

const writeStore = async (store: StripePaymentStore): Promise<void> => {
  await fs.writeFile(STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8')
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
    updatedAt: new Date().toISOString()
  }

  store.orders[input.orderId] = {
    ...store.orders[input.orderId],
    ...nextRecord
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
