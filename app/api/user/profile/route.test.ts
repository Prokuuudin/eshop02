import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { userUpdateManyMock, userFindFirstMock, userFindUniqueMock, getServerUserMock, companyMemberUpdateManyMock, savedAddressUpdateManyMock, savedAddressFindFirstMock, orderFindFirstMock } = vi.hoisted(() => ({
  userUpdateManyMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  getServerUserMock: vi.fn(),
  companyMemberUpdateManyMock: vi.fn(),
  savedAddressUpdateManyMock: vi.fn(),
  savedAddressFindFirstMock: vi.fn(),
  orderFindFirstMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const db = {
    user: { updateMany: userUpdateManyMock, findFirst: userFindFirstMock, findUnique: userFindUniqueMock, findUniqueOrThrow: userFindUniqueMock },
    companyMember: { updateMany: companyMemberUpdateManyMock },
    savedAddress: { updateMany: savedAddressUpdateManyMock, findFirst: savedAddressFindFirstMock },
    order: { findFirst: orderFindFirstMock },
  }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
  SESSION_COOKIE: 'eshop_session',
}))

import { GET, PATCH } from './route'

const VERSION = '2026-10-27T10:00:00.000Z'

function makeRequest(body: Record<string, unknown>, version: string | null = VERSION): NextRequest {
  return new NextRequest('http://localhost/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(version ? { expectedUpdatedAt: version, ...body } : body),
    headers: { 'Content-Type': 'application/json', cookie: 'eshop_session=tok', origin: 'http://localhost' },
  })
}

const SESSION_USER = { id: 'u1', email: 'user@test.com' }
const ROW = {
  id: 'u1', email: 'user@test.com', name: 'Anna Example', phone: null, avatarUrl: null, cardNumber: '9001',
  customerType: 'individual', companyName: null, registrationNumber: null, vatNumber: null, legalAddress: null,
  checkoutProfile: null, updatedAt: new Date(VERSION),
}
const writtenData = (): Record<string, unknown> => userUpdateManyMock.mock.calls[0][0].data as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue(SESSION_USER)
  userFindFirstMock.mockResolvedValue(null)
  savedAddressFindFirstMock.mockResolvedValue(null)
  orderFindFirstMock.mockResolvedValue(null)
  userUpdateManyMock.mockResolvedValue({ count: 1 })
  userFindUniqueMock.mockResolvedValue(ROW)
})

