import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/data/products'

type ViewedProductsStore = {
  products: Product[]
  addView: (product: Product) => void
  getRecentViews: (limit?: number) => Product[]
}

export const useViewedProducts = create<ViewedProductsStore>()(
  persist(
    (set, get) => ({
      products: [],
      addView: (product: Product) => {
        set((state) => {
          // Remove if already exists (to avoid duplicates)
          const filtered = state.products.filter((p) => p.id !== product.id)
          // Add to the beginning (most recent first)
          return { products: [product, ...filtered].slice(0, 20) }
        })
      },
      getRecentViews: (limit = 6) => {
        return get().products.slice(0, limit)
      }
    }),
    {
      name: 'viewed-products-store'
    }
  )
)
