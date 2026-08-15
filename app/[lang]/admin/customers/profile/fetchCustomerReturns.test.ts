import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReturnsStore } from '@/lib/returns-store'
import { fetchCustomerReturns } from './fetchCustomerReturns'

describe('fetchCustomerReturns', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Simulate opening the customer profile page cold — i.e. the admin never
    // visited /admin/returns in this session/tab, so the global returns store
    // (only ever hydrated by that page's own effect) starts empty.
    useReturnsStore.setState({ returns: [] })
  })

  it('returns real data for the customer even though useReturnsStore starts empty', async () => {
    const serverRow = {
      id: 'r1',
      orderId: 'o1',
      createdAt: '2026-01-05T00:00:00.000Z',
      status: 'pending',
      reason: 'defective',
      comment: null,
      items: [{ productId: 'p1', title: 'Shampoo', quantity: 1, price: 12.5 }],
      refundAmount: 12.5,
      firstName: 'Anna',
      lastName: 'Client',
      email: 'customer@example.com',
      phone: '+371000',
      resolution: null,
      resolvedAt: null,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ returns: [serverRow] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    // The global store never gets touched by this call — proving the tab does
    // not depend on it being pre-populated by /admin/returns.
    expect(useReturnsStore.getState().returns).toHaveLength(0)

    const result = await fetchCustomerReturns('customer@example.com')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/returns?email=customer%40example.com&take=200'
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'r1', email: 'customer@example.com', refundAmount: 12.5 })
    expect(result[0].createdAt).toBeInstanceOf(Date)

    // Still untouched — this helper never wrote into the shared store.
    expect(useReturnsStore.getState().returns).toHaveLength(0)
  })

  it('returns an empty array when the response has no returns array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    const result = await fetchCustomerReturns('nobody@example.com')
    expect(result).toEqual([])
  })

  it('throws when the request fails so callers can surface an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(fetchCustomerReturns('customer@example.com')).rejects.toThrow('HTTP 500')
  })
})
