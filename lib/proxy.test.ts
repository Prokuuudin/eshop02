import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { guard } = vi.hoisted(() => ({ guard: vi.fn<() => NextResponse | null>() }))
vi.mock('@/lib/api-guard', () => ({ guardCookieAuthenticatedApiMutation: guard }))

import { proxy } from '../proxy'

const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://hairshop-pro.lv${path}`, init)

describe('proxy', () => {
  beforeEach(() => guard.mockReset().mockReturnValue(null))

  it('strips the explicit default-language prefix permanently', () => {
    const response = proxy(request('/ru/catalog?brand=test'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://hairshop-pro.lv/catalog?brand=test')
  })

  it('honours a persisted non-default language', () => {
    const response = proxy(request('/catalog', { headers: { cookie: 'eshop_language=lv' } }))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://hairshop-pro.lv/lv/catalog')
  })

  it('rewrites an unprefixed default-language URL', () => {
    const response = proxy(request('/catalog'))
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://hairshop-pro.lv/ru/catalog')
  })

  it('propagates a valid API correlation id', () => {
    const response = proxy(request('/api/products', { headers: { 'x-correlation-id': 'request-1234' } }))
    expect(response.headers.get('x-correlation-id')).toBe('request-1234')
    expect(guard).toHaveBeenCalledOnce()
  })

  it('returns an origin-guard response with a correlation id', () => {
    guard.mockReturnValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const response = proxy(request('/api/orders', { method: 'POST' }))
    expect(response.status).toBe(403)
    expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u)
  })
})
