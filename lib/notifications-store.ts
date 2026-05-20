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
  isSubscribed: boolean
  channel: NotificationChannel
  setChannel: (channel: NotificationChannel) => void
  subscribe: () => void
  unsubscribe: () => void
  markRead: (id: string) => void
  markAllRead: () => void
  deleteNotification: (id: string) => void
  deleteSelected: (ids: string[]) => void
  deleteAll: () => void
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void
  unreadCount: () => number
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      isSubscribed: false,
      channel: 'app',

      setChannel: (channel) => set({ channel }),
      subscribe: () => set({ isSubscribed: true }),
      unsubscribe: () => set({ isSubscribed: false }),

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

      addNotification: (n) =>
        set((state) => ({
          notifications: [
            {
              ...n,
              id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              createdAt: new Date().toISOString(),
              isRead: false,
            },
            ...state.notifications,
          ],
        })),

      unreadCount: () => get().notifications.filter((n) => !n.isRead).length,
    }),
    { name: 'eshop-notifications' }
  )
)
