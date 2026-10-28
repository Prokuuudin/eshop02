import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { userFindManyMock, userCountMock, invitationDeliveryFindManyMock, requireAdminMock, readInvitationsMock, deriveStatusMock, transactionMock, replaceInvitationMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  userCountMock: vi.fn(),
  invitationDeliveryFindManyMock: vi.fn(),
  requireAdminMock: vi.fn(),
  readInvitationsMock: vi.fn(),
  deriveStatusMock: vi.fn(),
  transactionMock: vi.fn(),
  replaceInvitationMock: vi.fn(),
}))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: userFindManyMock, count: userCountMock },
    invitationDelivery: { findMany: invitationDeliveryFindManyMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({ buildInviteEmail: vi.fn(), pickInviteTemplate: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.test') }))
vi.mock('@/lib/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invitations')>()
  return { ...actual, readInvitations: readInvitationsMock, deriveStatus: deriveStatusMock, replaceInvitation: replaceInvitationMock }
})

import { GET, POST } from './route'
import { buildInviteEmail } from '@/lib/invitation-emails'
import { sendEmail } from '@/lib/mailer'

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
  invitationDeliveryFindManyMock.mockResolvedValue([])
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
        where: { cardNumber: { not: null }, privacyAcknowledgedAt: null },
        orderBy: { email: 'asc' },
        skip: 0,
        take: 50,
      })
    )
    expect(userCountMock).toHaveBeenCalledWith({ where: { cardNumber: { not: null }, privacyAcknowledgedAt: null } })
  })

  it('applies search across name/email/phone/cardNumber and pagination params', async () => {
    await GET(makeGetRequest('?search=maija&skip=50&take=50&sort=name&dir=desc'))
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardNumber: { not: null },
          privacyAcknowledgedAt: null,
          AND: [
            { OR: [
              { name: { contains: 'maija', mode: 'insensitive' } },
              { email: { contains: 'maija', mode: 'insensitive' } },
              { phone: { contains: 'maija', mode: 'insensitive' } },
              { cardNumber: { contains: 'maija', mode: 'insensitive' } },
            ] },
          ],
        },
        orderBy: { name: 'desc' },
        skip: 50,
        take: 50,
      })
    )
  })

  it('combines contact and invitation filters and excludes registered clients', async () => {
    await GET(makeGetRequest('?contact=phoneOnly&invitation=notInvited'))
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        cardNumber: { not: null },
        privacyAcknowledgedAt: null,
        AND: [
          { OR: [
            { email: { endsWith: '@client.local' } },
            { email: { endsWith: '@deleted.invalid' } },
          ] },
          { phone: { not: null }, NOT: { phone: '' } },
          { invitationTokens: { none: {} } },
        ],
      },
    }))
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

describe('POST /api/admin/invitations', () => {
  it('never issues a card invitation to a staff account, only to customers', async () => {
    transactionMock.mockImplementation(async (fn) => fn({}))
    vi.mocked(buildInviteEmail).mockReturnValue({ subject: 'Invite', html: '<p>Invite</p>' })
    userFindManyMock.mockResolvedValue([
      { id: 'c1', name: 'Client', email: 'client@test.com', cardNumber: '1001', platformRole: 'customer', teamRole: null, superAdmin: false },
      { id: 'o1', name: 'Owner', email: 'owner@test.com', cardNumber: '1002', platformRole: 'customer', teamRole: 'admin', superAdmin: false },
      { id: 'a1', name: 'Admin', email: 'admin@test.com', cardNumber: '1003', platformRole: 'admin', teamRole: null, superAdmin: true },
      { id: 'm1', name: 'Manager', email: 'manager@test.com', cardNumber: '1004', platformRole: 'customer', teamRole: 'manager', superAdmin: false },
    ])

    const res = await POST(new NextRequest('http://localhost/api/admin/invitations', {
      method: 'POST', body: JSON.stringify({ userIds: ['c1', 'o1', 'a1', 'm1'] }),
    }))

    expect(res.status).toBe(200)
    expect(replaceInvitationMock.mock.calls.map(([, r]) => r.userId)).toEqual(['c1', 'o1'])
    expect(vi.mocked(sendEmail).mock.calls.map(([to]) => to)).toEqual(['client@test.com', 'owner@test.com'])
  })
})
