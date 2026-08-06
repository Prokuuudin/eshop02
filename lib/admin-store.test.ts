import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useAdminStore } from '@/lib/admin-store'

const originalFetch = global.fetch

beforeEach(() => {
  useAdminStore.setState({ orderStatuses: {}, orderNotes: {} })
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('loadOrderMeta', () => {
  it('loads status/notes for every id when there are more than 200 (batches the request)', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `order-${i}`)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const batchIds = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const statuses: Record<string, string> = {}
      for (const id of batchIds) statuses[id] = 'confirmed'
      return new Response(JSON.stringify({ statuses, notes: {} }), { status: 200 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await useAdminStore.getState().loadOrderMeta(ids)

    // One request per 200-id batch: 250 ids -> 2 requests (200 + 50).
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const { orderStatuses } = useAdminStore.getState()
    for (const id of ids) {
      expect(orderStatuses[id]).toBe('confirmed')
    }
  })

  it('makes a single request when there are 200 or fewer ids', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `order-${i}`)
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ statuses: { 'order-0': 'shipped' }, notes: {} }), { status: 200 })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await useAdminStore.getState().loadOrderMeta(ids)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAdminStore.getState().orderStatuses['order-0']).toBe('shipped')
  })

  it('does nothing for an empty id list', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await useAdminStore.getState().loadOrderMeta([])

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps results from a successful batch even if another batch fails', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `order-${i}`)
    let call = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      call++
      if (call === 2) return new Response('server error', { status: 500 })
      const url = new URL(String(input), 'http://localhost')
      const batchIds = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const statuses: Record<string, string> = {}
      for (const id of batchIds) statuses[id] = 'delivered'
      return new Response(JSON.stringify({ statuses, notes: {} }), { status: 200 })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await useAdminStore.getState().loadOrderMeta(ids)

    expect(useAdminStore.getState().orderStatuses['order-0']).toBe('delivered')
  })
})
