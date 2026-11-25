import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// Every query goes through the fake transaction client below, never the real client.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))

import {
  ACCOUNT_MERGE_RECORD_PREFIX,
  buildMergePreview,
  evaluateMergeBlockers,
  executeAccountMerge,
  SECRET_USER_FIELDS,
  USER_REFERENCE_HANDLING,
  type MergeInput,
  type MergeUserRow,
  type ReferenceCounts,
  type UserReference,
} from './admin-account-merge'
import { resetRevokedCardPolicyCache } from './revoked-card-policy'
import { buildAdminRevocationValue, buildRevokedCardValue } from './revoked-card-policy-fixture'
import {
  CARD_ID, LEGACY_ID, cardUser, createState, fakeTx, legacyUser, type FakeState,
} from '@/tests/helpers/account-merge-db'

const noRefs = Object.fromEntries(Object.keys(USER_REFERENCE_HANDLING).map((ref) => [ref, 0])) as ReferenceCounts
const asRow = (user: ReturnType<typeof legacyUser>): MergeUserRow => user
const blockersFor = (source = legacyUser(), target = cardUser(), refs: Partial<ReferenceCounts> = {}, revoked = { source: false, target: false }) =>
  evaluateMergeBlockers({
    source: asRow(source), target: asRow(target), sourceReferences: { ...noRefs, ...refs },
    sourceHasRevokedCard: revoked.source, targetCardRevoked: revoked.target,
  })

const input = (state: FakeState, fields: Partial<MergeInput> = {}): MergeInput => ({
  sourceId: LEGACY_ID,
  targetId: CARD_ID,
  sourceUpdatedAt: state.users[LEGACY_ID]?.updatedAt.toISOString() ?? '2024-05-01T09:00:00.000Z',
  targetUpdatedAt: state.users[CARD_ID]?.updatedAt.toISOString() ?? '2026-09-01T12:00:00.000Z',
  reason: 'same person: name and order phone match the card',
  actor: { id: 'admin-1', email: 'admin@test.com' },
  now: new Date('2026-11-25T10:00:00.000Z'),
  ...fields,
})

beforeEach(() => resetRevokedCardPolicyCache())

