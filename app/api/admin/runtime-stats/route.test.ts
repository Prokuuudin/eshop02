import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { GET } from '@/app/api/admin/runtime-stats/route'

const request = (query = ''): NextRequest => new NextRequest(`http://localhost/api/admin/runtime-stats${query}`)
const holder = globalThis as { __eshopRuntimeStats?: { snapshot: (o?: unknown) => unknown } }

describe('GET /api/admin/runtime-stats', () => {
  beforeEach(() => { delete holder.__eshopRuntimeStats })
  afterEach(() => { delete holder.__eshopRuntimeStats })

  it.each([
    ['a guest', null],
    ['a customer', { id: 'c', platformRole: 'customer' }],
    ['a staff manager', { id: 'm', teamRole: 'manager' }],
  ])('refuses %s', async (_label, user) => {
    vi.mocked(getServerUser).mockResolvedValue(user as never)
    holder.__eshopRuntimeStats = { snapshot: vi.fn() }
    const res = await GET(request())
    expect(res.status).toBe(403)
    expect(holder.__eshopRuntimeStats.snapshot).not.toHaveBeenCalled()
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('returns the server.js snapshot to a platform admin with the requested window', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a', platformRole: 'admin' } as never)
    const snapshot = vi.fn().mockReturnValue({ available: true, window: { requests: 3 } })
    holder.__eshopRuntimeStats = { snapshot }
    const res = await GET(request('?minutes=15&top=5'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: true, window: { requests: 3 } })
    expect(snapshot).toHaveBeenCalledWith({ minutes: 15, top: 5 })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('reports unavailable when server.js is not collecting', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a', platformRole: 'admin' } as never)
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ available: false })
  })
})
