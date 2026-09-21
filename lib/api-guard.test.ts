import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { NextRequest } from 'next/server'
import { guardCookieAuthenticatedApiMutation, guardOrigin } from './api-guard'

function makeRequest(opts: {
  method: string
  origin?: string
  referer?: string
  apiKey?: string
  cookie?: string
  url?: string
}): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.origin) headers.origin = opts.origin
  if (opts.referer) headers.referer = opts.referer
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey
  if (opts.cookie) headers.cookie = opts.cookie
  return new NextRequest(opts.url ?? 'https://shop.test/api/user/password', {
    method: opts.method,
    headers,
  })
}

describe('guardOrigin', () => {
  it('allows non-mutating methods through regardless of Origin', () => {
    const req = makeRequest({ method: 'GET' })
    expect(guardOrigin(req)).toBeNull()
  })

  it('allows a matching same-origin Origin header', () => {
    const req = makeRequest({ method: 'POST', origin: 'https://shop.test' })
    expect(guardOrigin(req)).toBeNull()
  })

  it('falls back to Referer when Origin is absent', () => {
    const req = makeRequest({ method: 'POST', referer: 'https://shop.test/checkout' })
    expect(guardOrigin(req)).toBeNull()
  })

  it('rejects a cross-site Origin', async () => {
    const req = makeRequest({ method: 'POST', origin: 'https://evil.test' })
    const res = guardOrigin(req)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    expect(await res!.json()).toEqual({ error: 'Origin not allowed' })
  })

  it('rejects a mutating request with neither Origin nor Referer (fail closed)', () => {
    const req = makeRequest({ method: 'POST' })
    const res = guardOrigin(req)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('only exempts API-key requests when the route explicitly opts in', () => {
    const req = makeRequest({ method: 'POST', origin: 'https://evil.test', apiKey: 'some-key' })
    expect(guardOrigin(req)).not.toBeNull()
    expect(guardOrigin(req, { allowApiKey: true })).toBeNull()
  })

  it('rejects DELETE with a mismatched Origin', () => {
    const req = makeRequest({ method: 'DELETE', origin: 'https://evil.test' })
    const res = guardOrigin(req)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  describe('behind a reverse proxy in production (Plesk/iisnode)', () => {
    afterEach(() => vi.unstubAllEnvs())

    it('allows a same-origin POST when the TLS-terminating proxy makes Next see plain http', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hairshoppro.lv')
      // server.js is a plain node:http server behind IIS/iisnode: IIS terminates TLS and
      // forwards over a named pipe, so Next builds nextUrl from an unencrypted connection
      // even though the browser actually connected over https.
      const req = makeRequest({
        method: 'POST',
        origin: 'https://hairshoppro.lv',
        url: 'http://hairshoppro.lv/api/user/password',
      })
      expect(guardOrigin(req)).toBeNull()
    })

    it('still rejects a cross-site Origin even with NEXT_PUBLIC_SITE_URL configured', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hairshoppro.lv')
      const req = makeRequest({
        method: 'POST',
        origin: 'https://evil.test',
        url: 'http://hairshoppro.lv/api/user/password',
      })
      const res = guardOrigin(req)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(403)
    })

    it('ignores NEXT_PUBLIC_SITE_URL outside production, so a stale value cannot widen dev/test', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://hairshoppro.lv')
      const req = makeRequest({
        method: 'POST',
        origin: 'https://hairshoppro.lv',
        url: 'http://shop.test/api/user/password',
      })
      const res = guardOrigin(req)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(403)
    })
  })
})

describe('guardCookieAuthenticatedApiMutation', () => {
  it('centrally rejects a cross-site API mutation carrying a session cookie', () => {
    const req = makeRequest({
      method: 'PATCH',
      origin: 'https://evil.test',
      cookie: 'eshop_session=secret',
      url: 'https://shop.test/api/admin/products',
    })
    expect(guardCookieAuthenticatedApiMutation(req)?.status).toBe(403)
  })

  it('allows the same cookie-authenticated mutation from the application origin', () => {
    const req = makeRequest({
      method: 'DELETE',
      origin: 'https://shop.test',
      cookie: 'eshop_session=secret',
      url: 'https://shop.test/api/user/addresses/1',
    })
    expect(guardCookieAuthenticatedApiMutation(req)).toBeNull()
  })

  it('does not apply browser CSRF checks to cookieless webhook/API calls', () => {
    const req = makeRequest({
      method: 'POST',
      url: 'https://shop.test/api/payments/provider/webhook',
    })
    expect(guardCookieAuthenticatedApiMutation(req)).toBeNull()
  })
})
