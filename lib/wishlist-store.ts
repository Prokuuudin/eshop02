import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product, PRODUCTS } from '@/data/products'
import { getCurrentUser } from '@/lib/auth'

const GUEST_WISHLIST_SCOPE = 'guest'

type WishlistIdsByScope = Record<string, string[]>

const resolveWishlistScope = (): string => {
  if (typeof window === 'undefined') return GUEST_WISHLIST_SCOPE
  return getCurrentUser()?.id ?? GUEST_WISHLIST_SCOPE
}

const getIdsForScope = (idsByScope: WishlistIdsByScope, scope: string): string[] =>
  idsByScope[scope] ?? []

const resolveProducts = (ids: string[]): Product[] =>
  ids.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p): p is Product => !!p)

type WishlistStore = {
  currentScope: string
  idsByScope: WishlistIdsByScope
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
      idsByScope: {},
      items: [],
      syncWishlistScope: () => {
        const nextScope = resolveWishlistScope()
        set((state) => {
          if (state.currentScope === nextScope) return state
          const ids = getIdsForScope(state.idsByScope, nextScope)
          return { currentScope: nextScope, items: resolveProducts(ids) }
        })
      },
      addItem: (product) => {
        set((state) => {
          const scope = resolveWishlistScope()
          const ids = getIdsForScope(state.idsByScope, scope)
          if (ids.includes(product.id)) return state
          const nextIds = [...ids, product.id]
          const nextIdsByScope = { ...state.idsByScope, [scope]: nextIds }
          return {
            idsByScope: nextIdsByScope,
            currentScope: scope,
            items: resolveProducts(nextIds),
          }
        })
      },
      removeItem: (productId) => {
        set((state) => {
          const scope = resolveWishlistScope()
          const nextIds = getIdsForScope(state.idsByScope, scope).filter((id) => id !== productId)
          const nextIdsByScope = { ...state.idsByScope, [scope]: nextIds }
          return {
            idsByScope: nextIdsByScope,
            currentScope: scope,
            items: resolveProducts(nextIds),
          }
        })
      },
      toggleItem: (product) => {
        const exists = get().items.some((item) => item.id === product.id)
        if (exists) { get().removeItem(product.id); return false }
        get().addItem(product); return true
      },
      clearWishlist: () => {
        set((state) => {
          const scope = resolveWishlistScope()
          const nextIdsByScope = { ...state.idsByScope, [scope]: [] }
          return { idsByScope: nextIdsByScope, currentScope: scope, items: [] }
        })
      },
      isInWishlist: (productId) => get().items.some((item) => item.id === productId),
    }),
    {
      name: 'wishlist-store',
      version: 3,
      onRehydrateStorage: () => (state) => { state?.syncWishlistScope() },
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted as Record<string, unknown> | null) ?? {}

        // v1/v2: stored full Product objects in itemsByScope or items
        const idsByScope: WishlistIdsByScope = {}

        if (state.idsByScope && typeof state.idsByScope === 'object') {
          // Already new format (version 3)
          return { ...state, idsByScope: state.idsByScope as WishlistIdsByScope }
        }

        if (state.itemsByScope && typeof state.itemsByScope === 'object') {
          // v2: itemsByScope had Product[]
          for (const [scope, products] of Object.entries(state.itemsByScope as Record<string, unknown[]>)) {
            idsByScope[scope] = (products as { id?: string }[])
              .map((p) => p?.id)
              .filter((id): id is string => typeof id === 'string')
          }
        } else if (Array.isArray(state.items)) {
          // v1: flat items array
          idsByScope[GUEST_WISHLIST_SCOPE] = (state.items as { id?: string }[])
            .map((p) => p?.id)
            .filter((id): id is string => typeof id === 'string')
        }

        const currentScope = (state.currentScope as string) ?? GUEST_WISHLIST_SCOPE
        return {
          currentScope,
          idsByScope,
          items: resolveProducts(getIdsForScope(idsByScope, currentScope)),
        }
      },
    }
  )
)
