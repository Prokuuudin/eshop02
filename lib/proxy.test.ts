import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { guard } = vi.hoisted(() => ({ guard: vi.fn<() => NextResponse | null>() }))
vi.mock('@/lib/api-guard', () => ({ guardCookieAuthenticatedApiMutation: guard }))

import { proxy } from '../proxy'
import { ShopChannelConfigError } from '@/lib/shop-channel'

const request = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://hairshoppro.lv${path}`, init)

describe('proxy', () => {
  beforeEach(() => guard.mockReset().mockReturnValue(null))

  it('strips the explicit default-language prefix permanently', () => {
    const response = proxy(request('/ru/catalog?brand=test'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://hairshoppro.lv/catalog?brand=test')
  })

  it('honours a persisted non-default language', () => {
    const response = proxy(request('/catalog', { headers: { cookie: 'eshop_language=lv' } }))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://hairshoppro.lv/lv/catalog')
  })

  it('rewrites an unprefixed default-language URL', () => {
    const response = proxy(request('/catalog'))
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://hairshoppro.lv/ru/catalog')
  })

  it('saves an explicit /ru link as the language choice', () => {
    const response = proxy(request('/ru', { headers: { 'accept-language': 'lv-LV,lv;q=0.9' } }))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://hairshoppro.lv/')
    expect(response.cookies.get('eshop_language')?.value).toBe('ru')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['lv-LV,lv;q=0.9,en-US;q=0.8,en;q=0.7', '/lv'],
    ['en-US,en;q=0.9', '/en'],
    ['de-DE,de;q=0.9', '/lv'],
  ])('redirects a first visit with Accept-Language %s to %s before rendering', (acceptLanguage, prefix) => {
    const response = proxy(request('/', { headers: { 'accept-language': acceptLanguage } }))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://hairshoppro.lv${prefix}`)
  })

  it('serves a first visit from a Russian browser in Russian without a redirect', () => {
    const response = proxy(request('/catalog', { headers: { 'accept-language': 'ru-RU,ru;q=0.9,lv;q=0.8' } }))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://hairshoppro.lv/ru/catalog')
  })

  it('prefers the saved language over the browser language', () => {
    const saved = proxy(request('/', { headers: { cookie: 'eshop_language=ru', 'accept-language': 'lv' } }))
    expect(saved.headers.get('location')).toBeNull()
    expect(saved.headers.get('x-middleware-rewrite')).toBe('https://hairshoppro.lv/ru')

    const savedEn = proxy(request('/', { headers: { cookie: 'eshop_language=en', 'accept-language': 'ru' } }))
    expect(savedEn.headers.get('location')).toBe('https://hairshoppro.lv/en')
  })

  it.each(['/lv/catalog', '/en'])('never overrides an explicit %s URL', (path) => {
    const response = proxy(request(path, { headers: { cookie: 'eshop_language=ru', 'accept-language': 'ru' } }))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
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

describe('proxy shop channel', () => {
  beforeEach(() => guard.mockReset().mockReturnValue(null))
  afterEach(() => vi.unstubAllEnvs())

  const spoofB2b = {
    headers: {
      'x-shop-channel': 'b2b',
      'x-forwarded-host': 'hairshoppro.lv',
      host: 'hairshoppro.lv',
      cookie: 'shop_channel=b2b; SHOP_CHANNEL=b2b',
    },
  }
  const spoofB2c = {
    headers: { 'x-shop-channel': 'b2c', 'x-forwarded-host': 'hairshop.lv', cookie: 'shop_channel=b2c; SHOP_CHANNEL=b2c' },
  }

  it.each([undefined, '', 'b2b'])('SHOP_CHANNEL=%j keeps the B2B routes served exactly as before', (value) => {
    if (value !== undefined) vi.stubEnv('SHOP_CHANNEL', value)
    expect(proxy(request('/admin/orders')).headers.get('x-middleware-rewrite')).toBe('https://hairshoppro.lv/ru/admin/orders')
    expect(proxy(request('/lv/admin')).status).toBe(200)
    expect(proxy(request('/ru/admin')).status).toBe(308)
    const api = proxy(request('/api/admin/orders', { headers: { 'x-correlation-id': 'request-1234' } }))
    expect(api.status).toBe(200)
    expect(api.headers.get('x-correlation-id')).toBe('request-1234')
    expect(guard).toHaveBeenCalledOnce()
  })

  it('a request cannot switch a B2B deployment to B2C', () => {
    vi.stubEnv('SHOP_CHANNEL', 'b2b')
    expect(proxy(request('/api/v1/orders?channel=b2c&SHOP_CHANNEL=b2c', spoofB2c)).status).toBe(200)
    expect(proxy(new NextRequest('https://hairshop.lv/lv/admin', spoofB2c)).status).toBe(200)
  })

  it.each([
    '/admin', '/lv/admin', '/en/admin/orders', '/ru/admin', '/request-quote', '/lv/request-quote',
    '/auth/admin-setup', '/api/admin/orders', '/api/v1/products', '/api/rfq', '/api/internal/hairshop-catalog-sync',
    '/api/auth/admin-setup',
  ])('B2C deployment answers 404 for %s before any other handling', (path) => {
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    const response = proxy(request(path, { method: path.startsWith('/api/') ? 'POST' : 'GET' }))
    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(guard).not.toHaveBeenCalled()
  })

  it('a request cannot switch a B2C deployment back to B2B (headers, cookies, query, host)', () => {
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    expect(proxy(request('/api/admin/orders?channel=b2b&SHOP_CHANNEL=b2b', spoofB2b)).status).toBe(404)
    expect(proxy(new NextRequest('https://hairshoppro.lv/lv/admin?channel=b2b', spoofB2b)).status).toBe(404)
    expect(proxy(request('/api/v1/orders', { ...spoofB2b, headers: { ...spoofB2b.headers, 'x-api-key': 'key' } })).status).toBe(404)
  })

  it('B2C deployment still serves the storefront', () => {
    vi.stubEnv('SHOP_CHANNEL', 'b2c')
    expect(proxy(request('/catalog')).headers.get('x-middleware-rewrite')).toBe('https://hairshoppro.lv/ru/catalog')
    expect(proxy(request('/api/products')).status).toBe(200)
  })

  it('an unknown SHOP_CHANNEL fails every request with a configuration error', () => {
    vi.stubEnv('SHOP_CHANNEL', 'retail')
    expect(() => proxy(request('/catalog'))).toThrow(ShopChannelConfigError)
    expect(() => proxy(request('/api/products'))).toThrow(/Invalid SHOP_CHANNEL/)
  })
})
