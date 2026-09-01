import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { queryRawMock, requireAdminPermissionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(), requireAdminPermissionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock } }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: requireAdminPermissionMock }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminPermissionMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
})

describe('GET /api/admin/analytics/cohorts', () => {
  it('normalizes customer email in both cohort queries', async () => {
    queryRawMock
      .mockResolvedValueOnce([{ cohort: new Date('2026-01-01T00:00:00Z'), size: 10 }, { cohort: new Date('2026-02-01T00:00:00Z'), size: 20 }])
      .mockResolvedValueOnce([{ cohort: new Date('2026-01-01T00:00:00Z'), offset: 1, count: 5 }, { cohort: new Date('2026-02-01T00:00:00Z'), offset: 1, count: 10 }])
    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/cohorts?months=24'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.months).toBe(24)
    expect(body.summary.m1).toBe(50)
    expect(body.summary.cohortGrowth).toBe(100)
    const sql = queryRawMock.mock.calls.map((call) => Array.from(call[0] as TemplateStringsArray).join(' ')).join(' ')
    expect(sql).toContain('lower(trim(email)) AS customer_email')
    expect(sql).toContain('lower(trim(o.email)) AS customer_email')
    expect(sql).toContain('COUNT(DISTINCT om.customer_email)')
  })

  it('compares the latest two completed cohorts for cohort growth', async () => {
    const now = new Date()
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const twoMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
    queryRawMock
      .mockResolvedValueOnce([
        { cohort: twoMonthsAgo, size: 10 },
        { cohort: previous, size: 20 },
        { cohort: current, size: 5 },
      ])
      .mockResolvedValueOnce([])

    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/cohorts?months=12'))
    const body = await response.json()

    expect(body.summary.cohortGrowth).toBe(100)
  })
})
