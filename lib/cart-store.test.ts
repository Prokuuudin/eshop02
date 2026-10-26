import { beforeEach, describe, expect, it, vi } from 'vitest'

// Сторы создаются при импорте: окружение браузера нужно до них (подписка
// cart-selection-store на корзину ставится только при наличии window).
const storage = vi.hoisted(() => {
  const store = new Map<string, string>()
  const globals = globalThis as unknown as { window: object; localStorage: Storage }
  globals.window = {}
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
  return store
})

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(() => null) }))

import {
  buildLineKey,
  mergePersistedCart,
  migrateCartState,
  restoreCartForUser,
  useCart,
  type CartLine,
} from './cart-store'
import { useCartSelection } from './cart-selection-store'
import { getCurrentUser } from '@/lib/auth'

type CatalogProduct = Record<string, unknown> & { id: string }

function loginAs(userId: string | null): void {
  vi.mocked(getCurrentUser).mockReturnValue(userId ? ({ id: userId, email: `${userId}@example.lv` } as never) : null)
  useCart.getState().syncCartUser(userId)
}

function product(id: string, price: number, extra: Record<string, unknown> = {}): CatalogProduct {
  return { id, title: `Product ${id}`, brand: 'Brand', price, category: 'hair', stock: 5, ...extra }
}

