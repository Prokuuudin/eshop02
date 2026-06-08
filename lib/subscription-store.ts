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
        const nextOrderDate = calcNextOrderDate(params.interval)
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
          nextOrderDate,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ subscriptions: [sub, ...state.subscriptions] }))
        if (typeof window !== 'undefined') {
          fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sub }),
          }).catch(() => {})
        }
        return sub
      },

      pause: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id && s.status === 'active' ? { ...s, status: 'paused' } : s
          ),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'paused' }),
          }).catch(() => {})
        }
      },

      resume: (id) => {
        const nextOrderDate = calcNextOrderDate(
          get().subscriptions.find((s) => s.id === id)?.interval ?? 'monthly'
        )
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id && s.status === 'paused'
              ? { ...s, status: 'active', nextOrderDate }
              : s
          ),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active', nextOrderDate }),
          }).catch(() => {})
        }
      },

      cancel: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id ? { ...s, status: 'cancelled' } : s
          ),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }),
          }).catch(() => {})
        }
      },

      changeInterval: (id, interval) => {
        const nextOrderDate = calcNextOrderDate(interval)
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id
              ? { ...s, interval, discountPercent: SUBSCRIPTION_DISCOUNTS[interval], nextOrderDate }
              : s
          ),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interval, nextOrderDate }),
          }).catch(() => {})
        }
      },

      changeQuantity: (id, quantity) => {
        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.id === id ? { ...s, quantity } : s
          ),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity }),
          }).catch(() => {})
        }
      },

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
