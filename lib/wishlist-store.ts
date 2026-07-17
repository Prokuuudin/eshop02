import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '@/data/products'
import { getCurrentUser } from '@/lib/auth'

const GUEST_WISHLIST_SCOPE = 'guest'

type WishlistIdsByScope = Record<string, string[]>

const resolveWishlistScope = (): string => {
  if (typeof window === 'undefined') return GUEST_WISHLIST_SCOPE
  return getCurrentUser()?.id ?? GUEST_WISHLIST_SCOPE
}

const getIdsForScope = (idsByScope: WishlistIdsByScope, scope: string): string[] =>
  idsByScope[scope] ?? []

const resolveProductsFromCache = (ids: string[], cache: Record<string, Product>): Product[] =>
  ids.map((id) => cache[id]).filter((p): p is Product => !!p)

type PersistedWishlistState = {
  currentScope?: string
  idsByScope: WishlistIdsByScope
  productCache: Record<string, Product>
  items?: Product[]
}

// Дo-v5 миграции: приводим любую старую форму хранилища к scoped-форме с кэшем товаров.
const migrateToScopedShape = (persisted: unknown, version: number): PersistedWishlistState => {
  const state = (persisted as Record<string, unknown> | null) ?? {}
  const idsByScope: WishlistIdsByScope = {}
  const productCache: Record<string, Product> = {}

  if (version >= 4 && state.idsByScope && typeof state.idsByScope === 'object') {
    // Already new format with cache
    const cache = (state.productCache as Record<string, Product> | undefined) ?? {}
    return { ...state, idsByScope: state.idsByScope as WishlistIdsByScope, productCache: cache }
  }

  if (state.idsByScope && typeof state.idsByScope === 'object') {
    // v3: had idsByScope but no productCache
    return { ...state, idsByScope: state.idsByScope as WishlistIdsByScope, productCache }
  }

  if (state.itemsByScope && typeof state.itemsByScope === 'object') {
    for (const [scope, products] of Object.entries(state.itemsByScope as Record<string, unknown[]>)) {
      const scopeProducts = products as { id?: string }[]
      idsByScope[scope] = scopeProducts.map((p) => p?.id).filter((id): id is string => typeof id === 'string')
      scopeProducts.forEach((p) => { if (p?.id) productCache[p.id] = p as Product })
    }
  } else if (Array.isArray(state.items)) {
    const items = state.items as { id?: string }[]
    idsByScope[GUEST_WISHLIST_SCOPE] = items.map((p) => p?.id).filter((id): id is string => typeof id === 'string')
    items.forEach((p) => { if (p?.id) productCache[p.id] = p as Product })
  }

  const currentScope = (state.currentScope as string) ?? GUEST_WISHLIST_SCOPE
  return { currentScope, idsByScope, productCache }
}

type WishlistStore = {
  currentScope: string
  idsByScope: WishlistIdsByScope
  productCache: Record<string, Product>
  items: Product[]
  syncWishlistScope: () => void
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  toggleItem: (product: Product) => boolean
  clearWishlist: () => void
  isInWishlist: (productId: string) => boolean
  replaceForCurrentScope: (products: Product[]) => void
}

export const useWishlist = create<WishlistStore>()(
  persist(
    (set, get) => ({
      currentScope: resolveWishlistScope(),
      idsByScope: {},
      productCache: {},
      items: [],
      syncWishlistScope: () => {
        const nextScope = resolveWishlistScope()
        set((state) => {
          if (state.currentScope === nextScope) return state
          const ids = getIdsForScope(state.idsByScope, nextScope)
          return { currentScope: nextScope, items: resolveProductsFromCache(ids, state.productCache) }
        })
      },
      addItem: (product) => {
        // Вишлист только для авторизованных: гостевой scope больше не пополняется.
        if (resolveWishlistScope() === GUEST_WISHLIST_SCOPE) return
        set((state) => {
          const scope = resolveWishlistScope()
          const ids = getIdsForScope(state.idsByScope, scope)
          if (ids.includes(product.id)) return state
          const nextIds = [...ids, product.id]
          const nextCache = { ...state.productCache, [product.id]: product }
          const nextIdsByScope = { ...state.idsByScope, [scope]: nextIds }
          return {
            idsByScope: nextIdsByScope,
            productCache: nextCache,
            currentScope: scope,
            items: resolveProductsFromCache(nextIds, nextCache),
          }
        })
        // Sync to DB if user is logged in
        const scope = resolveWishlistScope()
        if (scope !== GUEST_WISHLIST_SCOPE && typeof window !== 'undefined') {
          fetch('/api/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id }),
          }).catch(() => {})
        }
      },
      removeItem: (productId) => {
        set((state) => {
          const scope = resolveWishlistScope()
          const nextIds = getIdsForScope(state.idsByScope, scope).filter((id) => id !== productId)
          const nextIdsByScope = { ...state.idsByScope, [scope]: nextIds }
          return {
            idsByScope: nextIdsByScope,
            currentScope: scope,
            items: resolveProductsFromCache(nextIds, state.productCache),
          }
        })
        const scope = resolveWishlistScope()
        if (scope !== GUEST_WISHLIST_SCOPE && typeof window !== 'undefined') {
          fetch('/api/wishlist', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId }),
          }).catch(() => {})
        }
      },
      toggleItem: (product) => {
        if (resolveWishlistScope() === GUEST_WISHLIST_SCOPE) return false
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
        const scope = resolveWishlistScope()
        if (scope !== GUEST_WISHLIST_SCOPE && typeof window !== 'undefined') {
          fetch('/api/wishlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})
        }
      },
      isInWishlist: (productId) => get().items.some((item) => item.id === productId),
      replaceForCurrentScope: (products) => {
        const scope = resolveWishlistScope()
        if (scope === GUEST_WISHLIST_SCOPE) return
        set((state) => {
          const ids = products.map((p) => p.id)
          const nextCache = { ...state.productCache }
          products.forEach((p) => { nextCache[p.id] = p })
          return {
            idsByScope: { ...state.idsByScope, [scope]: ids },
            productCache: nextCache,
            currentScope: scope,
            items: resolveProductsFromCache(ids, nextCache),
          }
        })
      },
    }),
    {
      name: 'wishlist-store',
      version: 5,
      onRehydrateStorage: () => (state) => { state?.syncWishlistScope() },
      migrate: (persisted: unknown, version: number) => {
        const migrated = migrateToScopedShape(persisted, version)
        // v5: вишлист только для авторизованных — выкидываем легаси-данные гостевого scope.
        const idsByScope = { ...migrated.idsByScope }
        delete idsByScope[GUEST_WISHLIST_SCOPE]
        const currentScope = migrated.currentScope ?? GUEST_WISHLIST_SCOPE
        return {
          ...migrated,
          idsByScope,
          items: resolveProductsFromCache(getIdsForScope(idsByScope, currentScope), migrated.productCache),
        }
      },
    }
  )
)

export async function hydrateWishlistFromServer(): Promise<void> {
  if (resolveWishlistScope() === GUEST_WISHLIST_SCOPE) return
  try {
    const res = await fetch('/api/wishlist')
    if (!res.ok) return
    const data = (await res.json()) as { productIds?: string[] }
    const ids = Array.isArray(data.productIds) ? data.productIds : []
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/products/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    )
    const products = results
      .map((r) => (r as { product?: Product } | null)?.product)
      .filter((p): p is Product => !!p)
    useWishlist.getState().replaceForCurrentScope(products)
  } catch {
    // Keep whatever's already in the local store on failure.
  }
}
