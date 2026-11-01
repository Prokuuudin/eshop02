import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveLineItemsMock, evaluatePromoCampaignsMock, getServerUserMock } = vi.hoisted(() => ({
  resolveLineItemsMock: vi.fn(),
  evaluatePromoCampaignsMock: vi.fn(),
  getServerUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { marker: 'db' } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/server-pricing', () => ({ resolveLineItems: resolveLineItemsMock }))
vi.mock('@/lib/promo-campaigns', () => ({ evaluatePromoCampaigns: evaluatePromoCampaignsMock }))

import { POST } from './route'

describe('POST /api/promo/campaigns/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@example.com' })
    resolveLineItemsMock.mockResolvedValue([{ id: 'p1', quantity: 1, price: 10, fromCatalog: true }])
    evaluatePromoCampaignsMock.mockResolvedValue({
      campaignId: 'line-sale', discount: 2, eligibleAmount: 10, freeShipping: true,
    })
  })

  it('evaluates line campaigns from authoritative cart items', async () => {
    const response = await POST(new Request('http://localhost/api/promo/campaigns/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 'p1', quantity: 1, price: 0.01 }] }),
    }) as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      campaignId: 'line-sale', discount: 2, eligibleAmount: 10, freeShipping: true,
    })
    expect(resolveLineItemsMock).toHaveBeenCalledWith([{ id: 'p1', quantity: 1, price: 0.01 }], { marker: 'db' })
    expect(evaluatePromoCampaignsMock).toHaveBeenCalledWith(expect.any(Array), { marker: 'db' })
  })

  it('rejects guests before resolving any catalog price', async () => {
    getServerUserMock.mockResolvedValue(null)
    const response = await POST(new Request('http://localhost/api/promo/campaigns/evaluate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 'p1', quantity: 1 }] }),
    }) as never)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body).toEqual({ error: 'unauthorized' })
    expect(body).not.toHaveProperty('eligibleAmount')
    expect(body).not.toHaveProperty('discount')
    expect(resolveLineItemsMock).not.toHaveBeenCalled()
    expect(evaluatePromoCampaignsMock).not.toHaveBeenCalled()
  })
})
