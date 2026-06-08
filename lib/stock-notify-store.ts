import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useNotificationsStore } from '@/lib/notifications-store'

export interface StockNotifySubscription {
  id: string
  productId: string
  productTitle: string
  email: string
  userId?: string
  createdAt: string
  notified: boolean
  notifiedAt?: string
}

interface StockNotifyStore {
  subscriptions: StockNotifySubscription[]
  subscribe: (productId: string, productTitle: string, email: string, userId?: string) => 'subscribed' | 'already'
  unsubscribe: (id: string) => void
  isSubscribed: (productId: string, email: string) => boolean
  getByProduct: (productId: string) => StockNotifySubscription[]
  notifyProduct: (productId: string, productTitle: string) => void
}

export const useStockNotifyStore = create<StockNotifyStore>()(
  persist(
    (set, get) => ({
      subscriptions: [],

      subscribe: (productId, productTitle, email, userId) => {
        if (get().isSubscribed(productId, email)) return 'already'
        const id = `sn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        set((state) => ({
          subscriptions: [
            ...state.subscriptions,
            { id, productId, productTitle, email, userId, createdAt: new Date().toISOString(), notified: false },
          ],
        }))
        if (typeof window !== 'undefined') {
          fetch('/api/stock-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, productTitle, email }),
          }).catch(() => {})
        }
        return 'subscribed'
      },

      unsubscribe: (id) => {
        set((state) => ({
          subscriptions: state.subscriptions.filter((s) => s.id !== id),
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/stock-notify/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
        }
      },

      isSubscribed: (productId, email) =>
        get().subscriptions.some(
          (s) => s.productId === productId && s.email === email && !s.notified
        ),

      getByProduct: (productId) =>
        get().subscriptions.filter((s) => s.productId === productId && !s.notified),

      notifyProduct: (productId, productTitle) => {
        const pending = get().getByProduct(productId)
        if (pending.length === 0) return

        const { addNotification } = useNotificationsStore.getState()
        const now = new Date().toISOString()

        pending.forEach((sub) => {
          if (sub.userId) {
            addNotification({
              type: 'success',
              title: 'Товар снова в наличии',
              message: `«${productTitle}» теперь доступен для заказа.`,
              link: `/product/${productId}`,
            })
          }
        })

        set((state) => ({
          subscriptions: state.subscriptions.map((s) =>
            s.productId === productId && !s.notified
              ? { ...s, notified: true, notifiedAt: now }
              : s
          ),
        }))
      },
    }),
    { name: 'eshop-stock-notify' }
  )
)
