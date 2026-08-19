import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReturnsStore, type ReturnRequest } from './returns-store'

const draft: ReturnRequest = {
  id: 'local-temp',
  orderId: 'order_1',
  createdAt: new Date(),
  status: 'pending',
  reason: 'defective',
  comment: 'broken on arrival',
  items: [{ productId: 'p1', title: 'Shampoo', quantity: 1, price: 10 }],
  refundAmount: 10,
  firstName: 'Ivan',
  lastName: 'Ivanov',
  email: 'a@b.com',
  phone: '+371',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  useReturnsStore.setState({ returns: [] })
})

describe('addReturn', () => {
  it('keeps the request and resolves ok when the server accepts it', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ returnId: 'srv_1' }),
    } as Response)

    const res = await useReturnsStore.getState().addReturn(draft)

    expect(res.ok).toBe(true)
    expect(useReturnsStore.getState().returns).toHaveLength(1)
  })

  it('rolls back the optimistic entry and reports the server error code on rejection', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'quantity_exceeds_order' }),
    } as Response)

    const res = await useReturnsStore.getState().addReturn(draft)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('quantity_exceeds_order')
    expect(useReturnsStore.getState().returns).toHaveLength(0)
  })

  it('rolls back on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const res = await useReturnsStore.getState().addReturn(draft)

    expect(res.ok).toBe(false)
    expect(useReturnsStore.getState().returns).toHaveLength(0)
  })
})

describe('setReturnStatus', () => {
  it('rolls back the optimistic status when the server rejects the update', async () => {
    useReturnsStore.setState({ returns: [draft] })
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'server_error' }),
    } as Response)

    const result = await useReturnsStore.getState().setReturnStatus(draft.id, 'approved')

    expect(result).toEqual({ ok: false, error: 'server_error' })
    expect(useReturnsStore.getState().returns[0].status).toBe('pending')
  })
})