function serveCatalog(products: CatalogProduct[]): ReturnType<typeof vi.fn> {
  const byId = new Map(products.map((item) => [item.id, item]))
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const ids = new URL(String(url), 'http://localhost').searchParams.get('ids')?.split(',') ?? []
    const found = ids.map((id) => byId.get(decodeURIComponent(id))).filter(Boolean)
    return { ok: true, json: async () => ({ data: { products: found } }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const variantSpecs = {
  __variantGroupsJson: JSON.stringify([
    { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11', priceAdjustment: 2 }] },
  ]),
}

beforeEach(() => {
  storage.clear()
  vi.unstubAllGlobals()
  serveCatalog([])
  vi.mocked(getCurrentUser).mockReturnValue(null)
  useCart.setState({ ownerId: null, linesByUser: {}, details: {}, items: [] })
  useCartSelection.setState({ deselectedLineKeys: [] })
})

describe('buildLineKey', () => {
  it('returns the plain id when there are no variants', () => {
    expect(buildLineKey('p1')).toBe('p1')
    expect(buildLineKey('p1', [])).toBe('p1')
  })

  it('builds a composite key from selected variants', () => {
    expect(buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }]))
      .toBe('p1::Krāsu numurs=A-11')
  })

  it('produces different keys for different variants of the same product', () => {
    const keyA = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-11' }])
    const keyB = buildLineKey('p1', [{ groupName: 'Krāsu numurs', value: 'A-12' }])
    expect(keyA).not.toBe(keyB)
  })

  it('combines multiple groups deterministically', () => {
    const key = buildLineKey('p1', [
      { groupName: 'Krāsu numurs', value: 'A-11' },
      { groupName: 'Izmērs', value: 'M' },
    ])
    expect(key).toBe('p1::Krāsu numurs=A-11,Izmērs=M')
  })
})

describe('per-user cart', () => {
  it('keeps the cart through logout and restores it with current prices on the next login', async () => {
    loginAs('u1')
    useCart.getState().addItem(product('p1', 10) as never, 2)
    expect(useCart.getState().items).toHaveLength(1)

    loginAs(null)
    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().linesByUser.u1).toEqual([{ id: 'p1', lineKey: 'p1', quantity: 2 }])
    // После выхода в браузере остаются только id и количество — без названий и цен.
    const persisted = storage.get('cart-store') ?? ''
    expect(persisted).not.toContain('Product p1')
    expect(persisted).not.toContain('"price"')

    const fetchMock = serveCatalog([product('p1', 12)])
    loginAs('u1') // CartUserSync сам запускает восстановление
    await vi.waitFor(() => expect(useCart.getState().items).toHaveLength(1))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/products?ids=p1')
    expect(useCart.getState().items).toEqual([
      expect.objectContaining({ id: 'p1', lineKey: 'p1', title: 'Product p1', price: 12, quantity: 2 }),
    ])
  })

  it('never shows one user cart to another user on the same browser', async () => {
    loginAs('u1')
    useCart.getState().addItem(product('p1', 10) as never, 1)
    loginAs(null)

    const fetchMock = serveCatalog([product('p1', 10), product('p2', 20)])
    loginAs('u2')
    await restoreCartForUser('u2')
    expect(useCart.getState().items).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    useCart.getState().addItem(product('p2', 20) as never, 3)
    expect(useCart.getState().items.map((item) => item.id)).toEqual(['p2'])

    loginAs('u1')
    await restoreCartForUser('u1')
    expect(useCart.getState().items.map((item) => [item.id, item.quantity])).toEqual([['p1', 1]])
    expect(useCart.getState().linesByUser.u2).toEqual([{ id: 'p2', lineKey: 'p2', quantity: 3 }])
  })

  it('keeps saved lines untouched when the catalog answers without prices (expired session)', async () => {
    useCart.setState({ linesByUser: { u1: [{ id: 'p1', lineKey: 'p1', quantity: 4 }] } })
    serveCatalog([{ id: 'p1', title: 'Product p1', brand: 'Brand', category: 'hair', stock: 5 }])

    loginAs('u1')
    await restoreCartForUser('u1')

    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().linesByUser.u1).toEqual([{ id: 'p1', lineKey: 'p1', quantity: 4 }])
  })

  it('keeps saved lines when the catalog request fails and retries on the next sync', async () => {
    useCart.setState({ linesByUser: { u1: [{ id: 'p1', lineKey: 'p1', quantity: 1 }] } })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    loginAs('u1')
    await restoreCartForUser('u1')
    expect(useCart.getState().linesByUser.u1).toHaveLength(1)
    expect(useCart.getState().items).toEqual([])

    serveCatalog([product('p1', 10)])
    useCart.getState().syncCartUser('u1')
    await restoreCartForUser('u1')
    expect(useCart.getState().items.map((item) => item.id)).toEqual(['p1'])
  })

  it('drops gone, unsellable and no-longer-existing variant lines and re-prices variants from the catalog', async () => {
    const lines: CartLine[] = [
      { id: 'gone', lineKey: 'gone', quantity: 1 },
      { id: 'unsellable', lineKey: 'unsellable', quantity: 1 },
      { id: 'pv', lineKey: 'pv::Krāsu numurs=A-11', quantity: 2, selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11' }] },
      { id: 'pv', lineKey: 'pv::Krāsu numurs=A-99', quantity: 1, selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-99' }] },
    ]
    useCart.setState({ linesByUser: { u1: lines } })
    serveCatalog([
      product('unsellable', 0, { priceUnavailable: true }),
      product('pv', 10, { technicalSpecs: variantSpecs }),
    ])

    loginAs('u1')
    await restoreCartForUser('u1')

    expect(useCart.getState().items).toEqual([
      expect.objectContaining({
        id: 'pv',
        lineKey: 'pv::Krāsu numurs=A-11',
        price: 12,
        quantity: 2,
        variantLabel: 'Krāsu numurs: A-11',
        selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11', priceAdjustment: 2 }],
      }),
    ])
    expect(useCart.getState().linesByUser.u1.map((line) => line.lineKey)).toEqual(['pv::Krāsu numurs=A-11'])
  })

  it('discards a restore that finishes after the user has already logged out', async () => {
    useCart.setState({ linesByUser: { u1: [{ id: 'p1', lineKey: 'p1', quantity: 1 }] } })
    let respond: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve })))

    loginAs('u1')
    const restore = restoreCartForUser('u1')
    loginAs(null)
    respond({ ok: true, json: async () => ({ data: { products: [product('p1', 10)] } }) } as Response)
    await restore

    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().details).toEqual({})
    expect(useCart.getState().linesByUser.u1).toHaveLength(1)
  })

  it('does not let a guest add to the cart', () => {
    useCart.getState().addItem(product('p1', 10) as never, 1)
    expect(useCart.getState().linesByUser).toEqual({})
    expect(useCart.getState().items).toEqual([])
  })

  it('attaches an add to the logged-in user even before CartUserSync has run', () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1', email: 'u1@example.lv' } as never)
    useCart.getState().addItem(product('p1', 10) as never, 1)
    expect(useCart.getState().ownerId).toBe('u1')
    expect(useCart.getState().linesByUser.u1).toEqual([{ id: 'p1', lineKey: 'p1', quantity: 1 }])
  })

  it('clearCart and replaceWithItems only touch the active user', () => {
    useCart.setState({ linesByUser: { u2: [{ id: 'p2', lineKey: 'p2', quantity: 1 }] } })
    loginAs('u1')
    useCart.getState().addItem(product('p1', 10) as never, 1)
    useCart.getState().replaceWithItems([
      { id: 'p3', lineKey: 'p3', title: 'Product p3', brand: 'Brand', price: 5, quantity: 2 },
    ])
    expect(useCart.getState().items.map((item) => item.id)).toEqual(['p3'])
    expect(useCart.getState().total()).toBe(10)

    useCart.getState().clearCart()
    expect(useCart.getState().items).toEqual([])
    expect(useCart.getState().linesByUser.u1).toEqual([])
    expect(useCart.getState().linesByUser.u2).toHaveLength(1)
  })

  it('logout prunes checkout deselections so the next user starts with everything selected', () => {
    loginAs('u1')
    useCart.getState().addItem(product('p1', 10) as never, 1)
    useCartSelection.getState().toggle('p1')
    expect(useCartSelection.getState().deselectedLineKeys).toEqual(['p1'])

    loginAs(null)
    expect(useCartSelection.getState().deselectedLineKeys).toEqual([])
  })
})

