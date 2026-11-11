import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { hashInviteToken } from '@/lib/invitations'

// Stateful harness: every $transaction works on a staged copy of the state and
// publishes it only when the callback resolves, so a thrown error (audit
// failure, lost race) leaves the committed state untouched. Transactions run
// one at a time, like the row lock taken by the conditional UPDATE.

type RequestRow = Record<string, unknown> & { id: string; status: string; email: string }
type UserRow = Record<string, unknown> & { id: string; email: string; cardNumber: string | null }
type InvitationRow = { tokenHash: string; userId: string; email: string; cardNumber: string; status: string; expiresAt: Date }
type AuditRow = { actorId: string; input: Record<string, unknown> }
type State = {
  requests: Record<string, RequestRow>
  users: Record<string, UserRow>
  certificates: Record<string, { data: string; name: string }>
  invitations: InvitationRow[]
  audits: AuditRow[]
}

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  getServerUser: vi.fn(),
  appendServerAudit: vi.fn(),
  sendEmail: vi.fn(),
  userIds: 0,
}))

function uniqueViolation(field: string): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002', clientVersion: 'test', meta: { target: [field] },
  })
}

function makeDb(s: State) {
  const pickRequest = (row: RequestRow) => ({
    id: row.id, email: row.email, status: row.status, reviewedAt: row.reviewedAt ?? null,
    reviewedByEmail: row.reviewedByEmail ?? null, approvedTeamRole: row.approvedTeamRole ?? null,
    reviewNote: row.reviewNote ?? null,
  })
  const assertUnique = (data: Partial<UserRow>, selfId?: string) => {
    for (const user of Object.values(s.users)) {
      if (user.id === selfId) continue
      if (data.cardNumber && user.cardNumber === data.cardNumber) throw uniqueViolation('cardNumber')
      if (data.email && user.email.toLowerCase() === String(data.email).toLowerCase()) throw uniqueViolation('email')
    }
  }
  return {
    accessRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => (s.requests[where.id] ? { ...s.requests[where.id] } : null),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => pickRequest(s.requests[where.id]),
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        const row = s.requests[where.id]
        if (!row || row.status !== where.status) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    },
    user: {
      findFirst: async ({ where }: { where: { cardNumber?: string; email?: { equals: string } } }) => {
        const users = Object.values(s.users)
        if (where.cardNumber) return users.find((u) => u.cardNumber === where.cardNumber) ?? null
        const email = where.email?.equals.toLowerCase()
        return users.find((u) => u.email.toLowerCase() === email) ?? null
      },
      create: async ({ data }: { data: UserRow }) => {
        assertUnique(data)
        s.users[data.id] = { ...data }
        return { ...data }
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        assertUnique(data, where.id)
        Object.assign(s.users[where.id], data)
        return { ...s.users[where.id] }
      },
    },
    keyValueSetting: {
      deleteMany: async ({ where }: { where: { key: string } }) => {
        const id = where.key.replace(/^access-request-cert-/u, '')
        const existed = id in s.certificates
        delete s.certificates[id]
        return { count: existed ? 1 : 0 }
      },
    },
    invitationToken: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = s.invitations.length
        s.invitations = s.invitations.filter((i) => i.userId !== where.userId || i.status === 'accepted')
        return { count: before - s.invitations.length }
      },
      create: async ({ data }: { data: Omit<InvitationRow, 'status'> }) => {
        s.invitations.push({ ...data, status: 'sent' })
        return data
      },
      updateMany: async ({ where, data }: { where: { tokenHash: string; status: string }; data: { status: string } }) => {
        let count = 0
        for (const invitation of s.invitations) {
          if (invitation.tokenHash === where.tokenHash && invitation.status === where.status) {
            invitation.status = data.status
            count += 1
          }
        }
        return { count }
      },
    },
    auditLog: {
      create: async ({ data }: { data: AuditRow }) => { s.audits.push(data) },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const live = new Proxy({}, {
    get(_target, model: string) {
      if (model === '$transaction') {
        return async (run: (tx: ReturnType<typeof makeDb>) => Promise<unknown>) => {
          const previous = h.queue
          let release = (): void => undefined
          h.queue = new Promise<void>((resolve) => { release = resolve })
          await previous
          try {
            const staged = structuredClone(h.state)
            const result = await run(makeDb(staged))
            h.state = staged
            return result
          } finally {
            release()
          }
        }
      }
      return makeDb(h.state)[model as keyof ReturnType<typeof makeDb>]
    },
  })
  return { prisma: live }
})
vi.mock('@/lib/server-auth', () => ({ getServerUser: h.getServerUser }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/invitation-emails', () => ({
  buildInviteEmail: vi.fn((_lang: string, vars: { inviteUrl: string }) => ({ subject: 'Invite', html: `<a href="${vars.inviteUrl}">Invite</a>` })),
  pickInviteTemplate: vi.fn(() => undefined),
}))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.com') }))
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, randomUUID: () => `user-${++h.userIds}` }
})

