import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/company-activity-log', () => ({ getCompanyActivityForAdmin: vi.fn() }))

import { requireAdminPermission } from '@/lib/server-auth'
import { getCompanyActivityForAdmin } from '@/lib/company-activity-log'
import { GET } from './route'

const get = (url: string) => GET(new NextRequest(url))

describe('GET /api/admin/customer-activity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the permission-check response as-is when unauthorized', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 })
    vi.mocked(requireAdminPermission).mockResolvedValue(denied)
    const res = await get('https://shop.test/api/admin/customer-activity')
    expect(res.status).toBe(403)
    expect(getCompanyActivityForAdmin).not.toHaveBeenCalled()
  })

  it('gates on customers.read and forwards the userId filter', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(getCompanyActivityForAdmin).mockResolvedValue([])
    await get('https://shop.test/api/admin/customer-activity?userId=user-a&take=10')
    expect(requireAdminPermission).toHaveBeenCalledWith('customers.read')
    expect(getCompanyActivityForAdmin).toHaveBeenCalledWith({ userId: 'user-a', take: 10 })
  })

  it('omits the userId filter for a global read', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(getCompanyActivityForAdmin).mockResolvedValue([])
    await get('https://shop.test/api/admin/customer-activity')
    expect(getCompanyActivityForAdmin).toHaveBeenCalledWith({ userId: undefined, take: 500 })
  })
})
