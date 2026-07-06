import {
  deriveStatus,
  isEligibleRulesRecipient,
  newInviteToken,
  readCampaign,
  type ProInvitation,
} from './invitations'
import type { PrismaClient } from '@/generated/prisma/client'

const baseInv: ProInvitation = {
  userId: 'u1',
  email: 'a@b.lv',
  cardNumber: '1001',
  token: 'tok',
  sentAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-07-08T00:00:00.000Z',
  acceptedAt: null,
  status: 'sent',
  language: 'ru',
}

describe('deriveStatus', () => {
  it('accepted остаётся accepted даже после истечения срока', () => {
    const inv = { ...baseInv, acceptedAt: '2026-07-02T00:00:00.000Z', status: 'accepted' as const }
    expect(deriveStatus(inv, new Date('2026-08-01'))).toBe('accepted')
  })

  it('sent становится expired после expiresAt', () => {
    expect(deriveStatus(baseInv, new Date('2026-07-09'))).toBe('expired')
  })

  it('sent до истечения срока остаётся sent', () => {
    expect(deriveStatus(baseInv, new Date('2026-07-05'))).toBe('sent')
  })

  it('error не переписывается в expired', () => {
    const inv = { ...baseInv, status: 'error' as const }
    expect(deriveStatus(inv, new Date('2026-08-01'))).toBe('error')
  })
})

describe('isEligibleRulesRecipient', () => {
  const u = { email: 'x@inbox.lv', platformRole: 'customer', cardNumber: null }
  it('обычный клиент без карты — да', () => {
    expect(isEligibleRulesRecipient(u)).toBe(true)
  })
  it('с картой — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, cardNumber: '1001' })).toBe(false)
  })
  it('админ — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, platformRole: 'admin' })).toBe(false)
  })
  it('@client.local — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, email: 'p16@client.local' })).toBe(false)
  })
  it('email без @ — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, email: 'not-an-email' })).toBe(false)
  })
})

describe('newInviteToken', () => {
  it('64 hex-символа, уникальные', () => {
    const t1 = newInviteToken()
    expect(t1).toMatch(/^[0-9a-f]{64}$/)
    expect(newInviteToken()).not.toBe(t1)
  })
})

describe('readCampaign', () => {
  it('возвращает дефолтное состояние если KV пуст', async () => {
    const db = {
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient
    const state = await readCampaign(db)
    expect(state).toEqual({
      sentCount: 0, errorCount: 0, cursor: null,
      lastRunAt: null, finished: false, runningSince: null,
    })
  })
})
