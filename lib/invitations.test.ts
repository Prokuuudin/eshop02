import {
  deriveStatus,
  isEligibleRulesRecipient,
  newInviteToken,
  readCampaign,
  resolveInviteLang,
  upsertInvitationRecord,
  markInvitationErrors,
  INVITE_BATCH_SIZE,
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

describe('resolveInviteLang', () => {
  it('валидный язык проходит как есть', () => {
    expect(resolveInviteLang('ru')).toBe('ru')
    expect(resolveInviteLang('en')).toBe('en')
    expect(resolveInviteLang('lv')).toBe('lv')
  })
  it('по умолчанию латышский', () => {
    expect(resolveInviteLang(undefined)).toBe('lv')
    expect(resolveInviteLang('de')).toBe('lv')
    expect(resolveInviteLang('')).toBe('lv')
  })
})

describe('upsertInvitationRecord', () => {
  it('добавляет новую запись', () => {
    const next = upsertInvitationRecord([], baseInv)
    expect(next).toHaveLength(1)
    expect(next[0]).toEqual(baseInv)
  })
  it('заменяет существующую запись по email', () => {
    const replacement = { ...baseInv, token: 'tok2', status: 'sent' as const }
    const next = upsertInvitationRecord([baseInv], replacement)
    expect(next).toHaveLength(1)
    expect(next[0].token).toBe('tok2')
  })
  it('не трогает записи с другим email', () => {
    const other = { ...baseInv, email: 'c@d.lv', token: 'tok3' }
    const next = upsertInvitationRecord([other], baseInv)
    expect(next).toHaveLength(2)
    expect(next.find((i) => i.email === 'c@d.lv')!.token).toBe('tok3')
  })
})

describe('markInvitationErrors', () => {
  it('помечает error только записи с указанными токенами', () => {
    const a = { ...baseInv, email: 'a@b.lv', token: 'tokA' }
    const b = { ...baseInv, email: 'c@d.lv', token: 'tokB' }
    const next = markInvitationErrors([a, b], ['tokB'])
    expect(next.find((i) => i.token === 'tokA')!.status).toBe('sent')
    expect(next.find((i) => i.token === 'tokB')!.status).toBe('error')
  })
  it('пустой список токенов ничего не меняет', () => {
    const next = markInvitationErrors([baseInv], [])
    expect(next).toEqual([baseInv])
  })
})

describe('INVITE_BATCH_SIZE', () => {
  it('порция инвайтов укладывается в maxDuration serverless-функции', () => {
    expect(INVITE_BATCH_SIZE).toBeGreaterThan(0)
    expect(INVITE_BATCH_SIZE).toBeLessThanOrEqual(25)
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
