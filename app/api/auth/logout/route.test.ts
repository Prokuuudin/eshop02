import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  SESSION_COOKIE: 'session',
}))
vi.mock('@/lib/auth-session-audit', () => ({ createStaffSessionWithAudit: vi.fn(), recordRejectedStaffLogin: vi.fn(), revokeSessionWithAudit: vi.fn() }))
vi.mock('@/lib/company-activity-log', () => ({ recordCompanyActivity: vi.fn().mockResolvedValue(undefined) }))

import { getServerUser } from '@/lib/server-auth'
import { revokeSessionWithAudit } from '@/lib/auth-session-audit'
import { recordCompanyActivity } from '@/lib/company-activity-log'
import { POST } from './route'

function requestWithCookie(): NextRequest {
  const req = new NextRequest('https://shop.test/api/auth/logout', { method: 'POST' })
  req.cookies.set('session', 'token-abc')
  return req
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records a logout activity and deletes the session when audit logging is enabled', async () => {
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-a', email: 'a@example.com', companyId: 'company-a', auditLoggingEnabled: true,
    } as never)

    const res = await POST(requestWithCookie())
    expect(res.status).toBe(200)
    expect(revokeSessionWithAudit).toHaveBeenCalledWith(expect.any(NextRequest), 'token-abc')
    expect(recordCompanyActivity).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-a', userId: 'user-a', action: 'team_member_logout' })
    )
  })

  it('still deletes the session when audit logging is disabled, without recording activity', async () => {
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-b', email: 'b@example.com', companyId: 'company-b', auditLoggingEnabled: false,
    } as never)

    const res = await POST(requestWithCookie())
    expect(res.status).toBe(200)
    expect(revokeSessionWithAudit).toHaveBeenCalledWith(expect.any(NextRequest), 'token-abc')
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })

  it('revokes the server session before answering and expires the cookie immediately', async () => {
    const order: string[] = []
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', platformRole: 'admin' } as never)
    vi.mocked(revokeSessionWithAudit).mockImplementation(async () => {
      await Promise.resolve()
      order.push('revoked')
    })

    const res = await POST(requestWithCookie())
    order.push('responded')
    expect(order).toEqual(['revoked', 'responded'])
    expect(revokeSessionWithAudit).toHaveBeenCalledWith(expect.any(NextRequest), 'token-abc')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^session=;/)
    expect(setCookie).toMatch(/Max-Age=0/i)
  })

  it('is a no-op when there is no session cookie', async () => {
    const res = await POST(new NextRequest('https://shop.test/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(revokeSessionWithAudit).not.toHaveBeenCalled()
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })
})
