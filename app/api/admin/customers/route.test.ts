import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerUserMock, getCustomerPageMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(), getCustomerPageMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/admin/customer-segments', () => ({
  CUSTOMER_SEGMENTS: ['vip', 'regular', 'new', 'inactive'], getCustomerPage: getCustomerPageMock,
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue({ id: 'admin', platformRole: 'admin' })
  getCustomerPageMock.mockResolvedValue({ customers: [], total: 0, page: 1, pageSize: 50, totalPages: 1,
    counts: { vip: 0, regular: 0, new: 0, inactive: 0 } })
})

describe('GET /api/admin/customers', () => {
  it('rejects non-admins before querying customers', async () => {
    getServerUserMock.mockResolvedValue(null)
    expect((await GET(new NextRequest('https://shop.test/api/admin/customers'))).status).toBe(403)
    expect(getCustomerPageMock).not.toHaveBeenCalled()
  })

  it('passes validated pagination, search, segment and sorting to the database query', async () => {
    await GET(new NextRequest('https://shop.test/api/admin/customers?page=3&pageSize=75&search=Anna&segment=vip&sort=totalSpent&direction=asc'))
    expect(getCustomerPageMock).toHaveBeenCalledWith({ page: 3, pageSize: 75, search: 'Anna', email: undefined,
      segment: 'vip', sort: 'totalSpent', direction: 'asc' })
  })

  it('caps page size and supports an exact email lookup for the profile page', async () => {
    await GET(new NextRequest('https://shop.test/api/admin/customers?pageSize=999&email=User%40Example.com'))
    expect(getCustomerPageMock).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100, email: 'User@Example.com' }))
  })

  it('falls back safely for unsupported query values', async () => {
    await GET(new NextRequest('https://shop.test/api/admin/customers?page=-1&pageSize=bad&segment=other&sort=name&direction=sideways'))
    expect(getCustomerPageMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50, segment: undefined,
      sort: 'lastOrderDate', direction: 'desc' }))
  })
})
