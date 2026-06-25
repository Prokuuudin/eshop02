import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelectedVariant } from '@/data/products'
import { sumPriceAdjustment } from '@/lib/product-variants'

export type { SelectedVariant }

export function buildLineKey(id: string, selectedVariants?: SelectedVariant[]): string {
  if (!selectedVariants || selectedVariants.length === 0) return id
  return id + '::' + selectedVariants.map((v) => `${v.groupName}=${v.value}`).join(',')
}

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
  lineKey: string
  selectedVariants?: SelectedVariant[]
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
  variantLabel?: string
}

type CartStore = {
  items: CartItem[]
  addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => void
  removeItem: (lineKey: string) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  replaceWithItems: (items: CartItem[]) => void
  clearCart: () => void
  total: () => number
}

/**
 * Migrates a persisted cart-store state from before `CartItem.lineKey` existed
 * (version 0 / unversioned) to the current shape. Any item missing `lineKey`
 * (every pre-this-branch persisted item) gets one computed the same way
 * `addItem` does, which for items with no `selectedVariants` simply yields
 * the product id — preserving prior single-variant cart behavior exactly.
 */
export function migrateCartState(persistedState: unknown): CartStore {
  const state = persistedState as { items?: Array<Partial<CartItem> & { id: string }> }
  if (state?.items) {
    state.items = state.items.map((item) =>
      item.lineKey ? item : { ...item, lineKey: buildLineKey(item.id, item.selectedVariants) }
    )
  }
  return state as CartStore
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => {
        const lineKey = buildLineKey(product.id, selectedVariants)
        const priceAdjustment = sumPriceAdjustment(selectedVariants ?? [])
        const variantLabel = selectedVariants?.length
          ? selectedVariants.map((v) => `${v.groupName}: ${v.value}`).join(', ')
          : undefined
        const slim: Omit<CartItem, 'quantity'> = {
          id: product.id,
          lineKey,
          selectedVariants,
          variantLabel,
          title: product.title,
          brand: product.brand,
          image: product.image || product.images?.[0],
          price: product.price + priceAdjustment,
          bonusRate: product.bonusRate,
          bulkPricingTiers: product.bulkPricingTiers,
          minOrderQuantities: product.minOrderQuantities,
          category: product.category,
          sku: product.sku,
        }
        set((state) => {
          const existing = state.items.find((i) => i.lineKey === lineKey)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.lineKey === lineKey ? { ...i, quantity: i.quantity + quantity } : i
              )
            }
          }
          return {
            items: [...state.items, { ...slim, quantity }]
          }
        })
      },
      removeItem: (lineKey: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.lineKey !== lineKey)
        }))
      },
      updateQuantity: (lineKey: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(lineKey)
        } else {
          set((state) => ({
            items: state.items.map((i) => (i.lineKey === lineKey ? { ...i, quantity } : i))
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
    {
      name: 'cart-store',
      version: 1,
      migrate: migrateCartState,
    }
  )
)
