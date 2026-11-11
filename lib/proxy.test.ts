import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { guard } = vi.hoisted(() => ({ guard: vi.fn<() => NextResponse | null>() }))
vi.mock('@/lib/api-guard', () => ({ guardCookieAuthenticatedApiMutation: guard }))

import { proxy } from '../proxy'

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
