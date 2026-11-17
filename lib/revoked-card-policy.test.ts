import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  ADMIN_REVOKED_CARD_SETTING_KEY,
  activeCardNumberFilter,
  assertCardsAssignable,
  assertUserCardMutationAllowed,
  canAuthenticateWithCard,
  computeRevokedCardChecksum,
  getRevokedCardPolicy,
  isCardRevoked,
  isRevokedCardPolicyError,
  recordAdminCardRevocation,
  removeAdminCardRevocation,
  resetRevokedCardPolicyCache,
  REVOKED_CARD_SETTING_KEY,
  verifyRevokedCardPolicyAgainstDatabase,
  type RevokedCardEntry,
} from '@/lib/revoked-card-policy'
import { buildRevokedCardValue, PRESERVED_OWNER_ID, revokedCardRow } from '@/lib/revoked-card-policy-fixture'

type Value = ReturnType<typeof buildRevokedCardValue>
const dbWith = (row: unknown, adminRow: unknown = null) => ({
  keyValueSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (where.key === 'revoked-client-cards:admin:v1' ? adminRow : row)),
  },
}) as never
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

describe('admin-panel revocations (separate registry row)', () => {
  const ADMIN_ROW = (cards: Record<string, unknown>) => revokedCardRow({ cards })
  const ENTRY = { userId: 'u7', revokedAt: '2026-11-17T10:00:00.000Z', revokedBy: 'admin-1', reason: 'Lost card' }

  it('blocks issuing an admin-revoked number in any spelling, next to the batch rules', async () => {
    const db = dbWith(revokedCardRow(buildRevokedCardValue()), ADMIN_ROW({ '4007': ENTRY }))
    expect(await errorCode(assertCardsAssignable(['7001', ' 04007 '], db))).toBe('card_revoked')
    expect(await errorCode(assertUserCardMutationAllowed('u8', null, '4007', db))).toBe('card_revoked')
    expect(await isCardRevoked('4007', db)).toBe(true)
    expect(await errorCode(assertCardsAssignable(['7001'], db))).toBeUndefined()
  })

  it('applies even when the batch registry is absent or switched off', async () => {
    for (const batch of [null, revokedCardRow({ ...buildRevokedCardValue(), active: false })]) {
      expect(await errorCode(assertCardsAssignable(['4007'], dbWith(batch, ADMIN_ROW({ '4007': ENTRY }))))).toBe('card_revoked')
    }
  })

  it('never changes card login rules: the batch alone decides who may sign in with a number', async () => {
    const db = dbWith(revokedCardRow(buildRevokedCardValue()), ADMIN_ROW({ '4007': ENTRY }))
    expect(await canAuthenticateWithCard('5555', OWNER, db)).toBe(true)
    expect((await getRevokedCardPolicy(db)).cards.size).toBe(905)
  })

  it.each([
    ['a missing reason', { '4007': { ...ENTRY, reason: undefined } }],
    ['an unknown field', { '4007': { ...ENTRY, preserveLogin: true } }],
    ['a non-canonical number', { '04007': ENTRY }],
  ])('fails issuance closed on %s', async (_label, cards) => {
    expect(await errorCode(assertCardsAssignable(['7001'], dbWith(null, ADMIN_ROW(cards))))).toBe('invalid_configuration')
  })

  describe('writes', () => {
    function registryTx(batch: unknown, admin?: unknown) {
      const settings = new Map<string, unknown>([[REVOKED_CARD_SETTING_KEY, batch]])
      if (admin !== undefined) settings.set(ADMIN_REVOKED_CARD_SETTING_KEY, admin)
      const tx = {
        $executeRaw: vi.fn(async () => 1),
        keyValueSetting: {
          findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (settings.has(where.key) ? { value: structuredClone(settings.get(where.key)), updatedAt: new Date() } : null)),
          upsert: vi.fn(async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => { settings.set(where.key, structuredClone(update.value)) }),
        },
      }
      return { tx: tx as never, raw: tx, settings }
    }
    const NOW = new Date('2026-11-17T12:00:00.000Z')

    it('adds a card under the admin lock and leaves the batch row untouched', async () => {
      const batch = buildRevokedCardValue()
      const { tx, raw, settings } = registryTx(batch)
      expect(await recordAdminCardRevocation(tx, { cardNumber: '04001', userId: 'u1', revokedBy: 'admin-1', reason: ' Lost card ', now: NOW })).toBe(true)

      expect(raw.$executeRaw).toHaveBeenCalledTimes(1)
      expect(settings.get(ADMIN_REVOKED_CARD_SETTING_KEY)).toEqual({ cards: { '4001': { userId: 'u1', revokedAt: NOW.toISOString(), revokedBy: 'admin-1', reason: 'Lost card' } } })
      expect(settings.get(REVOKED_CARD_SETTING_KEY)).toEqual(batch)
      expect(raw.keyValueSetting.upsert).toHaveBeenCalledTimes(1)
      expect(raw.keyValueSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: ADMIN_REVOKED_CARD_SETTING_KEY } }))
    })

    it('returns false for a number already revoked in the batch or by an admin, writing nothing', async () => {
      const inBatch = registryTx(buildRevokedCardValue({ '4001': 'u1' }))
      expect(await recordAdminCardRevocation(inBatch.tx, { cardNumber: '4001', userId: 'u1', revokedBy: 'admin-1', reason: 'x' })).toBe(false)
      const inAdmin = registryTx(null, { cards: { '4001': ENTRY } })
      expect(await recordAdminCardRevocation(inAdmin.tx, { cardNumber: '4001', userId: 'u1', revokedBy: 'admin-1', reason: 'x' })).toBe(false)
      expect(inBatch.raw.keyValueSetting.upsert).not.toHaveBeenCalled()
      expect(inAdmin.raw.keyValueSetting.upsert).not.toHaveBeenCalled()
    })

    it('refuses protected cards 111 and 5044', async () => {
      for (const cardNumber of ['111', '5044']) {
        const { tx, raw } = registryTx(null)
        expect(await errorCode(recordAdminCardRevocation(tx, { cardNumber, userId: 'u1', revokedBy: 'admin-1', reason: 'x' }))).toBe('card_protected')
        expect(raw.keyValueSetting.upsert).not.toHaveBeenCalled()
      }
    })

    it('removes only admin revocations', async () => {
      const { tx, settings } = registryTx(buildRevokedCardValue(), { cards: { '4001': ENTRY } })
      expect(await removeAdminCardRevocation(tx, '04001')).toEqual(ENTRY)
      expect(settings.get(ADMIN_REVOKED_CARD_SETTING_KEY)).toEqual({ cards: {} })
      expect(await errorCode(removeAdminCardRevocation(tx, '900001'))).toBe('not_restorable')
    })
  })
})
