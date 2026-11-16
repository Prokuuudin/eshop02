import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  activeCardNumberFilter,
  assertCardsAssignable,
  assertUserCardMutationAllowed,
  canAuthenticateWithCard,
  computeRevokedCardChecksum,
  getRevokedCardPolicy,
  isRevokedCardPolicyError,
  resetRevokedCardPolicyCache,
  verifyRevokedCardPolicyAgainstDatabase,
  type RevokedCardEntry,
} from '@/lib/revoked-card-policy'
import { buildRevokedCardValue, PRESERVED_OWNER_ID, revokedCardRow } from '@/lib/revoked-card-policy-fixture'

type Value = ReturnType<typeof buildRevokedCardValue>
const dbWith = (row: unknown) => ({ keyValueSetting: { findUnique: vi.fn().mockResolvedValue(row) } }) as never
const withCards = (value: Value, mutate: (cards: Record<string, RevokedCardEntry>) => void): Value => {
  const cards = { ...(value.cards as Record<string, RevokedCardEntry>) }
  mutate(cards)
  return { ...value, cards, checksum: computeRevokedCardChecksum(cards) }
}
const OWNER = {
  id: PRESERVED_OWNER_ID, platformRole: 'customer', superAdmin: false, teamRole: null, companyId: null,
  customerType: 'individual', mustChangePassword: false, privacyAcknowledgedAt: new Date('2026-09-09T00:00:00Z'),
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
    return undefined
  } catch (error) {
    return isRevokedCardPolicyError(error) ? error.code : 'unexpected'
  }
}

beforeEach(() => resetRevokedCardPolicyCache())

describe('getRevokedCardPolicy', () => {
  it('treats a missing setting and active=false as an inactive registry', async () => {
    const missing = await getRevokedCardPolicy(dbWith(null))
    const off = await getRevokedCardPolicy(dbWith(revokedCardRow({ ...buildRevokedCardValue(), active: false })))
    for (const policy of [missing, off]) {
      expect(policy.active).toBe(false)
      expect(activeCardNumberFilter(policy)).toEqual({ not: null })
    }
  })

  it('loads a valid registry of 905 cards', async () => {
    const policy = await getRevokedCardPolicy(dbWith(revokedCardRow(buildRevokedCardValue({ '4001': 'u1' }))))
    expect(policy.active).toBe(true)
    expect(policy.cardNumbers).toHaveLength(905)
    expect(policy.cards.get('4001')).toEqual({ userId: 'u1', preserveLogin: false })
  })

  it('reports an unreadable setting as configuration_unavailable', async () => {
    const db = { keyValueSetting: { findUnique: vi.fn().mockRejectedValue(new Error('db down')) } } as never
    expect(await errorCode(getRevokedCardPolicy(db))).toBe('configuration_unavailable')
  })

  it.each([
    ['a non-object value', () => 'nope'],
    ['a missing checksum', () => ({ ...buildRevokedCardValue(), checksum: undefined })],
    ['a checksum mismatch', () => ({ ...buildRevokedCardValue(), checksum: 'a'.repeat(64) })],
    ['the wrong number of cards', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001'] })],
    ['protected card 111', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['111'] = { userId: 'x', preserveLogin: false } })],
    ['protected card 5044', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['5044'] = { userId: 'x', preserveLogin: false } })],
    ['a non-canonical number', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['04001'] = { userId: 'x', preserveLogin: false } })],
    ['one user on two cards', () => withCards(buildRevokedCardValue(), (cards) => { cards['900001'] = { userId: 'u-synthetic-900002', preserveLogin: false } })],
    ['preserveLogin on another card', () => withCards(buildRevokedCardValue(), (cards) => { cards['900001'] = { userId: 'u-synthetic-900001', preserveLogin: true } })],
    ['preserveLogin removed from 5555', () => withCards(buildRevokedCardValue(), (cards) => { cards['5555'] = { userId: PRESERVED_OWNER_ID, preserveLogin: false } })],
  ])('rejects %s as invalid_configuration (fail closed)', async (_label, value) => {
    expect(await errorCode(getRevokedCardPolicy(dbWith(revokedCardRow(value()))))).toBe('invalid_configuration')
  })
})

