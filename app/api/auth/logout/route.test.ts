import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  SESSION_COOKIE: 'session',
}))
vi.mock('@/lib/company-activity-log', () => ({ recordCompanyActivity: vi.fn().mockResolvedValue(undefined) }))

import { getServerUser, deleteSession } from '@/lib/server-auth'
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
    expect(deleteSession).toHaveBeenCalledWith('token-abc')
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
    expect(deleteSession).toHaveBeenCalledWith('token-abc')
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no session cookie', async () => {
    const res = await POST(new NextRequest('https://shop.test/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(deleteSession).not.toHaveBeenCalled()
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })
})
