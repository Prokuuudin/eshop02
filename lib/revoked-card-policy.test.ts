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
  restoreCardInRegistry,
  revokeCardInRegistry,
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
    ['protected card 111', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['111'] = { userId: 'x', preserveLogin: false } })],
    ['protected card 5044', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['5044'] = { userId: 'x', preserveLogin: false } })],
    ['a non-canonical number', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001']; cards['04001'] = { userId: 'x', preserveLogin: false } })],
    ['preserveLogin on another card', () => withCards(buildRevokedCardValue(), (cards) => { cards['900001'] = { userId: 'u-synthetic-900001', preserveLogin: true } })],
    ['preserveLogin on an admin revocation of 5555', () => withCards(buildRevokedCardValue(), (cards) => { cards['5555'] = { ...cards['5555'], origin: 'admin' } })],
  ])('rejects %s as invalid_configuration (fail closed)', async (_label, value) => {
    expect(await errorCode(getRevokedCardPolicy(dbWith(revokedCardRow(value()))))).toBe('invalid_configuration')
  })

  it.each([
    ['more cards than the 2026-11-16 batch', () => withCards(buildRevokedCardValue(), (cards) => { cards['4001'] = { userId: 'u1', preserveLogin: false } })],
    ['fewer cards than the batch', () => withCards(buildRevokedCardValue(), (cards) => { delete cards['900001'] })],
    ['one customer with two revoked cards', () => withCards(buildRevokedCardValue(), (cards) => { cards['900001'] = { userId: 'u-synthetic-900002', preserveLogin: false } })],
    ['an admin revocation with its metadata', () => withCards(buildRevokedCardValue(), (cards) => {
      cards['4001'] = { userId: 'u1', preserveLogin: false, origin: 'admin', revokedAt: '2026-11-17T10:00:00.000Z', revokedBy: 'admin-1', reason: 'Lost' }
    })],
  ])('accepts %s', async (_label, value) => {
    expect((await getRevokedCardPolicy(dbWith(revokedCardRow(value())))).active).toBe(true)
  })
})

describe('admin revocation writes', () => {
  /** In-memory registry row behind the same calls the writers make. */
  function registryTx(initial: unknown) {
    const state = { row: initial === undefined ? null : { value: initial }, locks: 0 }
    const tx = {
      $queryRaw: vi.fn(async () => { state.locks++; return [] }),
      keyValueSetting: {
        findUnique: vi.fn(async () => state.row),
        upsert: vi.fn(async ({ update }: { update: { value: unknown } }) => { state.row = { value: update.value } }),
      },
    }
    const cards = () => (state.row?.value as { cards: Record<string, RevokedCardEntry> }).cards
    return { tx: tx as never, state, cards }
  }
  const NOW = new Date('2026-11-17T12:00:00.000Z')

  it('adds a card with its metadata under a row lock and keeps the batch and its source', async () => {
    const { tx, state, cards } = registryTx(buildRevokedCardValue())
    expect(await revokeCardInRegistry(tx, { cardNumber: '04001', userId: 'u1', revokedBy: 'admin-1', reason: ' Lost card ', now: NOW })).toBe(true)

    expect(state.locks).toBe(1)
    expect(cards()['4001']).toEqual({ userId: 'u1', preserveLogin: false, origin: 'admin', revokedAt: NOW.toISOString(), revokedBy: 'admin-1', reason: 'Lost card' })
    expect(Object.keys(cards())).toHaveLength(906)
    expect((state.row?.value as { source: string }).source).toBe('test-fixture')
    // The written value is a valid registry that every reader accepts.
    expect((await getRevokedCardPolicy(dbWith(revokedCardRow(state.row?.value, NOW)))).cards.has('4001')).toBe(true)
  })

  it('leaves an already revoked number untouched', async () => {
    const { tx, cards } = registryTx(buildRevokedCardValue({ '4001': 'u1' }))
    expect(await revokeCardInRegistry(tx, { cardNumber: '4001', userId: 'u2', revokedBy: 'admin-1', reason: 'x' })).toBe(false)
    expect(cards()['4001']).toEqual({ userId: 'u1', preserveLogin: false })
  })

  it('starts an empty registry when none exists yet', async () => {
    const { tx, cards } = registryTx(undefined)
    expect(await revokeCardInRegistry(tx, { cardNumber: '4001', userId: 'u1', revokedBy: 'admin-1', reason: 'Lost', now: NOW })).toBe(true)
    expect(Object.keys(cards())).toEqual(['4001'])
  })

  it.each([
    ['protected card 111', '111', buildRevokedCardValue(), 'card_protected'],
    ['a switched-off registry', '4001', { ...buildRevokedCardValue(), active: false }, 'registry_inactive'],
    ['a corrupt registry', '4001', { ...buildRevokedCardValue(), checksum: 'a'.repeat(64) }, 'invalid_configuration'],
  ])('refuses %s without writing', async (_label, cardNumber, value, code) => {
    const { tx, state } = registryTx(value)
    const before = JSON.stringify(state.row)
    expect(await errorCode(revokeCardInRegistry(tx, { cardNumber, userId: 'u1', revokedBy: 'admin-1', reason: 'x' }))).toBe(code)
    expect(JSON.stringify(state.row)).toBe(before)
  })

  it('restores only admin revocations', async () => {
    const { tx, cards } = registryTx(buildRevokedCardValue({ '4002': 'u2' }))
    await revokeCardInRegistry(tx, { cardNumber: '4001', userId: 'u1', revokedBy: 'admin-1', reason: 'Lost', now: NOW })

    expect((await restoreCardInRegistry(tx, '4001')).userId).toBe('u1')
    expect(cards()['4001']).toBeUndefined()
    expect(await errorCode(restoreCardInRegistry(tx, '4002'))).toBe('not_restorable')
    expect(await errorCode(restoreCardInRegistry(tx, '7777'))).toBe('not_restorable')
    expect(cards()['4002']).toBeDefined()
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