describe('migrateCartState', () => {
  const legacyItem = { id: 'p1', title: 'X', brand: 'B', price: 10, quantity: 1 }

  it('assigns a legacy shared cart to the logged-in user and backfills lineKey', () => {
    const migrated = migrateCartState({ items: [legacyItem] }, 0, 'u1') as {
      ownerId: string
      linesByUser: Record<string, CartLine[]>
      details: Record<string, { price: number }>
    }
    expect(migrated.ownerId).toBe('u1')
    expect(migrated.linesByUser.u1).toEqual([{ id: 'p1', lineKey: 'p1', quantity: 1 }])
    expect(migrated.details.p1.price).toBe(10)
  })

  it('builds the variant lineKey and keeps only variant names in the saved line', () => {
    const migrated = migrateCartState({
      items: [{ ...legacyItem, selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11', priceAdjustment: 2 }] }],
    }, 0, 'u1') as { linesByUser: Record<string, CartLine[]> }
    expect(migrated.linesByUser.u1).toEqual([{
      id: 'p1',
      lineKey: 'p1::Krāsu numurs=A-11',
      quantity: 1,
      selectedVariants: [{ groupName: 'Krāsu numurs', value: 'A-11' }],
    }])
  })

  it('keeps an existing v1 lineKey', () => {
    const migrated = migrateCartState({ items: [{ ...legacyItem, lineKey: 'p1::custom' }] }, 1, 'u1') as {
      linesByUser: Record<string, CartLine[]>
    }
    expect(migrated.linesByUser.u1[0].lineKey).toBe('p1::custom')
  })

  it('drops a legacy cart when nobody is logged in, since its owner is unknown', () => {
    expect(migrateCartState({ items: [legacyItem] }, 1, null)).toEqual({ ownerId: null, linesByUser: {}, details: {} })
    expect(migrateCartState({}, 0, 'u1')).toEqual({ ownerId: 'u1', linesByUser: {}, details: {} })
  })

  it('passes v2 state through unchanged', () => {
    const state = { ownerId: 'u1', linesByUser: {}, details: {} }
    expect(migrateCartState(state, 2, 'u2')).toBe(state)
  })
})

describe('mergePersistedCart', () => {
  const persisted = {
    ownerId: 'u1',
    linesByUser: { u1: [{ id: 'p1', lineKey: 'p1', quantity: 2 }] },
    details: { p1: { id: 'p1', lineKey: 'p1', title: 'X', brand: 'B', price: 10 } },
  }

  it('shows the saved cart on reload for the same user', () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1' } as never)
    const merged = mergePersistedCart(persisted, useCart.getState())
    expect(merged.items).toEqual([expect.objectContaining({ id: 'p1', quantity: 2, price: 10 })])
  })

  it('never renders saved details for a different or logged-out browser user', () => {
    vi.mocked(getCurrentUser).mockReturnValue({ id: 'u2' } as never)
    expect(mergePersistedCart(persisted, useCart.getState())).toMatchObject({ ownerId: 'u2', items: [], details: {} })

    vi.mocked(getCurrentUser).mockReturnValue(null)
    const loggedOut = mergePersistedCart(persisted, useCart.getState())
    expect(loggedOut).toMatchObject({ ownerId: null, items: [], details: {} })
    expect(loggedOut.linesByUser.u1).toHaveLength(1)
  })
})

