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
  it('fetches the saved product ids and resolves them all in a single batched request', async () => {
    const product = { id: 'p1', title: 'Shampoo', brand: 'X', price: 10, category: 'hair' }
    let productsCallCount = 0
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === '/api/wishlist') return { ok: true, json: async () => ({ productIds: ['p1', 'p2'] }) } as Response
      if (String(url).startsWith('/api/products?ids=')) {
        productsCallCount += 1
        expect(String(url)).toBe('/api/products?ids=p1,p2')
        return { ok: true, json: async () => ({ data: { products: [product] } }) } as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    })

    await hydrateWishlistFromServer()

    const state = useWishlist.getState()
    expect(productsCallCount).toBe(1) // one request, not one per wishlisted product
    expect(state.items).toEqual([product])
    expect(state.isInWishlist('p1')).toBe(true)
  })

  it('silently drops ids for products the batch endpoint no longer returns', async () => {
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      if (url === '/api/wishlist') return { ok: true, json: async () => ({ productIds: ['gone'] }) } as Response
      if (String(url).startsWith('/api/products?ids=')) return { ok: true, json: async () => ({ data: { products: [] } }) } as Response
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