import { PATCH } from './route'

const ADMIN = { id: 'admin1', email: 'admin@test.com', platformRole: 'admin' }

const NO_CARD_REQUEST: RequestRow = {
  id: 'req1',
  email: 'master@inbox.lv',
  passwordHash: 'hash-from-request',
  name: 'Māra Bērziņa',
  phone: '26000000',
  companyId: '',
  companyName: '',
  cardNumber: '',
  requestType: 'no-card',
  status: 'pending',
  language: 'lv',
  privacyNoticeVersion: '2026-08',
  privacyAcknowledgedAt: null,
  marketingConsent: false,
  marketingConsentAt: null,
}
const CARD_REQUEST: RequestRow = { ...NO_CARD_REQUEST, id: 'req2', requestType: 'card', cardNumber: '1001' }
const CERTIFICATE = { data: 'data:application/pdf;base64,Q0VSVElGSUNBVEUtU0VDUkVU', name: 'diploma.pdf' }

function seed(options: { requests?: RequestRow[]; users?: UserRow[] } = {}): void {
  const requests = options.requests ?? [NO_CARD_REQUEST, CARD_REQUEST]
  h.state = {
    requests: Object.fromEntries(requests.map((r) => [r.id, { ...r }])),
    users: Object.fromEntries((options.users ?? []).map((u) => [u.id, { ...u }])),
    certificates: Object.fromEntries(requests.map((r) => [r.id, { ...CERTIFICATE }])),
    invitations: [],
    audits: [],
  }
}

function makeRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/access-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const patch = (id: string, body: Record<string, unknown>) =>
  PATCH(makeRequest(id, body), { params: Promise.resolve({ id }) })

const usersWithCard = (card: string) => Object.values(h.state.users).filter((u) => u.cardNumber === card)

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.userIds = 0
  seed()
  h.getServerUser.mockResolvedValue(ADMIN)
  h.sendEmail.mockResolvedValue(undefined)
  h.appendServerAudit.mockImplementation(async (tx: ReturnType<typeof makeDb>, _request: NextRequest, actor: { id: string }, input: Record<string, unknown>) => {
    await tx.auditLog.create({ data: { actorId: actor.id, input } })
  })
})

