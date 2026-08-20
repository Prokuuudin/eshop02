import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { userUpdateMock, userFindFirstMock, getServerUserMock, companyMemberUpdateManyMock, savedAddressUpdateManyMock, savedAddressFindFirstMock } = vi.hoisted(() => ({
  userUpdateMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  getServerUserMock: vi.fn(),
  companyMemberUpdateManyMock: vi.fn(),
  savedAddressUpdateManyMock: vi.fn(),
  savedAddressFindFirstMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: userUpdateMock, findFirst: userFindFirstMock },
    companyMember: { updateMany: companyMemberUpdateManyMock },
    savedAddress: { updateMany: savedAddressUpdateManyMock, findFirst: savedAddressFindFirstMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
  SESSION_COOKIE: 'eshop_session',
}))

import { PATCH } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', cookie: 'eshop_session=tok', origin: 'http://localhost' },
  })
}

const SESSION_USER = { id: 'u1', email: 'user@test.com' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue(SESSION_USER)
  userFindFirstMock.mockResolvedValue(null)
  savedAddressFindFirstMock.mockResolvedValue(null)
  userUpdateMock.mockImplementation(async ({ data }) => ({
    id: 'u1',
    email: 'user@test.com',
    name: data.name ?? null,
    phone: data.phone ?? null,
    avatarUrl: data.avatarUrl ?? null,
    cardNumber: null,
  }))
})

describe('PATCH /api/user/profile', () => {
  it('never writes cardNumber from the client (card is set at registration only)', async () => {
    const res = await PATCH(makeRequest({ cardNumber: 'ZZ-AUDIT-TEST' }))

    expect(res.status).toBe(200)
    const updateArgs = userUpdateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data).not.toHaveProperty('cardNumber')
  })

  it('still updates safe personal fields', async () => {
    const res = await PATCH(makeRequest({ name: 'New Name', phone: '+37120000000' }))

    expect(res.status).toBe(200)
    const updateArgs = userUpdateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data.name).toBe('New Name')
    expect(updateArgs.data.phone).toBe('+37120000000')
  })

  it('stores only normalized checkout profile fields', async () => {
    await PATCH(makeRequest({ checkoutProfile: { customerType: 'company', companyName: '  SIA Test  ', iban: ' LV00 ', ignored: 'no' } }))
    const data = userUpdateMock.mock.calls[0][0].data as Record<string, unknown>
    expect(data.checkoutProfile).toMatchObject({ customerType: 'company', companyName: 'SIA Test', iban: 'LV00' })
    expect(data.checkoutProfile).not.toHaveProperty('ignored')
    expect(data).toMatchObject({
      customerType: 'company', companyName: 'SIA Test', registrationNumber: null,
    })
  })

  it('synchronizes legal details and never changes card verification pkLast3', async () => {
    await PATCH(makeRequest({ checkoutProfile: {
      customerType: 'company', companyName: 'SIA Test', regNumber: 'LV 4010-3351-370',
      vatNumber: 'LV40103351370', legalAddress: 'Rīga', personalCode: 'should-not-be-pkLast3',
    } }))
    const data = userUpdateMock.mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({
      customerType: 'company', companyName: 'SIA Test', registrationNumber: '40103351370',
      vatNumber: 'LV40103351370', legalAddress: 'Rīga',
    })
    expect(data).not.toHaveProperty('pkLast3')
    expect(data).not.toHaveProperty('cardNumber')
  })

  it('clears legal fields when profile switches to an individual', async () => {
    await PATCH(makeRequest({ checkoutProfile: { customerType: 'individual', personalCode: '010101-12345' } }))
    const data = userUpdateMock.mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({
      customerType: 'individual', companyName: null, registrationNumber: null,
      vatNumber: null, legalAddress: null,
    })
  })

  it('updates email and related user records', async () => {
    userUpdateMock.mockResolvedValue({
      id: 'u1', email: 'new@example.com', name: null, phone: null, avatarUrl: null, cardNumber: null,
    })
    const res = await PATCH(makeRequest({ email: 'New@Example.com' }))

    expect(res.status).toBe(200)
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new@example.com' }),
    }))
    expect(companyMemberUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: 'u1' }, data: { email: 'new@example.com' },
    })
    expect(savedAddressUpdateManyMock).toHaveBeenCalledWith({
      where: { email: 'user@test.com' }, data: { email: 'new@example.com' },
    })
  })

  it('rejects an email already owned by another user', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'u2' })

    const res = await PATCH(makeRequest({ email: 'taken@example.com' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_taken' })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects an email matching an existing SavedAddress (IDOR: SavedAddress has no userId)', async () => {
    savedAddressFindFirstMock.mockResolvedValue({ id: 'addr1' })

    const res = await PATCH(makeRequest({ email: 'victim@example.com' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_taken' })
    expect(userUpdateMock).not.toHaveBeenCalled()
  })
})
