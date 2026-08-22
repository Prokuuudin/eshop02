import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { userFindManyMock, userCountMock, requireAdminMock, readCampaignMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  userCountMock: vi.fn(),
  requireAdminMock: vi.fn(),
  readCampaignMock: vi.fn(),
}))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: userFindManyMock, count: userCountMock } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({ buildRulesEmail: vi.fn() }))
vi.mock('@/lib/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invitations')>()
  return { ...actual, readCampaign: readCampaignMock }
})

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const DEFAULT_STATE = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
const ELIGIBLE_WHERE = {
  cardNumber: null,
  platformRole: { not: 'admin' },
  email: { contains: '@', not: { endsWith: '@client.local' } },
}

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/card-rules-campaign${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
  userFindManyMock.mockResolvedValue([])
  userCountMock.mockResolvedValue(0)
  readCampaignMock.mockResolvedValue(DEFAULT_STATE)
})

describe('GET /api/admin/card-rules-campaign', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('defaults to a 50-row page ordered by id asc, with no search filter', async () => {
    userCountMock.mockResolvedValue(38135)
    const res = await GET(makeGetRequest())
    const json = await res.json()
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: ELIGIBLE_WHERE,
        orderBy: { id: 'asc' },
        skip: 0,
        take: 50,
      })
    )
    expect(userCountMock).toHaveBeenNthCalledWith(1, { where: ELIGIBLE_WHERE })
    // No search filter — total reuses totalEligible instead of a second, redundant count query.
    expect(userCountMock).toHaveBeenCalledTimes(1)
    expect(json.total).toBe(38135)
    expect(json.totalEligible).toBe(38135)
  })

  it('applies search across name/email and pagination/sort params, keeping totalEligible unfiltered', async () => {
    await GET(makeGetRequest('?search=anna&skip=50&take=50&sort=name&dir=desc'))
    const expectedFilteredWhere = {
      ...ELIGIBLE_WHERE,
      OR: [
        { name: { contains: 'anna', mode: 'insensitive' } },
        { email: { contains: 'anna', mode: 'insensitive' } },
      ],
    }
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedFilteredWhere,
        orderBy: [{ name: 'desc' }, { id: 'asc' }],
        skip: 50,
        take: 50,
      })
    )
    // First count call is always the unfiltered totalEligible; second is the filtered total.
    expect(userCountMock).toHaveBeenNthCalledWith(1, { where: ELIGIBLE_WHERE })
    expect(userCountMock).toHaveBeenNthCalledWith(2, { where: expectedFilteredWhere })
  })

  it('returns state, the unfiltered totalEligible, the filtered total, and the page of users', async () => {
    readCampaignMock.mockResolvedValue({ ...DEFAULT_STATE, sentCount: 3 })
    userCountMock.mockResolvedValueOnce(38135).mockResolvedValueOnce(2)
    userFindManyMock.mockResolvedValue([
      { id: 'u1', name: 'Anna', email: 'anna@example.lv' },
      { id: 'u2', name: null, email: 'anna2@example.lv' },
    ])

    const res = await GET(makeGetRequest('?search=anna'))
    const json = await res.json()

    expect(json.state.sentCount).toBe(3)
    expect(json.totalEligible).toBe(38135)
    expect(json.total).toBe(2)
    expect(json.users).toEqual([
      { id: 'u1', name: 'Anna', email: 'anna@example.lv' },
      { id: 'u2', name: null, email: 'anna2@example.lv' },
    ])
  })

  it('falls back to id-asc order for an unknown sort key', async () => {
    await GET(makeGetRequest('?sort=bogus'))
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'asc' } }))
  })
})
