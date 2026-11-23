import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { B2B_ONLY_ROUTE_PREFIXES, guardShopChannelRoute, isB2bOnlyRoute, normalizeRoutePath } from '@/lib/shop-channel-routes'

const APP_DIR = path.join(process.cwd(), 'app')

/** URL paths of every page/route file under an app directory ([param] → sample value). */
function routePaths(relativeDir: string, urlPrefix: string): string[] {
  const root = path.join(APP_DIR, relativeDir)
  const out = new Set<string>()
  const walk = (dir: string, url: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        const segment = entry.startsWith('[') ? 'sample-id' : entry
        walk(full, `${url}/${segment}`)
      } else if (/^(page|route)\.tsx?$/.test(entry)) {
        out.add(url || '/')
      }
    }
  }
  walk(root, urlPrefix)
  return [...out]
}

const ADMIN_PAGES = routePaths('[lang]/admin', '/admin')
const B2B_API = [
  ...routePaths('api/admin', '/api/admin'),
  ...routePaths('api/v1', '/api/v1'),
  ...routePaths('api/rfq', '/api/rfq'),
  ...routePaths('api/internal', '/api/internal'),
  ...routePaths('api/auth/admin-setup', '/api/auth/admin-setup'),
]
const B2B_PAGES = [...ADMIN_PAGES, '/request-quote', '/auth/admin-setup']
const LANG_PREFIXES = ['', '/ru', '/lv', '/en']

const req = (pathOrUrl: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(pathOrUrl.startsWith('http') ? pathOrUrl : `https://hairshop.lv${pathOrUrl}`, init)

describe('route inventory', () => {
  it('finds the real B2B route files (guards against an empty walk)', () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(20)
    expect(B2B_API.length).toBeGreaterThan(50)
    expect(B2B_API).toContain('/api/v1/orders')
    expect(B2B_API).toContain('/api/internal/hairshop-catalog-sync')
    expect(B2B_API).toContain('/api/rfq/sample-id')
  })
})

describe('isB2bOnlyRoute', () => {
  it.each(B2B_PAGES.flatMap((page) => LANG_PREFIXES.map((prefix) => `${prefix}${page}`)))('blocks page %s', (pathname) => {
    expect(isB2bOnlyRoute(pathname)).toBe(true)
  })

  it.each(B2B_API)('blocks API %s', (pathname) => {
    expect(isB2bOnlyRoute(pathname)).toBe(true)
  })

  it.each([
    '/ADMIN', '/Lv/Admin/orders', '/admin/', '//admin', '/lv//admin', '/api//admin/orders',
    '/%61dmin', '/lv/%2561dmin', '/api/%61dmin/orders', '/api%2Fadmin%2Forders', '/api\\admin',
    '/catalog/../admin', '/lv/./admin', '/api/v1/../v1/orders', '/lv/en/admin',
    '/api/V1/products', '/api/internal/hairshop-catalog-sync/taxonomy', '/request-quote/',
    '/admin/products/abc.def', '/%E0%A4%A',
  ])('blocks bypass variant %s', (pathname) => {
    expect(isB2bOnlyRoute(pathname)).toBe(true)
  })

  it.each([
    '/', '/lv', '/catalog', '/lv/catalog', '/product/123', '/cart', '/checkout', '/account', '/account/invoices',
    '/auth/login', '/auth/register', '/administrator', '/admin-help', '/request-quotes',
    '/api/products', '/api/orders', '/api/search', '/api/auth/login', '/api/auth/me', '/api/health',
    '/api/webhooks/paysera', '/api/v10', '/api/internals', '/api/rfq-public', '/blog/admin-tips',
  ])('leaves storefront path %s alone', (pathname) => {
    expect(isB2bOnlyRoute(pathname)).toBe(false)
  })

  it('normalises to an unprefixed lower-case path', () => {
    expect(normalizeRoutePath('/LV/%41dmin//Orders/')).toBe('/admin/orders')
    expect(normalizeRoutePath('/%E0%A4%A')).toBeNull()
  })

  it('every prefix is unprefixed, lower-case and normalised', () => {
    for (const prefix of B2B_ONLY_ROUTE_PREFIXES) expect(normalizeRoutePath(prefix)).toBe(prefix)
  })
})

describe('guardShopChannelRoute', () => {
  it('never blocks anything in a B2B deployment', () => {
    for (const pathname of [...B2B_PAGES, ...B2B_API, '/catalog']) {
      expect(guardShopChannelRoute(req(pathname), 'b2b')).toBeNull()
    }
  })

  it('answers B2B API routes with a JSON 404 in a B2C deployment', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const response = guardShopChannelRoute(req('/api/admin/orders', { method }), 'b2c')
      expect(response?.status).toBe(404)
      expect(response?.headers.get('cache-control')).toBe('no-store')
    }
    const response = guardShopChannelRoute(req('/api/v1/products', { headers: { 'x-api-key': 'k' } }), 'b2c')
    expect(await response?.json()).toEqual({ error: 'not_found' })
  })

  it('answers B2B pages with a plain 404 in a B2C deployment', async () => {
    const response = guardShopChannelRoute(req('/lv/admin/orders'), 'b2c')
    expect(response?.status).toBe(404)
    expect(await response?.text()).toBe('Not Found')
  })

  it('lets storefront routes through in a B2C deployment', () => {
    expect(guardShopChannelRoute(req('/lv/catalog'), 'b2c')).toBeNull()
    expect(guardShopChannelRoute(req('/api/products'), 'b2c')).toBeNull()
  })
})
