import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveLineItemsMock, evaluatePromoCodeMock, getServerUserMock } = vi.hoisted(() => ({
  resolveLineItemsMock: vi.fn(),
  evaluatePromoCodeMock: vi.fn(),
  getServerUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { marker: 'db' } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/server-pricing', () => ({
  resolveLineItems: resolveLineItemsMock,
  evaluatePromoCode: evaluatePromoCodeMock,
}))

import { POST } from './route'

describe('POST /api/promo/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'user@example.com' })
    resolveLineItemsMock.mockResolvedValue([{ id: 'p1', quantity: 1, price: 10, fromCatalog: true }])
    evaluatePromoCodeMock.mockResolvedValue({ valid: true, discount: 2, eligibleAmount: 10, code: 'LINE20' })
  })

  it('uses authoritative resolved cart items for a line promo', async () => {
    const response = await POST(new Request('http://localhost/api/promo/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'LINE20', items: [{ id: 'p1', quantity: 1, price: 0.01 }] }),
    }) as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ valid: true, discount: 2, eligibleAmount: 10 })
    expect(resolveLineItemsMock).toHaveBeenCalledWith([{ id: 'p1', quantity: 1, price: 0.01 }], { marker: 'db' })
    expect(evaluatePromoCodeMock).toHaveBeenCalledWith('LINE20', expect.any(Array), {
      userId: 'u1', email: 'user@example.com',
    }, { marker: 'db' })
  })

  it('keeps request validation unchanged', async () => {
    const response = await POST(new Request('http://localhost/api/promo/validate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }),
    }) as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valid: false, error: 'code_required' })
    expect(resolveLineItemsMock).not.toHaveBeenCalled()
  })
})
