import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/company-activity-log', () => ({ getCompanyActivity: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { getCompanyActivity } from '@/lib/company-activity-log'
import { GET } from './route'

const get = (url = 'https://shop.test/api/account/audit-log') => GET(new NextRequest(url))

describe('GET /api/account/audit-log', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(401)
    expect(getCompanyActivity).not.toHaveBeenCalled()
  })

  it('returns 400 when the user has no company', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: undefined } as never)
    const res = await get()
    expect(res.status).toBe(400)
  })

  it("scopes the read to the caller's own companyId, never a client-supplied one", async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'company-a' } as never)
    vi.mocked(getCompanyActivity).mockResolvedValue([])
    // A malicious ?companyId= query param must be ignored - scoping comes only from the session.
    await get('https://shop.test/api/account/audit-log?companyId=company-b&take=50')
    expect(getCompanyActivity).toHaveBeenCalledWith('company-a', 50)
  })
})
