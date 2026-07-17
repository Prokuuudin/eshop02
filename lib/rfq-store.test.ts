import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRFQStore } from './rfq-store'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  useRFQStore.setState({ requests: new Map() })
})

const seedRequest = (id: string) => {
  useRFQStore.setState({
    requests: new Map([[id, {
      id,
      companyId: 'company_1',
      items: [{ productId: 'p1', quantity: 5 }],
      notes: '',
      status: 'pending',
      timeline: [{ at: new Date(), type: 'created' }],
      createdAt: new Date(),
      updatedAt: new Date(),
    }]]),
  })
}

describe('createRequest', () => {
  it('resolves true and keeps the request when the server accepts it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const { id, ok } = await useRFQStore.getState().createRequest({
      companyId: 'company_1',
      items: [{ productId: 'p1', quantity: 5 }],
      notes: '',
    })

    expect(ok).toBe(true)
    expect(useRFQStore.getState().getRequest(id)).toBeDefined()
  })

  it('resolves false and rolls back the optimistic request when the server rejects it', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    const { id, ok } = await useRFQStore.getState().createRequest({
      companyId: 'company_1',
      items: [{ productId: 'p1', quantity: 5 }],
      notes: '',
    })

    expect(ok).toBe(false)
    expect(useRFQStore.getState().getRequest(id)).toBeUndefined()
  })

  it('resolves false and rolls back on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const { id, ok } = await useRFQStore.getState().createRequest({
      companyId: 'company_1',
      items: [{ productId: 'p1', quantity: 5 }],
      notes: '',
    })

    expect(ok).toBe(false)
    expect(useRFQStore.getState().getRequest(id)).toBeUndefined()
  })
})

describe('setStatus', () => {
  it('rolls back to the previous status when the server call fails', async () => {
    seedRequest('rfq_1')
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    const ok = await useRFQStore.getState().setStatus('rfq_1', 'accepted')

    expect(ok).toBe(false)
    expect(useRFQStore.getState().getRequest('rfq_1')?.status).toBe('pending')
  })
})

describe('setQuote', () => {
  it('rolls back to having no quote when the server call fails', async () => {
    seedRequest('rfq_1')
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    const ok = await useRFQStore.getState().setQuote('rfq_1', {
      totalPrice: 100,
      terms: 'net 30',
      validUntil: new Date(),
    })

    expect(ok).toBe(false)
    expect(useRFQStore.getState().getRequest('rfq_1')?.quote).toBeUndefined()
    expect(useRFQStore.getState().getRequest('rfq_1')?.status).toBe('pending')
  })
})

describe('addNote', () => {
  it('rolls back the timeline entry when the server call fails', async () => {
    seedRequest('rfq_1')
    const before = useRFQStore.getState().getRequest('rfq_1')?.timeline.length
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    const ok = await useRFQStore.getState().addNote('rfq_1', 'a note')

    expect(ok).toBe(false)
    expect(useRFQStore.getState().getRequest('rfq_1')?.timeline.length).toBe(before)
  })
})
