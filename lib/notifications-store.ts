import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationType = 'info' | 'success' | 'warning' | 'promo'
export type NotificationChannel = 'app' | 'email' | 'both'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string // ISO string for serialization
  isRead: boolean
  link?: string
}

interface NotificationsStore {
  notifications: Notification[]
  notificationOwnerId?: string | null
  isSubscribed: boolean
  channel: NotificationChannel
  setChannel: (channel: NotificationChannel) => Promise<void>
  fetchChannel: () => Promise<void>
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  markRead: (id: string) => void
  markAllRead: () => void
  deleteNotification: (id: string) => void
  deleteSelected: (ids: string[]) => void
  deleteAll: () => void
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void
  fetchInbox: () => Promise<void>
  syncNotificationScope: (userId: string | null) => void
  unreadCount: () => number
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      notificationOwnerId: undefined,
      isSubscribed: false,
      channel: 'app',

      setChannel: async (channel) => {
        const previous = get().channel
        set({ channel })
        if (typeof window === 'undefined') return
        try {
          const res = await fetch('/api/notifications/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          })
          if (!res.ok) set({ channel: previous })
        } catch {
          set({ channel: previous })
        }
      },
      fetchChannel: async () => {
        if (typeof window === 'undefined') return
        try {
          const res = await fetch('/api/notifications/preferences')
          if (!res.ok) return
          const data = await res.json() as { channel?: NotificationChannel; subscribed?: boolean }
          if (data.channel && ['app', 'email', 'both'].includes(data.channel)) {
            set({ channel: data.channel })
          }
          if (typeof data.subscribed === 'boolean') set({ isSubscribed: data.subscribed })
        } catch {}
      },
      subscribe: async () => {
        const previous = get().isSubscribed
        set({ isSubscribed: true })
        try {
          const res = await fetch('/api/notifications/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribed: true }) })
          if (!res.ok) set({ isSubscribed: previous })
        } catch { set({ isSubscribed: previous }) }
      },
      unsubscribe: async () => {
        const previous = get().isSubscribed
        set({ isSubscribed: false })
        try {
          const res = await fetch('/api/notifications/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribed: false }) })
          if (!res.ok) set({ isSubscribed: previous })
        } catch { set({ isSubscribed: previous }) }
      },

      markRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        })),

      markAllRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        })),

      deleteNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      deleteSelected: (ids) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => !ids.includes(n.id)),
        })),

      deleteAll: () => set({ notifications: [] }),

      syncNotificationScope: (userId) => set((state) => {
        // Adopt legacy notifications once. From then on, never expose one
        // account's locally persisted inbox to another account in this browser.
        if (state.notificationOwnerId === undefined) return { notificationOwnerId: userId }
        if (state.notificationOwnerId === userId) return state
        return { notificationOwnerId: userId, notifications: [] }
      }),

      addNotification: (n) => {
        const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        const createdAt = new Date().toISOString()
        set((state) => ({
          notifications: [
            { ...n, id, createdAt, isRead: false },
            ...state.notifications,
          ].slice(0, 100),
        }))

      },

      fetchInbox: async () => {
        if (typeof window === 'undefined') return
        try {
          const res = await fetch('/api/notifications/inbox')
          if (!res.ok) return
          const data = await res.json() as { notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>> }
          if (!Array.isArray(data.notifications)) return
          for (const n of data.notifications) {
            get().addNotification(n)
          }
        } catch {}
      },

      unreadCount: () => get().notifications.filter((n) => !n.isRead).length,
    }),
    {
      name: 'eshop-notifications',
      storage: {
        getItem: (name) => {
          try {
            const v = localStorage.getItem(name)
            return v ? JSON.parse(v) : null
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch (e) {
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
              // Exceeded quota — nuke the key and retry with fresh state
              try {
                localStorage.removeItem(name)
                localStorage.setItem(name, JSON.stringify(value))
              } catch {}
            }
          }
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name) } catch {}
        },
      },
    }
  )
)
