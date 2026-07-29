import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'u1', email: 'a@b.com' })),
}))

import { hydrateWishlistFromServer, useWishlist } from './wishlist-store'
import { getCurrentUser } from '@/lib/auth'

function makeLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', makeLocalStorageMock())
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1', email: 'a@b.com' } as never)
  useWishlist.setState({ currentScope: 'u1', idsByScope: {}, productCache: {}, items: [] })
})

describe('hydrateWishlistFromServer', () => {
  it('fetches the saved product ids, resolves them to products, and populates the store', async () => {
    const product = { id: 'p1', title: 'Shampoo', brand: 'X', price: 10, category: 'hair' }
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === '/api/wishlist') return { ok: true, json: async () => ({ productIds: ['p1'] }) } as Response
      if (url === '/api/products/p1') return { ok: true, json: async () => ({ product }) } as Response
      throw new Error(`unexpected fetch ${url}`)
    })

    await hydrateWishlistFromServer()

    const state = useWishlist.getState()
    expect(state.items).toEqual([product])
    expect(state.isInWishlist('p1')).toBe(true)
  })

  it('silently drops ids for products that no longer exist', async () => {
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === '/api/wishlist') return { ok: true, json: async () => ({ productIds: ['gone'] }) } as Response
      if (url === '/api/products/gone') return { ok: false, status: 404 } as Response
      throw new Error(`unexpected fetch ${url}`)
    })

    await hydrateWishlistFromServer()

    expect(useWishlist.getState().items).toEqual([])
  })

  it('does nothing for guests', async () => {
    vi.mocked(getCurrentUser).mockReturnValue(null)
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ productIds: ['p1'] }) } as Response)

    await hydrateWishlistFromServer()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('leaves the store untouched when the request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await hydrateWishlistFromServer()

    expect(useWishlist.getState().items).toEqual([])
  })
})
