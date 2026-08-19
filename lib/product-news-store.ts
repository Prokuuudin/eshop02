import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProductNewsSubscription {
  id: string
  productId: string
  productTitle: string
  notifyPrice: boolean
  notifyStock: boolean
  notifyPromo: boolean
  createdAt: string
}

interface ProductNewsStore {
  subscriptions: ProductNewsSubscription[]
  subscribe: (params: {
    productId: string
    productTitle: string
    notifyPrice: boolean
    notifyStock: boolean
    notifyPromo: boolean
  }) => Promise<ProductNewsSubscription | null>
  update: (id: string, flags: { notifyPrice: boolean; notifyStock: boolean; notifyPromo: boolean }) => void
  unsubscribe: (id: string) => void
  getForProduct: (productId: string) => ProductNewsSubscription | undefined
  hydrateFromServer: () => Promise<void>
}

export const useProductNewsStore = create<ProductNewsStore>()(
  persist(
    (set, get) => ({
      subscriptions: [],

      subscribe: async (params) => {
        const response = await fetch('/api/product-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        })
        if (!response.ok) return null
        const payload = await response.json() as { subscriptionId?: string }
        if (!payload.subscriptionId) return null

        const existing = get().getForProduct(params.productId)
        const sub: ProductNewsSubscription = {
          id: payload.subscriptionId,
          productId: params.productId,
          productTitle: params.productTitle,
          notifyPrice: params.notifyPrice,
          notifyStock: params.notifyStock,
          notifyPromo: params.notifyPromo,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        }
        set((state) => ({
          subscriptions: [sub, ...state.subscriptions.filter((s) => s.productId !== params.productId)],
        }))
        return sub
      },

      update: (id, flags) => {
        set((state) => ({
          subscriptions: state.subscriptions.map((s) => (s.id === id ? { ...s, ...flags } : s)),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/product-news/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(flags),
          }).catch(() => {})
        }
      },

      unsubscribe: (id) => {
        set((state) => ({ subscriptions: state.subscriptions.filter((s) => s.id !== id) }))
        if (typeof window !== 'undefined') {
          fetch(`/api/product-news/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
        }
      },

      getForProduct: (productId) => get().subscriptions.find((s) => s.productId === productId),

      hydrateFromServer: async () => {
        if (typeof window === 'undefined') return
        try {
          const response = await fetch('/api/product-news')
          if (!response.ok) return
          const payload = await response.json() as { subscriptions?: ProductNewsSubscription[] }
          if (!Array.isArray(payload.subscriptions)) return
          set({ subscriptions: payload.subscriptions })
        } catch {
          // Keep the persisted snapshot when the network is temporarily unavailable.
        }
      },
    }),
    { name: 'eshop-product-news' }
  )
)
