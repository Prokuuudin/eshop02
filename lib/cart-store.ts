import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/data/products'

export type CartItem = Product & {
  quantity: number
}

type CartStore = {
  items: CartItem[]
  addItem: (product: Product, quantity: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  replaceWithItems: (items: CartItem[]) => void
  clearCart: () => void
  total: () => number
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product: Product, quantity: number) => {
        set((state) => {
          const existing = state.items.find((i) => i.id === product.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
              )
            }
          }
          return {
            items: [...state.items, { ...product, quantity }]
          }
        })
      },
      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== productId)
        }))
      },
      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId)
        } else {
          set((state) => ({
            items: state.items.map((i) => (i.id === productId ? { ...i, quantity } : i))
          }))
        }
      },
      replaceWithItems: (items: CartItem[]) => {
        set({ items })
      },
      clearCart: () => {
        set({ items: [] })
      },
      total: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      }
    }),
    { name: 'cart-store' }
  )
)