describe('PATCH /api/admin/access-requests/[id] — approve no-card', () => {
  it('создаёт спящего юзера с картой из заявки', async () => {
    const res = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(res.status).toBe(200)
    const [user] = usersWithCard('77001')
    expect(user).toMatchObject({
      email: 'master@inbox.lv', passwordHash: 'hash-from-request', platformRole: 'customer', mustChangePassword: true,
    })
    expect(h.state.requests.req1).toMatchObject({ status: 'approved', reviewedByUserId: 'admin1', approvedTeamRole: 'viewer' })
    expect(await res.json()).toMatchObject({ cardNumber: '77001', userId: user.id, emailStatus: 'sent', request: { id: 'req1', status: 'approved' } })
  })

  it('сохраняет тип и регистрационный номер юрлица', async () => {
    const res = await patch('req1', {
      status: 'approved', cardNumber: '77001', customerType: 'company',
      companyName: 'SIA Test', registrationNumber: '40103351370',
    })

    expect(res.status).toBe(200)
    expect(usersWithCard('77001')[0]).toMatchObject({
      customerType: 'company', companyName: 'SIA Test', registrationNumber: '40103351370',
    })
  })

  it('отклоняет юрлицо без корректного регистрационного номера', async () => {
    const res = await patch('req1', {
      status: 'approved', cardNumber: '77001', customerType: 'company', companyName: 'SIA Test', registrationNumber: '123',
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_company_details')
    expect(Object.keys(h.state.users)).toHaveLength(0)
  })

  it('карта занята другим юзером → 409, заявка не обновляется', async () => {
    seed({ users: [{ id: 'other', email: 'other@test.lv', cardNumber: '77001' }] })

    const res = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
    expect(h.state.requests.req1.status).toBe('pending')
    expect(Object.keys(h.state.users)).toEqual(['other'])
    expect(h.state.audits).toHaveLength(0)
  })

  it('юзер с таким email уже есть без карты → карта дописывается ему', async () => {
    seed({ users: [{ id: 'u5', email: 'Master@Inbox.lv', cardNumber: null, platformRole: 'customer' }] })

    const res = await patch('req1', { status: 'approved', cardNumber: '77002' })

    expect(res.status).toBe(200)
    expect(Object.keys(h.state.users)).toEqual(['u5'])
    expect(h.state.users.u5.cardNumber).toBe('77002')
    expect(h.state.audits[0].input.after).toMatchObject({ account: { userId: 'u5', action: 'updated' } })
  })

  it('без cardNumber → 400 invalid_card', async () => {
    const res = await patch('req1', { status: 'approved' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_card')
  })

  it('reject no-card не трогает юзеров', async () => {
    const res = await patch('req1', { status: 'rejected' })

    expect(res.status).toBe(200)
    expect(Object.keys(h.state.users)).toHaveLength(0)
    expect(h.state.invitations).toHaveLength(0)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it.each(['approved', 'rejected'])('решение удаляет сертификат из KV: %s', async (status) => {
    await patch('req1', { status, cardNumber: '77001' })

    expect(h.state.certificates.req1).toBeUndefined()
    expect(h.state.certificates.req2).toBeDefined()
  })

  it('создаёт одно приглашение до отправки письма', async () => {
    h.sendEmail.mockImplementation(async () => {
      expect(h.state.invitations).toHaveLength(1)
    })

    await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(h.state.invitations).toEqual([expect.objectContaining({ email: 'master@inbox.lv', cardNumber: '77001', status: 'sent' })])
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/admin/access-requests/[id] — card-type approve', () => {
  // Одна карта = один аккаунт: заявка с существующей картой при одобрении
  // тоже создаёт держателя, карта берётся из самой заявки
  it('создаёт держателя с картой из заявки (cardNumber в body не нужен)', async () => {
    const res = await patch('req2', { status: 'approved' })

    expect(res.status).toBe(200)
    expect(usersWithCard('1001')[0]).toMatchObject({ email: 'master@inbox.lv' })
  })

  it('карта заявки занята другим юзером → 409', async () => {
    seed({ users: [{ id: 'other', email: 'other@test.lv', cardNumber: '1001' }] })

    const res = await patch('req2', { status: 'approved' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
  })
})

describe('PATCH /api/admin/access-requests/[id] — staff accounts are never touched', () => {
  // The request email is unverified: a stranger can file a card request with a staff email.
  // Approving it must not attach a card / force a password change on that staff account.
  it.each([
    ['platform admin', { platformRole: 'admin', teamRole: null, superAdmin: false }],
    ['Super Admin', { platformRole: 'admin', teamRole: null, superAdmin: true }],
    ['staff manager', { platformRole: 'customer', teamRole: 'manager', superAdmin: false }],
  ])('approving a card request with the email of a %s → 409, nothing changes', async (_label, roles) => {
    seed({ users: [{ id: 'staff1', email: 'master@inbox.lv', cardNumber: null, ...roles }] })
    const before = structuredClone(h.state)

    const res = await patch('req2', { status: 'approved' })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('staff_account')
    expect(h.state).toEqual(before)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('a B2B company owner (teamRole admin, customer) still gets the card', async () => {
    seed({ users: [{ id: 'owner1', email: 'master@inbox.lv', cardNumber: null, platformRole: 'customer', teamRole: 'admin', superAdmin: false }] })

    const res = await patch('req1', { status: 'approved', cardNumber: '77003' })

    expect(res.status).toBe(200)
    expect(h.state.users.owner1.cardNumber).toBe('77003')
  })
})

describe('PATCH /api/admin/access-requests/[id] — permissions', () => {
  it.each([
    ['no session', null],
    ['customer', { id: 'c1', email: 'c@test.lv', platformRole: 'customer', teamRole: null }],
    ['B2B company owner', { id: 'o1', email: 'o@test.lv', platformRole: 'customer', teamRole: 'admin' }],
  ])('rejects %s with 403 before reading or changing anything', async (_label, sessionUser) => {
    h.getServerUser.mockResolvedValue(sessionUser)
    const before = structuredClone(h.state)

    const res = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(res.status).toBe(403)
    expect(h.state).toEqual(before)
    expect(h.appendServerAudit).not.toHaveBeenCalled()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/access-requests/[id] — audit', () => {
  it('records the approval with the session actor, statuses and assigned role only', async () => {
    const res = await patch('req1', { status: 'approved', cardNumber: '77001', approvedTeamRole: 'buyer', reviewNote: 'Diploms pārbaudīts' })

    expect(res.status).toBe(200)
    expect(h.appendServerAudit).toHaveBeenCalledTimes(1)
    const [tx, request, actor, input] = h.appendServerAudit.mock.calls[0]
    expect(tx).not.toBeUndefined()
    expect(request).toBeInstanceOf(NextRequest)
    expect(actor).toBe(ADMIN)
    const userId = usersWithCard('77001')[0].id
    expect(input).toEqual({
      action: 'access_request.approved',
      entityType: 'access_request',
      entityId: 'req1',
      before: { status: 'pending', approvedTeamRole: null },
      after: {
        status: 'approved', approvedTeamRole: 'buyer', requestType: 'no-card', customerType: 'individual',
        account: { userId, action: 'created' },
        invitation: { created: true, expiresAt: expect.any(String) },
        certificateDeleted: true,
      },
    })
    expect(h.state.audits).toHaveLength(1)
  })

  it('records the rejection without touching accounts or invitations', async () => {
    const res = await patch('req1', { status: 'rejected', reviewNote: 'Nav sertifikāta' })

    expect(res.status).toBe(200)
    expect(h.state.audits).toEqual([{
      actorId: 'admin1',
      input: {
        action: 'access_request.rejected', entityType: 'access_request', entityId: 'req1',
        before: { status: 'pending', approvedTeamRole: null },
        after: { status: 'rejected', approvedTeamRole: null, requestType: 'no-card', certificateDeleted: true },
      },
    }])
  })

  it('keeps applicant personal data, certificate, card, note and invite token out of the audit', async () => {
    await patch('req1', { status: 'approved', cardNumber: '77001', reviewNote: 'Diploms pārbaudīts' })
    await patch('req2', { status: 'rejected', reviewNote: 'Nav sertifikāta' })

    const serialized = JSON.stringify(h.appendServerAudit.mock.calls.map((call) => call[3]))
    const inviteUrl = String(h.sendEmail.mock.calls[0][2])
    const token = /token=([a-f0-9]+)/u.exec(inviteUrl)?.[1]
    expect(token).toMatch(/^[a-f0-9]{64}$/u)
    for (const secret of [
      'master@inbox.lv', 'Māra', '26000000', 'hash-from-request', '77001', '1001',
      'Q0VSVElGSUNBVEUtU0VDUkVU', 'diploma.pdf', 'Diploms pārbaudīts', 'Nav sertifikāta',
      token!, hashInviteToken(token!),
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('rolls back the decision, account, certificate deletion and invitation when the audit append fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    const res = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(res.status).toBe(500)
    expect(h.state).toEqual(before)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('rolls back a rejection when the audit append fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    const res = await patch('req1', { status: 'rejected' })

    expect(res.status).toBe(500)
    expect(h.state).toEqual(before)
  })
})

describe('PATCH /api/admin/access-requests/[id] — repeats and concurrency', () => {
  it.each([
    ['approved', 'approved'],
    ['approved', 'rejected'],
    ['rejected', 'rejected'],
    ['rejected', 'approved'],
  ])('a decided request (%s) refuses a later %s without side effects', async (first, second) => {
    expect((await patch('req1', { status: first, cardNumber: '77001' })).status).toBe(200)
    const before = structuredClone(h.state)
    vi.clearAllMocks()

    const res = await patch('req1', { status: second, cardNumber: '77002' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_decided', status: first })
    expect(h.state).toEqual(before)
    expect(h.appendServerAudit).not.toHaveBeenCalled()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('two concurrent approvals produce one decision, account, invitation, email and audit row', async () => {
    const responses = await Promise.all([
      patch('req1', { status: 'approved', cardNumber: '77001' }),
      patch('req1', { status: 'approved', cardNumber: '77001' }),
    ])

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect(Object.keys(h.state.users)).toHaveLength(1)
    expect(h.state.invitations).toHaveLength(1)
    expect(h.state.audits).toHaveLength(1)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('a concurrent approval and rejection leave exactly one decision', async () => {
    const responses = await Promise.all([
      patch('req1', { status: 'approved', cardNumber: '77001' }),
      patch('req1', { status: 'rejected' }),
    ])

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    expect(h.state.audits).toHaveLength(1)
    const decided = h.state.requests.req1.status
    expect(h.state.audits[0].input.action).toBe(`access_request.${decided}`)
    expect(Object.keys(h.state.users)).toHaveLength(decided === 'approved' ? 1 : 0)
  })

  it('two requests racing for the same card: one wins, the other gets card_taken', async () => {
    seed({ requests: [NO_CARD_REQUEST, { ...NO_CARD_REQUEST, id: 'req3', email: 'second@inbox.lv' }] })

    const responses = await Promise.all([
      patch('req1', { status: 'approved', cardNumber: '77001' }),
      patch('req3', { status: 'approved', cardNumber: '77001' }),
    ])

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const loser = responses.find((r) => r.status === 409)!
    expect((await loser.json()).error).toBe('card_taken')
    expect(usersWithCard('77001')).toHaveLength(1)
    expect(h.state.audits).toHaveLength(1)
    expect(Object.values(h.state.requests).filter((r) => r.status === 'pending')).toHaveLength(1)
  })
})

describe('PATCH /api/admin/access-requests/[id] — email delivery failure', () => {
  it('keeps the committed decision and audit, marks the invitation failed and returns 502', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))

    const res = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ emailStatus: 'error', cardNumber: '77001', request: { status: 'approved' } })
    expect(h.state.requests.req1.status).toBe('approved')
    expect(usersWithCard('77001')).toHaveLength(1)
    expect(h.state.audits).toHaveLength(1)
    expect(h.state.invitations).toEqual([expect.objectContaining({ status: 'error' })])
  })

  it('a retry after the email failure does not duplicate the account, invitation or audit', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    await patch('req1', { status: 'approved', cardNumber: '77001' })

    const retry = await patch('req1', { status: 'approved', cardNumber: '77001' })

    expect(retry.status).toBe(409)
    expect(usersWithCard('77001')).toHaveLength(1)
    expect(h.state.invitations).toHaveLength(1)
    expect(h.state.audits).toHaveLength(1)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })
})
