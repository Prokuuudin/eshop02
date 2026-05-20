import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem } from '@/lib/cart-store'

export interface OrderTemplate {
  id: string
  userId: string
  name: string
  items: CartItem[]
  createdAt: string
  updatedAt: string
}

interface OrderTemplatesStore {
  templates: OrderTemplate[]
  create: (userId: string, name: string, items: CartItem[]) => OrderTemplate
  rename: (id: string, name: string) => void
  delete: (id: string) => void
  getUserTemplates: (userId: string) => OrderTemplate[]
}

export const useOrderTemplatesStore = create<OrderTemplatesStore>()(
  persist(
    (set, get) => ({
      templates: [],

      create: (userId, name, items) => {
        const tpl: OrderTemplate = {
          id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          name: name.trim(),
          items,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set((s) => ({ templates: [tpl, ...s.templates] }))
        return tpl
      },

      rename: (id, name) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, name: name.trim(), updatedAt: new Date().toISOString() } : t
          ),
        })),

      delete: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      getUserTemplates: (userId) =>
        get().templates.filter((t) => t.userId === userId),
    }),
    { name: 'eshop-order-templates' }
  )
)
