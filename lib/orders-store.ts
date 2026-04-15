import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CartItem } from './cart-store'

export type DeliveryMethod = 'courier' | 'pickup' | 'post'

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
}

type OrdersStore = {
  orders: Order[]
  addOrder: (order: Order) => void
  getOrder: (id: string) => Order | undefined
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
      getOrder: (id: string) => {
        return get().orders.find((order) => order.id === id)
      }
    }),
    {
      name: 'orders-store'
    }
  )
)
