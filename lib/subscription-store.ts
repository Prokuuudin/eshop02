import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubscriptionInterval = 'monthly' | 'quarterly'
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'

export const SUBSCRIPTION_DISCOUNTS: Record<SubscriptionInterval, number> = {
  monthly: 10,
  quarterly: 7,
}

export const SUBSCRIPTION_INTERVAL_MONTHS: Record<SubscriptionInterval, number> = {
  monthly: 1,
  quarterly: 3,
}

export interface ProductSubscription {
  id: string
  userId: string
  userEmail: string
  productId: string
  productTitle: string
  productImage?: string
  pricePerUnit: number
  discountPercent: number
  quantity: number
  interval: SubscriptionInterval
  status: SubscriptionStatus
  nextOrderDate: string
  lastOrderDate?: string
  remindedAt?: string
  createdAt: string
}

function calcNextOrderDate(interval: SubscriptionInterval, from = new Date()): string {
  const d = new Date(from)
  d.setMonth(d.getMonth() + SUBSCRIPTION_INTERVAL_MONTHS[interval])
  return d.toISOString()
}

interface SubscriptionStore {
  subscriptions: ProductSubscription[]
  subscribe: (params: {
    userId: string
    userEmail: string
    productId: string
    productTitle: string
    productImage?: string
    pricePerUnit: number
    quantity: number
    interval: SubscriptionInterval
  }) => ProductSubscription
  pause: (id: string) => void
  resume: (id: string) => void
  cancel: (id: string) => void
  changeInterval: (id: string, interval: SubscriptionInterval) => void
  changeQuantity: (id: string, quantity: number) => void
  getUserSubscriptions: (userId: string) => ProductSubscription[]
  getActiveForProduct: (userId: string, productId: string) => ProductSubscription | undefined
  markReminded: (id: string) => void
  processNextOrder: (id: string) => void
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
      subscriptions: [],

      subscribe: (params) => {
        const discount = SUBSCRIPTION_DISCOUNTS[params.interval]
        const sub: ProductSubscription = {
          id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          userId: params.userId,
          userEmail: params.userEmail,
          productId: params.productId,
          productTitle: params.productTitle,
          productImage: params.productImage,
          pricePerUnit: params.pricePerUnit,
          discountPercent: discount,
          quantity: params.quantity,
          interval: params.interval,
          status: 'active',
          nextOrderDate: calcNextOrderDate(params.interval),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ subscriptions: [sub, ...state.subscriptions] }))
        return sub
      },

      pause: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id && s.status === 'active' ? { ...s, status: 'paused' } : s
          ),
        })),

      resume: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id && s.status === 'paused'
              ? { ...s, status: 'active', nextOrderDate: calcNextOrderDate(s.interval) }
              : s
          ),
        })),

      cancel: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id ? { ...s, status: 'cancelled' } : s
          ),
        })),

      changeInterval: (id, interval) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  interval,
                  discountPercent: SUBSCRIPTION_DISCOUNTS[interval],
                  nextOrderDate: calcNextOrderDate(interval),
                }
              : s
          ),
        })),

      changeQuantity: (id, quantity) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id ? { ...s, quantity } : s
          ),
        })),

      getUserSubscriptions: (userId) =>
        get().subscriptions.filter((s) => s.userId === userId),

      getActiveForProduct: (userId, productId) =>
        get().subscriptions.find(
          (s) => s.userId === userId && s.productId === productId && s.status !== 'cancelled'
        ),

      markReminded: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id ? { ...s, remindedAt: new Date().toISOString() } : s
          ),
        })),

      processNextOrder: (id) =>
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id && s.status === 'active'
              ? {
                  ...s,
                  lastOrderDate: new Date().toISOString(),
                  nextOrderDate: calcNextOrderDate(s.interval),
                }
              : s
          ),
        })),
    }),
    { name: 'eshop-subscriptions' }
  )
)
