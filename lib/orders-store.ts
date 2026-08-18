import { create } from 'zustand'
import { CartItem } from './cart-store'

export type DeliveryMethod = 'courier' | 'pickup' | 'post'
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed'

export type OrderLegalDetails =
  | { customerType: 'individual'; personalCode: string }
  | {
      customerType: 'company'
      companyName: string
      regNumber: string
      vatNumber?: string
      legalAddress: string
      bankName: string
      iban: string
    }

export interface Order {
  id: string
  createdAt: Date
  items: CartItem[]
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: DeliveryMethod
  /** Магазин самовывоза (id из data/stores.ts); только при deliveryMethod='pickup'. */
  pickupStoreId?: string
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
  language?: string
  /** Владелец заказа на момент оформления; см. /api/orders/my (userId OR email). */
  userId?: string
  /** Физ./юр. лицо, выбранное на чекауте; см. app/[lang]/checkout/CheckoutFormSections.tsx. */
  legalDetails?: OrderLegalDetails
}

/**
 * Hydration status of the FULL admin order table in this store (see
 * `useAdminOrdersSync` in lib/use-admin-orders-sync.ts). Only meaningful for the
 * admin "load everything" flow — the public/single-order flows (checkout,
 * order confirmation, account page) ignore this field entirely.
 */
export type OrdersHydrationStatus = 'idle' | 'loading' | 'loaded' | 'error'

type OrdersStore = {
  orders: Order[]
  hydrationStatus: OrdersHydrationStatus
  setHydrationStatus: (status: OrdersHydrationStatus) => void
  replaceOrders: (orders: Order[]) => void
  clearOrders: () => void
  addOrder: (order: Order) => void
  upsertOrder: (order: Order) => void
  getOrder: (id: string) => Order | undefined
  updateOrderPayment: (id: string, updates: Partial<Pick<Order, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>) => void
}

export const useOrders = create<OrdersStore>()(
    (set, get) => ({
      orders: [],
      hydrationStatus: 'idle',
      setHydrationStatus: (status) => set({ hydrationStatus: status }),
      replaceOrders: (orders) => set({
        orders: orders.map((order) => ({ ...order, createdAt: new Date(order.createdAt) })),
      }),
      clearOrders: () => set({ orders: [] }),
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
    })
)