describe('assignment and ownership guards', () => {
  const db = dbWith(revokedCardRow(buildRevokedCardValue({ '4001': 'u1' })))

  it('blocks revoked numbers in any spelling and allows others', async () => {
    expect(await errorCode(assertCardsAssignable(['7001', ' 04001 '], db))).toBe('card_revoked')
    expect(await errorCode(assertCardsAssignable(['7001', '111', '5044'], db))).toBeUndefined()
  })

  it('freezes the revoked holder and keeps the number from moving to someone else', async () => {
    expect(await errorCode(assertUserCardMutationAllowed('u1', '4001', null, db))).toBe('card_revoked')
    expect(await errorCode(assertUserCardMutationAllowed('u1', '4001', '7001', db))).toBe('card_revoked')
    expect(await errorCode(assertUserCardMutationAllowed('u2', null, '4001', db))).toBe('card_revoked')
    expect(await errorCode(assertUserCardMutationAllowed('u1', '4001', '4001', db))).toBeUndefined()
    expect(await errorCode(assertUserCardMutationAllowed('u3', '7001', '7002', db))).toBeUndefined()
  })

  it('changes nothing while the registry is inactive', async () => {
    expect(await errorCode(assertCardsAssignable(['4001'], dbWith(null)))).toBeUndefined()
    expect(await canAuthenticateWithCard('4001', null, dbWith(null))).toBe(true)
  })
})

describe('canAuthenticateWithCard', () => {
  const db = dbWith(revokedCardRow(buildRevokedCardValue({ '4001': 'u1' })))

  it('allows ordinary cards and the activated individual owner of 5555 only', async () => {
    expect(await canAuthenticateWithCard('1234', null, db)).toBe(true)
    expect(await canAuthenticateWithCard('5555', OWNER, db)).toBe(true)
    expect(await canAuthenticateWithCard('4001', { ...OWNER, id: 'u1' }, db)).toBe(false)
  })

  it.each([
    ['another user', { id: 'intruder' }],
    ['a company member', { companyId: 'c1', teamRole: 'admin' }],
    ['a company customer type', { customerType: 'company' }],
    ['staff', { platformRole: 'admin' }],
    ['a forced password change', { mustChangePassword: true }],
    ['a never-activated account', { privacyAcknowledgedAt: null }],
  ])('refuses 5555 for %s', async (_label, patch) => {
    expect(await canAuthenticateWithCard('5555', { ...OWNER, ...patch }, db)).toBe(false)
  })
})

describe('verifyRevokedCardPolicyAgainstDatabase', () => {
  const value = buildRevokedCardValue()
  const entries = Object.entries(value.cards as Record<string, RevokedCardEntry>)
  const users = () => entries.map(([cardNumber, entry]) => ({
    ...OWNER, id: entry.userId, cardNumber, customerType: entry.preserveLogin ? 'individual' : null,
  }))
  const verify = (rows: unknown[], companies: unknown[] = []) => verifyRevokedCardPolicyAgainstDatabase(value, {
    user: { findMany: vi.fn().mockResolvedValue(rows) },
    company: { findMany: vi.fn().mockResolvedValue(companies) },
  } as never)

  it('accepts a registry that matches the database', async () => {
    expect((await verify(users())).active).toBe(true)
  })

  it.each([
    ['a missing user', (rows: ReturnType<typeof users>) => rows.slice(1)],
    ['a moved card', (rows: ReturnType<typeof users>) => rows.map((u, i) => (i === 1 ? { ...u, cardNumber: '7777' } : u))],
    ['a B2B member', (rows: ReturnType<typeof users>) => rows.map((u, i) => (i === 1 ? { ...u, companyId: 'c1' } : u))],
    ['staff', (rows: ReturnType<typeof users>) => rows.map((u, i) => (i === 1 ? { ...u, platformRole: 'admin' } : u))],
    ['a non-activated 5555 owner', (rows: ReturnType<typeof users>) => rows.map((u) => (u.cardNumber === '5555' ? { ...u, mustChangePassword: true } : u))],
  ])('rejects %s', async (_label, mutate) => {
    expect(await errorCode(verify(mutate(users())))).toBe('invalid_configuration')
  })

  it('rejects a revoked number still attached to a company', async () => {
    expect(await errorCode(verify(users(), [{ cardNumber: '900001' }]))).toBe('invalid_configuration')
  })
})
