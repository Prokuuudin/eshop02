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
        // Persisted entries may come from an older product shape or from a catalog
        // response where role-based pricing is intentionally omitted.
        return get().products
          .filter((product) => product && typeof product.id === 'string' && typeof product.title === 'string')
          .slice(0, limit)
      }
    }),
    {
      name: 'viewed-products-store'
    }
  )
)
