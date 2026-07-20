import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { NextRequest } from 'next/server'
import { guardOrigin } from './api-guard'

function makeRequest(opts: {
  method: string
  origin?: string
  referer?: string
  apiKey?: string
  url?: string
}): NextRequest {
  const headers: Record<string, string> = {}
  if (opts.origin) headers.origin = opts.origin
  if (opts.referer) headers.referer = opts.referer
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey
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

  it('exempts API-key authenticated requests even cross-site', () => {
    const req = makeRequest({ method: 'POST', origin: 'https://evil.test', apiKey: 'some-key' })
    expect(guardOrigin(req)).toBeNull()
  })

  it('rejects DELETE with a mismatched Origin', () => {
    const req = makeRequest({ method: 'DELETE', origin: 'https://evil.test' })
    const res = guardOrigin(req)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })
})