describe('USER_REFERENCE_HANDLING covers the schema', () => {
  // A new table that stores a user id must be decided on (move or block) before merges ship it.
  it('lists exactly the columns of prisma/schema.prisma that hold a User id', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const found = new Set<string>()
    let model = ''
    for (const line of schema.split('\n')) {
      const header = /^\s*model\s+(\w+)\s*\{/u.exec(line)
      if (header) { model = header[1]; continue }
      const field = /^\s*(\w*(?:userId|UserId|authorId))\s+String\b/u.exec(line)
      if (field && model !== 'User') found.add(`${model}.${field[1]}`)
      // Any relation to User must be on a column we know about.
      const relation = /^\s*\w+\s+User\??\s+@relation\(fields:\s*\[(\w+)\]/u.exec(line)
      if (relation) found.add(`${model}.${relation[1]}`)
    }
    expect([...found].sort()).toEqual(Object.keys(USER_REFERENCE_HANDLING).sort())
  })
})

describe('evaluateMergeBlockers', () => {
  it('allows the plain legacy-into-card case', () => {
    expect(blockersFor()).toEqual([])
  })

  it.each([
    ['staff source', legacyUser({ platformRole: 'admin' }), cardUser(), ['staff_account', 'not_customer']],
    ['manager source', legacyUser({ teamRole: 'manager' }), cardUser(), ['staff_account']],
    ['super admin target', legacyUser(), cardUser({ superAdmin: true }), ['staff_account']],
    ['source with card', legacyUser({ cardNumber: '9999' }), cardUser(), ['source_has_card']],
    ['placeholder source email', legacyUser({ email: 'card.1@client.local' }), cardUser(), ['source_no_email']],
    ['erased source', legacyUser({ email: 'anon-x@deleted.invalid' }), cardUser(), ['source_erased']],
    ['privacy accepted', legacyUser({ privacyAcknowledgedAt: new Date() }), cardUser(), ['source_activated']],
    ['own password set', legacyUser({ mustChangePassword: false }), cardUser(), ['source_activated']],
    ['mfa enrolled', legacyUser({ mfaEnabled: true }), cardUser(), ['source_activated']],
    ['company', legacyUser({ companyId: 'c1' }), cardUser(), ['source_company']],
    ['bonus balance', legacyUser({ bonusPoints: 350 }), cardUser(), ['source_bonus_balance']],
    ['negative balance', legacyUser({ bonusPoints: -5 }), cardUser(), ['source_bonus_balance']],
    ['target without card', legacyUser(), cardUser({ cardNumber: null }), ['target_no_card']],
    ['erased target', legacyUser(), cardUser({ cardRecoveryEmailHash: 'h' }), ['target_erased']],
  ])('refuses: %s', (_label, source, target, expected) => {
    expect(blockersFor(source, target)).toEqual(expected)
  })

  it.each([
    ['Session.userId', 'source_sessions'],
    ['InvitationToken.userId', 'source_invitations'],
    ['InvitationDelivery.userId', 'source_invitations'],
    ['PasswordResetToken.userId', 'source_pending_tokens'],
    ['BonusTransaction.userId', 'source_bonus_history'],
    ['CompanyMember.userId', 'source_company'],
    ['AuditLog.actorUserId', 'source_linked_records'],
  ] as Array<[UserReference, string]>)('refuses a source with %s rows', (ref, blocker) => {
    expect(blockersFor(legacyUser(), cardUser(), { [ref]: 1 })).toEqual([blocker])
  })

  it('moves, never blocks, on history rows', () => {
    const moved = Object.fromEntries(Object.entries(USER_REFERENCE_HANDLING).filter(([, action]) => action === 'move').map(([ref]) => [ref, 3]))
    expect(blockersFor(legacyUser(), cardUser(), moved)).toEqual([])
  })

  it('refuses revoked cards on either side and the same account', () => {
    expect(blockersFor(legacyUser(), cardUser(), {}, { source: true, target: false })).toEqual(['source_revoked_card'])
    expect(blockersFor(legacyUser(), cardUser(), {}, { source: false, target: true })).toEqual(['target_card_revoked'])
    expect(blockersFor(legacyUser(), legacyUser())).toContain('same_account')
  })
})

describe('executeAccountMerge', () => {
  it('moves history, deletes the legacy account and gives its email to the card account', async () => {
    const state = createState({
      savedAddresses: [{ id: 'addr-1', userId: LEGACY_ID }],
      wishlist: [{ id: 'w-1', userId: LEGACY_ID, productId: 'p1' }, { id: 'w-2', userId: LEGACY_ID, productId: 'p2' }, { id: 'w-3', userId: CARD_ID, productId: 'p1' }],
      productNews: [{ id: 'n-1', userId: LEGACY_ID, productId: 'p9' }],
      invitationTokens: [{ id: 'inv-1', userId: CARD_ID, status: 'sent' }, { id: 'inv-2', userId: CARD_ID, status: 'accepted' }],
      settings: { 'marketing:optout:card.4242@client.local': { email: 'card.4242@client.local', source: 'admin', optedOutAt: '2026-11-24T10:00:00.000Z' } },
    })
    const outcome = await executeAccountMerge(fakeTx(state), input(state))

    expect(outcome).toMatchObject({
      alreadyMerged: false, email: 'anna@example.com', emailChanged: true, suppressionCarried: true,
      dropped: { wishlist: 1, productNews: 0 },
      moved: { 'Order.userId': 1, 'SavedAddress.userId': 1, 'WishlistItem.userId': 1, 'ProductNewsSubscription.userId': 1 },
    })
    expect(state.users[LEGACY_ID]).toBeUndefined()
    expect(state.users[CARD_ID]).toMatchObject({ email: 'anna@example.com', cardNumber: '4242', bonusPoints: 0, phone: '20000001' })
    expect(state.orders[0].userId).toBe(CARD_ID)
    expect(state.wishlist.map((row) => [row.id, row.userId])).toEqual([['w-2', CARD_ID], ['w-3', CARD_ID]])
    // An open invitation went to the old (placeholder) address; the accepted one stays as history.
    expect(state.invitationTokens.map((row) => row.id)).toEqual(['inv-2'])
    // «Рассылки запрещены» follows the person to the new address.
    expect(state.settings['marketing:optout:anna@example.com']).toMatchObject({ source: 'admin' })
  })

  it('writes a recovery record with everything needed to undo it and no secrets', async () => {
    const state = createState({ wishlist: [{ id: 'w-1', userId: LEGACY_ID, productId: 'p1' }, { id: 'w-3', userId: CARD_ID, productId: 'p1' }] })
    await executeAccountMerge(fakeTx(state), input(state))
    const record = state.settings[`${ACCOUNT_MERGE_RECORD_PREFIX}${LEGACY_ID}`] as Record<string, never>
    expect(record).toMatchObject({
      version: 1,
      mergedBy: { id: 'admin-1' },
      source: { id: LEGACY_ID, email: 'anna@example.com', name: 'Anna Ozola', createdAt: '2024-05-01T09:00:00.000Z' },
      target: { id: CARD_ID, email: 'card.4242@client.local', updatedAt: '2026-09-01T12:00:00.000Z' },
      movedIds: { 'Order.userId': ['order-1'] },
      dropped: { wishlist: [{ id: 'w-1', productId: 'p1' }] },
    })
    const text = JSON.stringify(record)
    for (const field of SECRET_USER_FIELDS) expect(Object.keys(record.source)).not.toContain(field)
    expect(text).not.toContain('secret-hash')
  })

  it('fills only missing contact details on the card account', async () => {
    const state = createState({ users: { [LEGACY_ID]: legacyUser({ phone: '+37120000000' }), [CARD_ID]: cardUser({ name: null, phone: '20000001' }) } })
    await executeAccountMerge(fakeTx(state), input(state))
    expect(state.users[CARD_ID]).toMatchObject({ name: 'Anna Ozola', phone: '20000001' })
  })

  it('a retried request after success is a no-op, a merge into another account is refused', async () => {
    const state = createState()
    await executeAccountMerge(fakeTx(state), input(state))
    const json = (value: unknown) => JSON.parse(JSON.stringify(value))
    const snapshot = json({ users: state.users, orders: state.orders })
    await expect(executeAccountMerge(fakeTx(state), input(state, { sourceUpdatedAt: '2024-05-01T09:00:00.000Z' })))
      .resolves.toEqual({ alreadyMerged: true, targetId: CARD_ID })
    await expect(executeAccountMerge(fakeTx(state), input(state, { targetId: 'card-2' }))).rejects.toMatchObject({ code: 'already_merged' })
    expect(json({ users: state.users, orders: state.orders })).toEqual(snapshot)
  })

  it('refuses a stale preview without writing anything', async () => {
    const state = createState()
    const before = structuredClone(state.users)
    await expect(executeAccountMerge(fakeTx(state), input(state, { targetUpdatedAt: '2026-11-01T00:00:00.000Z' })))
      .rejects.toMatchObject({ code: 'optimistic_conflict', status: 409 })
    expect(state.users).toEqual(before)
    expect(state.settings).toEqual({})
  })

  it('re-checks the rules on the locked rows and writes nothing when blocked', async () => {
    const state = createState({ blockingRefs: { [LEGACY_ID]: { 'Session.userId': 1, 'BonusTransaction.userId': 2 } } })
    await expect(executeAccountMerge(fakeTx(state), input(state)))
      .rejects.toMatchObject({ code: 'blocked', blockers: ['source_sessions', 'source_bonus_history'] })
    expect(state.users[LEGACY_ID]).toBeDefined()
    expect(state.orders[0].userId).toBe(LEGACY_ID)
    expect(state.settings).toEqual({})
  })

  it('refuses revoked cards from the batch registry and from the admin panel', async () => {
    const batch = createState({ settings: { 'revoked-client-cards:v1': buildRevokedCardValue({ '4242': 'someone-else' }) } })
    await expect(executeAccountMerge(fakeTx(batch), input(batch))).rejects.toMatchObject({ blockers: ['target_card_revoked'] })
    resetRevokedCardPolicyCache()
    const admin = createState({ settings: { 'revoked-client-cards:admin:v1': buildAdminRevocationValue({ '7001': LEGACY_ID }) } })
    await expect(executeAccountMerge(fakeTx(admin), input(admin))).rejects.toMatchObject({ blockers: ['source_revoked_card'] })
  })

  it('refuses unknown accounts and the same id twice', async () => {
    const state = createState()
    await expect(executeAccountMerge(fakeTx(state), input(state, { sourceId: 'nobody' }))).rejects.toMatchObject({ code: 'not_found', status: 404 })
    await expect(executeAccountMerge(fakeTx(state), input(state, { sourceId: CARD_ID }))).rejects.toMatchObject({ blockers: ['same_account'] })
  })
})

describe('buildMergePreview', () => {
  it('shows both accounts, what moves and the result, without secrets', async () => {
    const state = createState({ wishlist: [{ id: 'w-1', userId: LEGACY_ID, productId: 'p1' }, { id: 'w-3', userId: CARD_ID, productId: 'p1' }] })
    const preview = await buildMergePreview(fakeTx(state), LEGACY_ID, CARD_ID)
    expect(preview).toMatchObject({
      source: { id: LEGACY_ID, email: 'anna@example.com', cardNumber: null, registered: false },
      target: { id: CARD_ID, cardNumber: '4242', updatedAt: '2026-09-01T12:00:00.000Z' },
      transfer: { orders: [{ id: 'order-1', total: '12.50', paymentStatus: 'paid' }], wishlistDuplicates: 1 },
      result: { email: 'anna@example.com', cardNumber: '4242', bonusPoints: 0, phone: '20000001' },
      blockers: [],
    })
    expect(JSON.stringify(preview)).not.toMatch(/secret|pkLast3|passwordHash/u)
    // Preview changes nothing.
    expect(state.users[LEGACY_ID]).toBeDefined()
    expect(state.settings).toEqual({})
  })
})