describe('PATCH /api/user/profile', () => {
  it('never writes cardNumber from the client (card is set at registration only)', async () => {
    const res = await PATCH(makeRequest({ cardNumber: 'ZZ-AUDIT-TEST' }))

    expect(res.status).toBe(200)
    expect(writtenData()).not.toHaveProperty('cardNumber')
  })

  it('still updates safe personal fields without touching requisites it was not sent', async () => {
    const res = await PATCH(makeRequest({ name: 'New Name', phone: '+37120000000' }))

    expect(res.status).toBe(200)
    expect(writtenData()).toMatchObject({ name: 'New Name', phone: '+37120000000' })
    for (const column of ['customerType', 'companyName', 'registrationNumber', 'vatNumber', 'legalAddress', 'checkoutProfile']) {
      expect(writtenData()).not.toHaveProperty(column)
    }
  })

  it('writes only when the form was built from the current version', async () => {
    await PATCH(makeRequest({ name: 'New Name' }))
    expect(userUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1', updatedAt: new Date(VERSION) } }))
  })

  it.each([
    ['a form without a version (stale client bundle)', null],
    ['a malformed version', 'not-a-date'],
  ])('rejects %s instead of overwriting newer data', async (_label, version) => {
    const res = await PATCH(makeRequest({ name: 'New Name' }, version))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'profile_conflict' })
    expect(userUpdateManyMock).not.toHaveBeenCalled()
  })

  it('rejects a save based on data that staff changed in the meantime', async () => {
    userUpdateManyMock.mockResolvedValue({ count: 0 })
    const res = await PATCH(makeRequest({ checkoutProfile: { customerType: 'company', companyName: 'SIA Old', regNumber: '40000000009' } }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'profile_conflict' })
    expect(companyMemberUpdateManyMock).not.toHaveBeenCalled()
  })

  it('stores only normalized checkout profile fields', async () => {
    await PATCH(makeRequest({ checkoutProfile: { customerType: 'company', companyName: '  SIA Test  ', iban: ' LV00 ', ignored: 'no' } }))
    const data = writtenData()
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
    expect(writtenData()).toMatchObject({
      customerType: 'company', companyName: 'SIA Test', registrationNumber: '40103351370',
      vatNumber: 'LV40103351370', legalAddress: 'Rīga',
    })
    expect(writtenData()).not.toHaveProperty('pkLast3')
    expect(writtenData()).not.toHaveProperty('cardNumber')
  })

  it('clears legal fields when profile switches to an individual', async () => {
    await PATCH(makeRequest({ checkoutProfile: { customerType: 'individual', personalCode: '010101-12345' } }))
    expect(writtenData()).toMatchObject({
      customerType: 'individual', companyName: null, registrationNumber: null,
      vatNumber: null, legalAddress: null,
    })
  })

  it('never saves invoice personal codes into the customer profile', async () => {
    await PATCH(makeRequest({ checkoutProfile: { customerType: 'individual', personalCode: '010101-12345', invoicePersonalCode: '010101-12345' } }))
    const data = writtenData() as { checkoutProfile?: Record<string, unknown> }
    expect(data.checkoutProfile).not.toHaveProperty('personalCode')
    expect(data.checkoutProfile).not.toHaveProperty('invoicePersonalCode')
  })

  it('updates email and related user records in the same transaction', async () => {
    const res = await PATCH(makeRequest({ email: 'New@Example.com' }))

    expect(res.status).toBe(200)
    expect(writtenData()).toMatchObject({ email: 'new@example.com' })
    expect(companyMemberUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: 'u1' }, data: { email: 'new@example.com' },
    })
    expect(savedAddressUpdateManyMock).toHaveBeenCalledWith({
      where: { userId: 'u1' }, data: { email: 'new@example.com' },
    })
  })

  it('rejects an email already owned by another user', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'u2' })

    const res = await PATCH(makeRequest({ email: 'taken@example.com' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_taken' })
    expect(userUpdateManyMock).not.toHaveBeenCalled()
  })

  it('rejects an email matching an existing legacy SavedAddress', async () => {
    savedAddressFindFirstMock.mockResolvedValue({ id: 'addr1' })

    const res = await PATCH(makeRequest({ email: 'victim@example.com' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_taken' })
    expect(userUpdateManyMock).not.toHaveBeenCalled()
  })

  it('rejects an email that would expose someone else\'s guest orders', async () => {
    orderFindFirstMock.mockResolvedValue({ id: 'guest-order' })

    const res = await PATCH(makeRequest({ email: 'guest-buyer@example.com' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'email_taken' })
    expect(orderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: null, email: { equals: 'guest-buyer@example.com', mode: 'insensitive' } } }))
    expect(userUpdateManyMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/user/profile', () => {
  it('returns the canonical requisites and the version the form must echo back', async () => {
    userFindUniqueMock.mockResolvedValue({
      ...ROW, customerType: 'company', companyName: 'SIA Corrected', registrationNumber: '40000000001',
      checkoutProfile: { customerType: 'company', companyName: 'SIA Stale', regNumber: '40000000009', firstName: 'Anna', lastName: 'Example', address: 'Street 1' },
    })
    const res = await GET()
    const { profile } = await res.json() as { profile: { checkoutProfile: Record<string, string>; updatedAt: string } }
    expect(profile.updatedAt).toBe(VERSION)
    expect(profile.checkoutProfile).toMatchObject({ companyName: 'SIA Corrected', regNumber: '40000000001', address: 'Street 1' })
  })

  it('requires a session', async () => {
    getServerUserMock.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })
})
