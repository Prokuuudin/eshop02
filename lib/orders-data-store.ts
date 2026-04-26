import { promises as fs } from 'node:fs'
import path from 'node:path'

export type ServerPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed'

type ServerOrderItem = {
  id: string
  title: string
  brand: string
  image: string
  category: string
  price: number
  rating: number
  stock: number
  quantity: number
}

export type ServerOrder = {
  id: string
  createdAt: string
  items: ServerOrderItem[]
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: string
  paymentMethod: string
  promoCode?: string
  discount: number
  total: number
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode?: string
  paymentStatus?: ServerPaymentStatus
  paymentProvider?: 'stripe' | 'manual'
  paymentSessionId?: string
}

const ORDERS_FILE_PATH = path.join(process.cwd(), 'data', 'orders.json')

const readOrdersFile = async (): Promise<ServerOrder[]> => {
  try {
    const raw = await fs.readFile(ORDERS_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as ServerOrder[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeOrdersFile = async (orders: ServerOrder[]): Promise<void> => {
  await fs.writeFile(ORDERS_FILE_PATH, JSON.stringify(orders, null, 2), 'utf-8')
}

export const createOrUpdateServerOrder = async (order: ServerOrder): Promise<ServerOrder> => {
  const orders = await readOrdersFile()
  const index = orders.findIndex((item) => item.id === order.id)

  if (index >= 0) {
    orders[index] = {
      ...orders[index],
      ...order
    }
  } else {
    orders.unshift(order)
  }

  await writeOrdersFile(orders)
  return order
}

export const getServerOrderById = async (orderId: string): Promise<ServerOrder | null> => {
  const orders = await readOrdersFile()
  return orders.find((item) => item.id === orderId) ?? null
}

export const updateServerOrderPayment = async (
  orderId: string,
  updates: Partial<Pick<ServerOrder, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>
): Promise<ServerOrder | null> => {
  const orders = await readOrdersFile()
  const index = orders.findIndex((item) => item.id === orderId)

  if (index < 0) return null

  const nextOrder = {
    ...orders[index],
    ...updates
  }

  orders[index] = nextOrder
  await writeOrdersFile(orders)

  return nextOrder
}
