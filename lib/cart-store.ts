import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product, SelectedVariant } from '@/data/products'
import { resolveSelectedVariants, sumPriceAdjustment } from '@/lib/product-variants'
import { getCurrentUser } from '@/lib/auth'

export type { SelectedVariant }

export function buildLineKey(id: string, selectedVariants?: SelectedVariant[]): string {
  if (!selectedVariants || selectedVariants.length === 0) return id
  return id + '::' + selectedVariants.map((v) => `${v.groupName}=${v.value}`).join(',')
}

type AddableProduct = {
  id: string
  titleKey?: string
  title: string
  titleEn?: string
  titleLv?: string
  brand: string
  image?: string
  images?: string[]
  price: number
  priceUnavailable?: boolean
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
  titleKey?: string
  title: string
  titleEn?: string
  titleLv?: string
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

/**
 * Минимальная запись позиции, которая хранится за пользователем и переживает выход из аккаунта.
 * Без названий и цен: при восстановлении всё остальное берётся заново из каталога.
 */
export type CartLine = {
  id: string
  lineKey: string
  quantity: number
  selectedVariants?: Array<Pick<SelectedVariant, 'groupName' | 'value'>>
}

export type CartLineDetails = Omit<CartItem, 'quantity'>

export type PersistedCartState = {
  ownerId: string | null
  linesByUser: Record<string, CartLine[]>
  details: Record<string, CartLineDetails>
}

type CartStore = PersistedCartState & {
  items: CartItem[]
  addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => void
  removeItem: (lineKey: string) => void
  updateQuantity: (lineKey: string, quantity: number) => void
  replaceWithItems: (items: CartItem[]) => void
  clearCart: () => void
  total: () => number
  /** Переключает корзину на пользователя (null — гость/выход) и при необходимости восстанавливает её. */
  syncCartUser: (userId: string | null) => void
}

function toCartLine(item: Pick<CartItem, 'id' | 'lineKey' | 'quantity' | 'selectedVariants'>): CartLine {
  return {
    id: item.id,
    lineKey: item.lineKey,
    quantity: item.quantity,
    ...(item.selectedVariants?.length
      ? { selectedVariants: item.selectedVariants.map(({ groupName, value }) => ({ groupName, value })) }
      : {}),
  }
}

function toLineDetails(item: CartItem): CartLineDetails {
  const { quantity: _quantity, ...details } = item
  return details
}

function buildLineDetails(product: AddableProduct, selectedVariants?: SelectedVariant[]): CartLineDetails {
  const variants = selectedVariants?.length ? selectedVariants : undefined
  return {
    id: product.id,
    lineKey: buildLineKey(product.id, variants),
    selectedVariants: variants,
    variantLabel: variants ? variants.map((v) => `${v.groupName}: ${v.value}`).join(', ') : undefined,
    titleKey: product.titleKey,
    title: product.title,
    titleEn: product.titleEn,
    titleLv: product.titleLv,
    brand: product.brand,
    image: product.image || product.images?.[0],
    price: product.price + sumPriceAdjustment(variants ?? []),
    bonusRate: product.bonusRate,
    bulkPricingTiers: product.bulkPricingTiers,
    minOrderQuantities: product.minOrderQuantities,
    category: product.category,
    sku: product.sku,
  }
}

// Видимые позиции = строки активного пользователя, для которых уже есть актуальные детали.
export function composeCartItems(lines: CartLine[] | undefined, details: Record<string, CartLineDetails>): CartItem[] {
  return (lines ?? []).flatMap((line) => {
    const lineDetails = details[line.lineKey]
    return lineDetails ? [{ ...lineDetails, quantity: line.quantity }] : []
  })
}

function withOwnerLines(
  state: PersistedCartState,
  lines: CartLine[],
  details: Record<string, CartLineDetails>
): Partial<CartStore> {
  if (!state.ownerId) return {}
  return {
    linesByUser: { ...state.linesByUser, [state.ownerId]: lines },
    details,
    items: composeCartItems(lines, details),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * v0/v1 хранили одну общую корзину `items`. Прежний CartUserSync очищал её при каждой смене
 * пользователя, поэтому она принадлежит тому, кто сейчас вошёл в этом браузере; без входа
 * владельца не определить — такие позиции отбрасываются.
 */
export function migrateCartState(persistedState: unknown, version: number, currentUserId: string | null): unknown {
  if (version >= 2) return persistedState
  const legacyItems = isRecord(persistedState) && Array.isArray(persistedState.items)
    ? (persistedState.items as Array<Record<string, unknown>>)
    : []
  // Бэкафилл lineKey для корзин, сохранённых до введения составного ключа.
  const items = legacyItems
    .filter((item) => typeof item.id === 'string' && Number(item.quantity) > 0)
    .map((item) => (typeof item.lineKey === 'string' && item.lineKey.length > 0
      ? item
      : { ...item, lineKey: buildLineKey(item.id as string, item.selectedVariants as SelectedVariant[] | undefined) }
    )) as unknown as CartItem[]
  if (!currentUserId || items.length === 0) {
    return { ownerId: currentUserId, linesByUser: {}, details: {} } satisfies PersistedCartState
  }
  return {
    ownerId: currentUserId,
    linesByUser: { [currentUserId]: items.map(toCartLine) },
    details: Object.fromEntries(items.map((item) => [item.lineKey, toLineDetails(item)])),
  } satisfies PersistedCartState
}

export function mergePersistedCart(persistedState: unknown, currentState: CartStore): CartStore {
  if (!isRecord(persistedState)) return currentState
  const linesByUser = isRecord(persistedState.linesByUser) ? persistedState.linesByUser as Record<string, CartLine[]> : {}
  // Хранилище могли оставить под другим входом (другая вкладка, истёкшая сессия): чужие
  // детали не показываем ни на один рендер, корзина восстановится через syncCartUser.
  const persistedOwnerId = typeof persistedState.ownerId === 'string' ? persistedState.ownerId : null
  const ownerId = getCurrentUser()?.id ?? null
  // Детали с ценами хранятся только за активным пользователем.
  const details = ownerId && ownerId === persistedOwnerId && isRecord(persistedState.details)
    ? persistedState.details as Record<string, CartLineDetails>
    : {}
  return {
    ...currentState,
    ownerId,
    linesByUser,
    details,
    items: ownerId ? composeCartItems(linesByUser[ownerId], details) : [],
  }
}

const MAX_PRODUCT_BATCH = 100 // = MAX_BATCH_IDS в app/api/products/route.ts

/**
 * Подтягивает актуальные данные и цены для строк пользователя без деталей (после входа или
 * смены пользователя). Цену и надбавки вариантов даёт каталог; checkout всё равно пересчитывает
 * заказ на сервере. Пропавшие из витрины, непродаваемые товары и исчезнувшие варианты удаляются.
 */
export async function restoreCartForUser(userId: string): Promise<void> {
  const { linesByUser, details } = useCart.getState()
  const ids = [...new Set((linesByUser[userId] ?? []).filter((line) => !details[line.lineKey]).map((line) => line.id))]
  if (ids.length === 0) return

  const products: Product[] = []
  try {
    for (let i = 0; i < ids.length; i += MAX_PRODUCT_BATCH) {
      const chunk = ids.slice(i, i + MAX_PRODUCT_BATCH)
      const res = await fetch(`/api/products?ids=${chunk.map(encodeURIComponent).join(',')}`)
      if (!res.ok) return
      products.push(...(((await res.json()) as { data?: { products?: Product[] } }).data?.products ?? []))
    }
  } catch {
    return // Сеть недоступна: строки остаются, следующая синхронизация попробует снова.
  }
  // Без действующей сессии API вырезает цены — проверить позиции нечем, ничего не удаляем.
  if (products.some((product) => typeof product.price !== 'number')) return

  const byId = new Map(products.map((product) => [product.id, product]))
  const requestedIds = new Set(ids)
  useCart.setState((state) => {
    if (state.ownerId !== userId) return state // пользователь сменился, пока шёл запрос
    const nextDetails = { ...state.details }
    const nextLines = (state.linesByUser[userId] ?? []).filter((line) => {
      if (!requestedIds.has(line.id)) return true // добавлено во время запроса, детали уже свежие
      const product = byId.get(line.id)
      const variants = product && !product.priceUnavailable && Number.isFinite(product.price)
        ? resolveSelectedVariants(product.technicalSpecs, line.selectedVariants)
        : null
      if (!product || !variants) {
        delete nextDetails[line.lineKey]
        return false
      }
      nextDetails[line.lineKey] = buildLineDetails(product, variants)
      return true
    })
    return withOwnerLines(state, nextLines, nextDetails)
  })
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      ownerId: null,
      linesByUser: {},
      details: {},
      items: [],
      syncCartUser: (userId: string | null) => {
        if (get().ownerId !== userId) {
          // Корзина прежнего пользователя остаётся в linesByUser; его названия и цены — нет.
          set({ ownerId: userId, details: {}, items: [] })
        }
        if (userId) void restoreCartForUser(userId)
      },
      addItem: (product: AddableProduct, quantity: number, selectedVariants?: SelectedVariant[]) => {
        // Корзина только для авторизованных: UI-гейты это уже обеспечивают,
        // здесь — последний рубеж для любых обходных путей (консоль, старый код).
        const user = typeof window === 'undefined' ? null : getCurrentUser()
        if (!user) return
        // Not for sale (no valid B2B price) or no price at all — nothing sensible to add.
        // Checkout rejects such lines server-side anyway; this keeps the cart honest.
        if (product.priceUnavailable || !Number.isFinite(product.price)) return
        if (get().ownerId !== user.id) get().syncCartUser(user.id)
        const lineDetails = buildLineDetails(product, selectedVariants)
        set((state) => {
          const lines = state.linesByUser[user.id] ?? []
          const existing = lines.find((line) => line.lineKey === lineDetails.lineKey)
          const nextLines = existing
            ? lines.map((line) => (line === existing ? { ...line, quantity: line.quantity + quantity } : line))
            : [...lines, toCartLine({ ...lineDetails, quantity })]
          return withOwnerLines(state, nextLines, { ...state.details, [lineDetails.lineKey]: lineDetails })
        })
      },
      removeItem: (lineKey: string) => {
        set((state) => {
          const nextDetails = { ...state.details }
          delete nextDetails[lineKey]
          const lines = state.ownerId ? state.linesByUser[state.ownerId] ?? [] : []
          return withOwnerLines(state, lines.filter((line) => line.lineKey !== lineKey), nextDetails)
        })
      },
      updateQuantity: (lineKey: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(lineKey)
        } else {
          set((state) => {
            const lines = state.ownerId ? state.linesByUser[state.ownerId] ?? [] : []
            return withOwnerLines(
              state,
              lines.map((line) => (line.lineKey === lineKey ? { ...line, quantity } : line)),
              state.details
            )
          })
        }
      },
      replaceWithItems: (items: CartItem[]) => {
        const user = typeof window === 'undefined' ? null : getCurrentUser()
        if (user && get().ownerId !== user.id) get().syncCartUser(user.id)
        set((state) => withOwnerLines(
          state,
          items.map(toCartLine),
          Object.fromEntries(items.map((item) => [item.lineKey, toLineDetails(item)]))
        ))
      },
      clearCart: () => {
        set((state) => ({ ...withOwnerLines(state, [], {}), details: {}, items: [] }))
      },
      total: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      }
    }),
    {
      name: 'cart-store',
      version: 2,
      migrate: (persistedState, version) =>
        migrateCartState(persistedState, version, getCurrentUser()?.id ?? null) as CartStore,
      partialize: (state): PersistedCartState => ({
        ownerId: state.ownerId,
        linesByUser: state.linesByUser,
        details: state.details,
      }),
      merge: mergePersistedCart,
    }
  )
)
