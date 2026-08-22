import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { userFindManyMock, userCountMock, requireAdminMock, readInvitationsMock, deriveStatusMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  userCountMock: vi.fn(),
  requireAdminMock: vi.fn(),
  readInvitationsMock: vi.fn(),
  deriveStatusMock: vi.fn(),
}))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: userFindManyMock, count: userCountMock } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({ buildInviteEmail: vi.fn(), pickInviteTemplate: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.test') }))
vi.mock('@/lib/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invitations')>()
  return { ...actual, readInvitations: readInvitationsMock, deriveStatus: deriveStatusMock }
})

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/invitations${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
  userFindManyMock.mockResolvedValue([])
  userCountMock.mockResolvedValue(0)
  readInvitationsMock.mockResolvedValue([])
})

describe('GET /api/admin/invitations', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('defaults to a 50-row page ordered by email, with no search filter', async () => {
    await GET(makeGetRequest())
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cardNumber: { not: null } },
        orderBy: { email: 'asc' },
        skip: 0,
        take: 50,
      })
    )
    expect(userCountMock).toHaveBeenCalledWith({ where: { cardNumber: { not: null } } })
  })

  it('applies search across name/email/phone/cardNumber and pagination params', async () => {
    await GET(makeGetRequest('?search=maija&skip=50&take=50&sort=name&dir=desc'))
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardNumber: { not: null },
          OR: [
            { name: { contains: 'maija', mode: 'insensitive' } },
            { email: { contains: 'maija', mode: 'insensitive' } },
            { phone: { contains: 'maija', mode: 'insensitive' } },
            { cardNumber: { contains: 'maija', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'desc' },
        skip: 50,
        take: 50,
      })
    )
  })

  it('bounds the invitation-token join to the fetched page emails and returns total', async () => {
    userFindManyMock.mockResolvedValue([
      { id: 'u1', name: 'Maija', email: 'Maija@Example.LV', phone: null, cardNumber: '1001' },
    ])
    userCountMock.mockResolvedValue(1)
    readInvitationsMock.mockResolvedValue([])
    deriveStatusMock.mockReturnValue('none')

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(readInvitationsMock).toHaveBeenCalledWith(expect.anything(), ['maija@example.lv'])
    expect(json.total).toBe(1)
    expect(json.holders).toEqual([
      { userId: 'u1', name: 'Maija', email: 'Maija@Example.LV', phone: null, cardNumber: '1001', status: 'none', sentAt: null, inviteUrl: null },
    ])
  })

  it('falls back to email sort for an unknown or status sort key', async () => {
    await GET(makeGetRequest('?sort=status'))
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { email: 'asc' } }))
  })
})
