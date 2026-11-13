import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), resetRateLimit: vi.fn() }))

import { setSessionCookie } from './mfa-challenge'

function setCookieHeader(user: { platformRole?: string; teamRole?: string }): string {
  const res = NextResponse.json({ ok: true })
  setSessionCookie(res, 'tok', user)
  return res.headers.get('set-cookie') ?? ''
}

describe('setSessionCookie', () => {
  it('issues a browser session cookie to staff after MFA: no Max-Age, no Expires', () => {
    for (const user of [{ platformRole: 'admin' }, { platformRole: 'customer', teamRole: 'manager' }]) {
      const header = setCookieHeader(user)
      expect(header).toContain('eshop_session=tok')
      expect(header.toLowerCase()).toContain('httponly')
      expect(header.toLowerCase()).toContain('samesite=lax')
      expect(header).not.toMatch(/max-age/i)
      expect(header).not.toMatch(/expires=/i)
    }
  })

  it('keeps the persistent 30-day cookie for customers', () => {
    expect(setCookieHeader({ platformRole: 'customer' })).toMatch(/Max-Age=2592000/i)
  })
})
