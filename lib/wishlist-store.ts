import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/data/products'
import { getCurrentUser } from '@/lib/auth'

const GUEST_WISHLIST_SCOPE = 'guest'

type WishlistStateByScope = Record<string, Product[]>

const resolveWishlistScope = (): string => {
  if (typeof window === 'undefined') return GUEST_WISHLIST_SCOPE
  return getCurrentUser()?.id ?? GUEST_WISHLIST_SCOPE
}

const getItemsForScope = (itemsByScope: WishlistStateByScope, scope: string): Product[] => {
  return itemsByScope[scope] ?? []
}

const buildScopeState = (itemsByScope: WishlistStateByScope, scope: string) => ({
  currentScope: scope,
  items: getItemsForScope(itemsByScope, scope)
})

type WishlistStore = {
  currentScope: string
  itemsByScope: WishlistStateByScope
  items: Product[]
  syncWishlistScope: () => void
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  toggleItem: (product: Product) => boolean
  clearWishlist: () => void
  isInWishlist: (productId: string) => boolean
}

export const useWishlist = create<WishlistStore>()(
  persist(
    (set, get) => ({
      currentScope: resolveWishlistScope(),
      itemsByScope: {},
      items: [],
      syncWishlistScope: () => {
        const nextScope = resolveWishlistScope()

        set((state) => {
          if (state.currentScope === nextScope) {
            const syncedItems = getItemsForScope(state.itemsByScope, nextScope)
            if (state.items === syncedItems) {
              return state
            }

            return { items: syncedItems }
          }

          return {
            currentScope: nextScope,
            items: getItemsForScope(state.itemsByScope, nextScope)
          }
        })
      },
      addItem: (product) => {
        set((state) => {
          const activeScope = resolveWishlistScope()
          const currentItems = getItemsForScope(state.itemsByScope, activeScope)
          if (currentItems.some((item) => item.id === product.id)) {
            return {
              ...state,
              ...buildScopeState(state.itemsByScope, activeScope)
            }
          }

          const nextItems = [...currentItems, product]
          const nextItemsByScope = {
            ...state.itemsByScope,
            [activeScope]: nextItems
          }

          return {
            itemsByScope: nextItemsByScope,
            ...buildScopeState(nextItemsByScope, activeScope)
          }
        })
      },
      removeItem: (productId) => {
        set((state) => {
          const activeScope = resolveWishlistScope()
          const nextItems = getItemsForScope(state.itemsByScope, activeScope).filter((item) => item.id !== productId)
          const nextItemsByScope = {
            ...state.itemsByScope,
            [activeScope]: nextItems
          }

          return {
            itemsByScope: nextItemsByScope,
            ...buildScopeState(nextItemsByScope, activeScope)
          }
        })
      },
      toggleItem: (product) => {
        const exists = get().items.some((item) => item.id === product.id)

        if (exists) {
          get().removeItem(product.id)
          return false
        }

        get().addItem(product)
        return true
      },
      clearWishlist: () => {
        set((state) => {
          const activeScope = resolveWishlistScope()
          const nextItemsByScope = {
            ...state.itemsByScope,
            [activeScope]: []
          }

          return {
            itemsByScope: nextItemsByScope,
            ...buildScopeState(nextItemsByScope, activeScope)
          }
        })
      },
      isInWishlist: (productId) => {
        return get().items.some((item) => item.id === productId)
      }
    }),
    {
      name: 'wishlist-store',
      version: 2,
      onRehydrateStorage: () => {
        return (state) => {
          state?.syncWishlistScope()
        }
      },
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<WishlistStore> | null) ?? null

        if (!state) {
          return {
            currentScope: GUEST_WISHLIST_SCOPE,
            itemsByScope: {},
            items: []
          }
        }

        if (state.itemsByScope) {
          const currentScope = state.currentScope ?? GUEST_WISHLIST_SCOPE
          return {
            ...state,
            currentScope,
            items: getItemsForScope(state.itemsByScope, currentScope)
          }
        }

        const legacyItems = Array.isArray(state.items) ? state.items : []
        return {
          ...state,
          currentScope: GUEST_WISHLIST_SCOPE,
          itemsByScope: {
            [GUEST_WISHLIST_SCOPE]: legacyItems
          },
          items: legacyItems
        }
      }
    }
  )
)