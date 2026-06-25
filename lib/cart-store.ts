import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AddableProduct = {
  id: string
  title: string
  brand: string
  image?: string
  images?: string[]
  price: number
  bonusRate?: number
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
  minOrderQuantities?: Record<string, number>
  category?: string
  sku?: string
}

export type CartItem = {
  id: string
  title: string
  brand: string
  image?: string
  price: number
  quantity: number
  bonusRate?: number
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
  minOrderQuantities?: Record<string, number>
  category?: string
  sku?: string
}

type CartStore = {
  items: CartItem[]
  addItem: (product: AddableProduct, quantity: number) => void
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
      addItem: (product: AddableProduct, quantity: number) => {
        const slim: Omit<CartItem, 'quantity'> = {
          id: product.id,
          title: product.title,
          brand: product.brand,
          image: product.image || product.images?.[0],
          price: product.price,
          bonusRate: product.bonusRate,
          bulkPricingTiers: product.bulkPricingTiers,
          minOrderQuantities: product.minOrderQuantities,
          category: product.category,
          sku: product.sku,
        }
        set((state) => {
          const existing = state.items.find((i) => i.id === slim.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === slim.id ? { ...i, quantity: i.quantity + quantity } : i
              )
            }
          }
          return {
            items: [...state.items, { ...slim, quantity }]
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
