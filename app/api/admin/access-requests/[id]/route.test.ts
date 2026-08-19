import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  getServerUserMock,
  accessRequestFindUniqueMock,
  accessRequestUpdateMock,
  userFindFirstMock,
  userCreateMock,
  userUpdateMock,
  keyValueSettingDeleteManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  accessRequestFindUniqueMock: vi.fn(),
  accessRequestUpdateMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userCreateMock: vi.fn(),
  userUpdateMock: vi.fn(),
  keyValueSettingDeleteManyMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessRequest: {
      findUnique: accessRequestFindUniqueMock,
      update: accessRequestUpdateMock,
    },
    user: {
      findFirst: userFindFirstMock,
      create: userCreateMock,
      update: userUpdateMock,
    },
    keyValueSetting: { deleteMany: keyValueSettingDeleteManyMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
}))
vi.mock('@/lib/invitations', () => ({
  hashInviteToken: vi.fn(() => 'token-hash'),
  INVITE_TTL_DAYS: 7,
  newInviteToken: vi.fn(() => 'invite-token'),
  replaceInvitation: vi.fn().mockResolvedValue(undefined),
  resolveInviteLang: vi.fn(() => 'ru'),
}))
vi.mock('@/lib/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/invitation-emails', () => ({
  buildInviteEmail: vi.fn(() => ({ subject: 'Invite', html: '<p>Invite</p>' })),
  pickInviteTemplate: vi.fn(() => undefined),
}))
vi.mock('@/lib/email-templates-server-store', () => ({
  getTemplates: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/site-url', () => ({
  getSiteUrl: vi.fn(() => 'https://example.com'),
}))

import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

const ADMIN = { id: 'admin1', email: 'admin@test.com', platformRole: 'admin' }

const NO_CARD_REQUEST = {
  id: 'req1',
  email: 'master@inbox.lv',
  passwordHash: 'hash-from-request',
  name: 'Māra',
  phone: '26000000',
  companyId: '',
  companyName: '',
  cardNumber: '',
  requestType: 'no-card',
  status: 'pending',
}

const CARD_REQUEST = { ...NO_CARD_REQUEST, id: 'req2', requestType: 'card', cardNumber: '1001' }

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/access-requests/req1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue(ADMIN)
  accessRequestUpdateMock.mockImplementation(async ({ data }) => ({
    id: 'req1',
    ...data,
  }))
  // $transaction(fn) исполняет колбэк на том же моке prisma
  transactionMock.mockImplementation(async (fn) => fn(prisma))
  userCreateMock.mockImplementation(async ({ data }) => ({ ...data }))
})

describe('PATCH /api/admin/access-requests/[id] — approve no-card', () => {
  it('создаёт спящего юзера с картой из заявки', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)
    userFindFirstMock.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ status: 'approved', cardNumber: '77001' }), params('req1'))

    expect(res.status).toBe(200)
    const createArgs = userCreateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createArgs.data.email).toBe('master@inbox.lv')
    expect(createArgs.data.cardNumber).toBe('77001')
    expect(createArgs.data.passwordHash).toBe('hash-from-request')
    expect(createArgs.data.platformRole).toBe('customer')
    expect(vi.mocked(prisma.accessRequest.update)).toHaveBeenCalled()
  })

  it('сохраняет тип и регистрационный номер юрлица', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)
    userFindFirstMock.mockResolvedValue(null)

    const res = await PATCH(makeRequest({
      status: 'approved', cardNumber: '77001', customerType: 'company',
      companyName: 'SIA Test', registrationNumber: '40103351370',
    }), params('req1'))

    expect(res.status).toBe(200)
    expect(userCreateMock.mock.calls[0][0].data).toMatchObject({
      customerType: 'company', companyName: 'SIA Test', registrationNumber: '40103351370',
    })
  })

  it('отклоняет юрлицо без корректного регистрационного номера', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)

    const res = await PATCH(makeRequest({
      status: 'approved', cardNumber: '77001', customerType: 'company', companyName: 'SIA Test', registrationNumber: '123',
    }), params('req1'))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_company_details')
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('карта занята другим юзером → 409, заявка не обновляется', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)
    userFindFirstMock.mockImplementation(async ({ where }) => {
      if (where?.cardNumber) return { id: 'other', cardNumber: '77001' }
      return null
    })

    const res = await PATCH(makeRequest({ status: 'approved', cardNumber: '77001' }), params('req1'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
    expect(vi.mocked(prisma.accessRequest.update)).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled()
  })

  it('юзер с таким email уже есть без карты → карта дописывается ему', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)
    userFindFirstMock.mockImplementation(async ({ where }) => {
      if (where?.cardNumber) return null
      return { id: 'u5', cardNumber: null }
    })

    const res = await PATCH(makeRequest({ status: 'approved', cardNumber: '77002' }), params('req1'))

    expect(res.status).toBe(200)
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled()
    const updateArgs = userUpdateMock.mock.calls[0][0] as {
      where: { id: string }
      data: { cardNumber: string }
    }
    expect(updateArgs.where.id).toBe('u5')
    expect(updateArgs.data.cardNumber).toBe('77002')
  })

  it('без cardNumber → 400 invalid_card', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)

    const res = await PATCH(makeRequest({ status: 'approved' }), params('req1'))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_card')
  })

  it('reject no-card не трогает юзеров', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)

    const res = await PATCH(makeRequest({ status: 'rejected' }), params('req1'))

    expect(res.status).toBe(200)
    expect(vi.mocked(prisma.user.create)).not.toHaveBeenCalled()
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled()
  })

  it('решение удаляет сертификат из KV: approve', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)
    userFindFirstMock.mockResolvedValue(null)

    await PATCH(makeRequest({ status: 'approved', cardNumber: '77001' }), params('req1'))

    const delArgs = keyValueSettingDeleteManyMock.mock.calls[0][0] as {
      where: { key: string }
    }
    expect(delArgs.where.key).toBe('access-request-cert-req1')
  })

  it('решение удаляет сертификат из KV: reject', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(NO_CARD_REQUEST)

    await PATCH(makeRequest({ status: 'rejected' }), params('req1'))

    const delArgs = keyValueSettingDeleteManyMock.mock.calls[0][0] as {
      where: { key: string }
    }
    expect(delArgs.where.key).toBe('access-request-cert-req1')
  })
})

describe('PATCH /api/admin/access-requests/[id] — card-type approve', () => {
  // Одна карта = один аккаунт: заявка с существующей картой при одобрении
  // тоже создаёт держателя, карта берётся из самой заявки
  it('создаёт держателя с картой из заявки (cardNumber в body не нужен)', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(CARD_REQUEST)
    userFindFirstMock.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ status: 'approved' }), params('req2'))

    expect(res.status).toBe(200)
    const createArgs = userCreateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createArgs.data.cardNumber).toBe('1001')
    expect(createArgs.data.email).toBe('master@inbox.lv')
  })

  it('карта заявки занята другим юзером → 409', async () => {
    accessRequestFindUniqueMock.mockResolvedValue(CARD_REQUEST)
    userFindFirstMock.mockImplementation(async ({ where }) => {
      if (where?.cardNumber) return { id: 'other' }
      return null
    })

    const res = await PATCH(makeRequest({ status: 'approved' }), params('req2'))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
  })
})
