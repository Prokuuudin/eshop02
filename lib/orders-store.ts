import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartItem } from './cart-store'

export type DeliveryMethod = 'courier' | 'pickup' | 'post'
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed'

export interface Order {
  id: string
  createdAt: Date
  items: CartItem[]
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: DeliveryMethod
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
  bonusSpent?: number
  bonusEarned?: number
  paymentStatus?: PaymentStatus
  paymentProvider?: 'stripe' | 'manual'
  paymentSessionId?: string
}

type OrdersStore = {
  orders: Order[]
  addOrder: (order: Order) => void
  upsertOrder: (order: Order) => void
  getOrder: (id: string) => Order | undefined
  updateOrderPayment: (id: string, updates: Partial<Pick<Order, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>) => void
}

export const useOrders = create<OrdersStore>()(
  persist(
    (set, get) => ({
      orders: [],
      addOrder: (order: Order) => {
        set((state) => ({
          orders: [order, ...state.orders]
        }))
      },
      upsertOrder: (order: Order) => {
        set((state) => {
          const existingIndex = state.orders.findIndex((item) => item.id === order.id)
          if (existingIndex === -1) {
            return {
              orders: [order, ...state.orders]
            }
          }

          const nextOrders = [...state.orders]
          nextOrders[existingIndex] = {
            ...nextOrders[existingIndex],
            ...order
          }

          return {
            orders: nextOrders
          }
        })
      },
      getOrder: (id: string) => {
        return get().orders.find((order) => order.id === id)
      },
      updateOrderPayment: (id, updates) => {
        set((state) => ({
          orders: state.orders.map((order) => (order.id === id ? { ...order, ...updates } : order))
        }))
      }
    }),
    {
      name: 'orders-store'
    }
  )
)
