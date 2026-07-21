import {
  deriveStatus, hashInviteToken, isEligibleRulesRecipient, newInviteToken,
  readCampaign, resolveInviteLang, INVITE_BATCH_SIZE, type ProInvitation,
} from './invitations'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const invitation: ProInvitation = {
  id: 'i1', userId: 'u1', email: 'a@b.lv', cardNumber: '1001',
  sentAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-08T00:00:00.000Z',
  acceptedAt: null, status: 'sent', language: 'ru',
}

describe('invitation security helpers', () => {
  it('derives expiry without overriding terminal states', () => {
    expect(deriveStatus(invitation, new Date('2026-07-09'))).toBe('expired')
    expect(deriveStatus({ ...invitation, status: 'error' }, new Date('2026-08-01'))).toBe('error')
    expect(deriveStatus({ ...invitation, status: 'accepted' }, new Date('2026-08-01'))).toBe('accepted')
  })

  it('generates unique raw tokens and hashes them with SHA-256', () => {
    const token = newInviteToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(newInviteToken()).not.toBe(token)
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken(token)).not.toBe(token)
  })

  it('normalizes supported languages', () => {
    expect(resolveInviteLang('ru')).toBe('ru')
    expect(resolveInviteLang('de')).toBe('lv')
  })
})

describe('recipient rules', () => {
  const user = { email: 'x@inbox.lv', platformRole: 'customer', cardNumber: null }
  it('accepts an ordinary customer without a card', () => expect(isEligibleRulesRecipient(user)).toBe(true))
  it('rejects admins, card holders and synthetic emails', () => {
    expect(isEligibleRulesRecipient({ ...user, platformRole: 'admin' })).toBe(false)
    expect(isEligibleRulesRecipient({ ...user, cardNumber: '1' })).toBe(false)
    expect(isEligibleRulesRecipient({ ...user, email: 'x@client.local' })).toBe(false)
  })
})

describe('configuration', () => {
  it('keeps invite batches bounded', () => {
    expect(INVITE_BATCH_SIZE).toBeGreaterThan(0)
    expect(INVITE_BATCH_SIZE).toBeLessThanOrEqual(25)
  })

  it('returns an empty campaign when KV is absent', async () => {
    const db = { keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as ExtendedPrismaClient
    expect(await readCampaign(db)).toEqual({
      sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null,
    })
  })
})
