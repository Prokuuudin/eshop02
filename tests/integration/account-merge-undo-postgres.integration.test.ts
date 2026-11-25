import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { assertNotProductionDatabaseUrl } from '../../scripts/e2e-database-guard'

const { sendEmailMock, requireAdminMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn(), requireAdminMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mailer', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  requireAdmin: requireAdminMock,
}))

// Review findings on 8ab0e75f, on real PostgreSQL (synthetic data only):
//  1. undo vs reset links / invitations / sessions issued after the merge, incl. concurrent issue;
//  2. no-FK writers (review votes, audit actors) racing a merge;
//  3. undo refused atomically when a mailing block changed; undo rollback and its audit row.
// Run: ALLOW_ACCOUNT_MERGE_DB_TESTS=isolated-postgres DATABASE_URL=postgresql://…@127.0.0.1:…/… \
//   npx vitest run --config vitest.integration.config.ts account-merge
const enabled = process.env.ALLOW_ACCOUNT_MERGE_DB_TESTS === 'isolated-postgres'
const suite = enabled ? describe : describe.skip

type Deferred = { promise: Promise<void>; resolve: () => void }
const deferred = (): Deferred => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const settledWithin = async (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => 'settled', () => 'settled'), sleep(ms).then(() => 'pending')])

suite('account merge undo and no-FK writers on isolated PostgreSQL', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let merge: typeof import('@/lib/admin-account-merge')
  let restore: typeof import('@/lib/admin-account-merge-restore')
  let ownerLock: typeof import('@/lib/account-owner-lock')
  let reviews: typeof import('@/lib/reviews-data-store')
  let audit: typeof import('@/lib/server-audit')
  let forgotPassword: typeof import('@/app/api/auth/forgot-password/route')['POST']
  let mergeRoute: typeof import('@/app/api/admin/users/merge/route')
  const created: { users: string[]; keys: string[]; reviews: string[] } = { users: [], keys: [], reviews: [] }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    assertNotProductionDatabaseUrl(process.env.DATABASE_URL, 'account merge undo integration tests')
    process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3999'
    ;({ prisma } = await import('@/lib/prisma'))
    merge = await import('@/lib/admin-account-merge')
    restore = await import('@/lib/admin-account-merge-restore')
    ownerLock = await import('@/lib/account-owner-lock')
    reviews = await import('@/lib/reviews-data-store')
    audit = await import('@/lib/server-audit')
    forgotPassword = (await import('@/app/api/auth/forgot-password/route')).POST
    mergeRoute = await import('@/app/api/admin/users/merge/route')
  })

  afterEach(async () => {
    const ids = created.users
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS merge_undo_it_fail ON "KeyValueSetting"')
    await prisma.reviewHelpfulVote.deleteMany({ where: { reviewId: { in: created.reviews } } })
    await prisma.review.deleteMany({ where: { id: { in: created.reviews } } })
    await prisma.order.deleteMany({ where: { userId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: ids } }, { actorUserId: { in: ids } }] } })
    await prisma.keyValueSetting.deleteMany({ where: { key: { in: created.keys } } })
    await prisma.rateLimit.deleteMany({}).catch(() => undefined)
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    created.users = []
    created.keys = []
    created.reviews = []
    sendEmailMock.mockReset()
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
  })

  async function seed() {
    const tag = randomUUID().slice(0, 8)
    const sourceId = `a-undo-it-${tag}`
    const targetId = `b-undo-it-${tag}`
    const adminId = `c-undo-it-admin-${tag}`
    const sourceEmail = `legacy-${tag}@example.invalid`
    const targetEmail = `card.${tag}@client.local`
    created.users.push(sourceId, targetId, adminId)
    created.keys.push(`account-merge:v1:${sourceId}`, `marketing:optout:${sourceEmail}`, `marketing:optout:${targetEmail}`, `undo-it-holder-${tag}`)
    await prisma.user.create({ data: { id: adminId, email: `admin-${tag}@example.invalid`, passwordHash: 'x', platformRole: 'admin', updatedAt: new Date() } })
    await prisma.user.create({ data: { id: sourceId, email: sourceEmail, passwordHash: '$2b$12$synthetic-legacy', name: 'Synthetic Legacy', mustChangePassword: true, updatedAt: new Date() } })
    await prisma.user.create({ data: { id: targetId, email: targetEmail, passwordHash: '$2b$10$synthetic-card', name: 'Synthetic Legacy', cardNumber: `8${tag.replace(/\D/gu, '').padEnd(5, '2').slice(0, 5)}`, updatedAt: new Date() } })
    await prisma.order.create({ data: {
      id: `undo-it-${tag}-1`, createdAt: new Date('2024-06-01T10:00:00.000Z'), items: [], subtotal: 10, tax: 2.1, delivery: 0, total: 12.1,
      deliveryMethod: 'pickup', paymentMethod: 'Payments.PurchaseOrder', paymentStatus: 'paid', firstName: 'Synthetic', lastName: 'Legacy',
      email: sourceEmail, phone: '000', address: 'Synthetic', city: 'Synthetic', userId: sourceId,
    } })
    // A block on the card account's placeholder address: the merge carries it to the merged address.
    await prisma.keyValueSetting.create({ data: { key: `marketing:optout:${targetEmail}`, value: { email: targetEmail, source: 'admin', optedOutAt: '2026-11-24T10:00:00.000Z' } } })
    const users = await prisma.user.findMany({ where: { id: { in: [sourceId, targetId] } }, select: { id: true, updatedAt: true } })
    const updatedAt = (id: string) => users.find((u) => u.id === id)!.updatedAt.toISOString()
    return { tag, sourceId, targetId, adminId, sourceEmail, targetEmail, sourceUpdatedAt: updatedAt(sourceId), targetUpdatedAt: updatedAt(targetId) }
  }
  type Seed = Awaited<ReturnType<typeof seed>>

  async function snapshot(s: Seed) {
    const ids = [s.sourceId, s.targetId]
    const rows = async (sql: string, ...params: unknown[]) =>
      (await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(sql, ...params)).map((r) => r.row)
    return {
      users: await rows(`SELECT to_jsonb(u) - 'passwordHash' AS row FROM "User" u WHERE id = ANY($1) ORDER BY id`, ids),
      orders: await rows(`SELECT to_jsonb(o) AS row FROM "Order" o WHERE id LIKE $1 ORDER BY id`, `undo-it-${s.tag}-%`),
      settings: await rows(`SELECT to_jsonb(k) - 'updatedAt' AS row FROM "KeyValueSetting" k WHERE key = ANY($1) ORDER BY key`, created.keys),
      audit: await rows(`SELECT to_jsonb(a) AS row FROM "AuditLog" a WHERE "entityId" = ANY($1) ORDER BY sequence`, ids),
    }
  }

  const runMerge = (s: Seed) => prisma.$transaction((tx) => merge.executeAccountMerge(tx, {
    sourceId: s.sourceId, targetId: s.targetId, sourceUpdatedAt: s.sourceUpdatedAt, targetUpdatedAt: s.targetUpdatedAt,
    reasonCode: 'phone_match', note: null, actor: { id: s.adminId, email: 'admin@example.invalid' },
  }), merge.ACCOUNT_MERGE_TRANSACTION)
  const runRestore = (s: Seed) => prisma.$transaction((tx) => restore.restoreAccountMerge(tx, s.sourceId), merge.ACCOUNT_MERGE_TRANSACTION)
  const requestReset = (email: string) => forgotPassword(new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST', body: JSON.stringify({ email, language: 'lv' }), headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
  }))
  /** Holds a write lock on KeyValueSetting until released; rolled back, never committed. */
  function holdSettingsTable(s: Seed) {
    const release = deferred()
    const held = deferred()
    const done = prisma.$transaction(async (tx) => {
      await tx.keyValueSetting.create({ data: { key: `undo-it-holder-${s.tag}`, value: {} } })
      held.resolve()
      await release.promise
      throw new Error('holder_rollback')
    }, { timeout: 20_000 }).catch(() => undefined)
    return { held: held.promise, release: () => { release.resolve(); return done } }
  }

  // ── 1. undo vs new access to the card account ────────────────────────────────────────────

  it('refuses the undo, writing nothing, once a reset link was issued for the merged address', async () => {
    const s = await seed()
    await runMerge(s)
    expect(await (await requestReset(s.sourceEmail)).json()).toEqual({ ok: true })
    expect(await prisma.passwordResetToken.count({ where: { userId: s.targetId } })).toBe(1)
    const merged = await snapshot(s)

    await expect(runRestore(s)).rejects.toMatchObject({ code: 'target_new_access' })
    expect(await snapshot(s)).toEqual(merged)
    expect(await prisma.keyValueSetting.count({ where: { key: `account-merge:v1:${s.sourceId}` } })).toBe(1)
  })

  it.each([
    ['a session', (s: Seed) => prisma.session.create({ data: { id: `undo-it-${s.tag}-s`, userId: s.targetId, tokenHash: `undo-it-${s.tag}`, expiresAt: new Date(Date.now() + 60_000) } })],
    ['an open invitation', (s: Seed) => prisma.invitationToken.create({ data: { tokenHash: `undo-it-${s.tag}-inv`, userId: s.targetId, email: s.sourceEmail, cardNumber: '0', expiresAt: new Date(Date.now() + 60_000) } })],
    ['an invitation delivery', (s: Seed) => prisma.invitationDelivery.create({ data: { userId: s.targetId, channel: 'email', status: 'sent' } })],
    ['an MFA challenge', (s: Seed) => prisma.mfaChallenge.create({ data: { userId: s.targetId, tokenHash: `undo-it-${s.tag}-mfa`, expiresAt: new Date(Date.now() + 60_000) } })],
  ])('refuses the undo after %s was opened on the card account', async (_label, open) => {
    const s = await seed()
    await runMerge(s)
    await open(s)
    await expect(runRestore(s)).rejects.toMatchObject({ code: 'target_new_access' })
    expect(await prisma.user.findUnique({ where: { id: s.sourceId } })).toBeNull()
    expect(await prisma.keyValueSetting.count({ where: { key: `account-merge:v1:${s.sourceId}` } })).toBe(1)
  })

  it('a reset requested while the undo runs is not issued for the card account', async () => {
    const s = await seed()
    await runMerge(s)
    // Pause the undo after it locked the card account (it waits for the settings table lock).
    const holder = holdSettingsTable(s)
    await holder.held
    const undoing = runRestore(s)
    await sleep(300)
    const reset = requestReset(s.sourceEmail)
    expect(await settledWithin(reset, 300)).toBe('pending')

    await holder.release()
    await expect(undoing).resolves.toMatchObject({ sourceId: s.sourceId })
    expect(await (await reset).json()).toEqual({ ok: true })
    // The address belongs to the restored legacy account again; the card account got no link.
    expect(await prisma.passwordResetToken.count({ where: { userId: s.targetId } })).toBe(0)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('an invitation issued while the undo runs is refused', async () => {
    const s = await seed()
    await runMerge(s)
    const { replaceInvitation } = await import('@/lib/invitations')
    const holder = holdSettingsTable(s)
    await holder.held
    const undoing = runRestore(s)
    await sleep(300)
    const invite = prisma.$transaction((tx) => replaceInvitation(tx, {
      userId: s.targetId, email: s.sourceEmail, cardNumber: '0', token: `undo-it-${s.tag}-token`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), language: 'lv',
    }))
    expect(await settledWithin(invite, 300)).toBe('pending')

    await holder.release()
    await expect(undoing).resolves.toMatchObject({ sourceId: s.sourceId })
    await expect(invite).rejects.toBeInstanceOf(ownerLock.AccountOwnerMissingError)
    expect(await prisma.invitationToken.count({ where: { userId: s.targetId } })).toBe(0)
  })

  // ── 2. no-FK writers racing a merge ──────────────────────────────────────────────────────

  async function reviewFor(s: Seed) {
    const id = `undo-it-${s.tag}-review`
    created.reviews.push(id)
    await prisma.review.create({ data: { id, productId: 'p1', author: 'Synthetic', rating: 5, title: 'Synthetic', text: 'Synthetic', createdAt: new Date() } })
    return id
  }
  function holdTargetRow(s: Seed) {
    const release = deferred()
    const held = deferred()
    const done = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${s.targetId} FOR UPDATE`
      held.resolve()
      await release.promise
    }, { timeout: 20_000 })
    return { held: held.promise, release: () => { release.resolve(); return done } }
  }

  it('a review vote and an audit row of the legacy account that wait on the merge write nothing', async () => {
    const s = await seed()
    const reviewId = await reviewFor(s)
    // The merge locks the legacy account (lower id) and then waits for the card account.
    const holder = holdTargetRow(s)
    await holder.held
    const merging = runMerge(s)
    await sleep(300)
    const vote = reviews.markReviewHelpful(reviewId, `user:${s.sourceId}`)
    const actor = { id: s.sourceId, email: s.sourceEmail, name: null } as unknown as Parameters<typeof audit.appendServerAudit>[2]
    const audited = prisma.$transaction((tx) => audit.appendServerAudit(tx, new NextRequest('http://localhost/x'), actor, {
      action: 'return.created', entityType: 'return', entityId: `undo-it-${s.tag}-return`,
    }))
    expect(await settledWithin(Promise.all([vote, audited]), 300)).toBe('pending')

    await holder.release()
    await expect(merging).resolves.toMatchObject({ alreadyMerged: false })
    await expect(vote).resolves.toBe('not_found')
    await expect(audited).rejects.toBeInstanceOf(ownerLock.AccountOwnerMissingError)
    expect(await prisma.reviewHelpfulVote.count({ where: { voterKey: `user:${s.sourceId}` } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { actorUserId: s.sourceId } })).toBe(0)
    expect((await prisma.review.findUniqueOrThrow({ where: { id: reviewId } })).helpful).toBe(0)
  })

  it('a review vote committed while the merge waits makes the merge refuse', async () => {
    const s = await seed()
    const reviewId = await reviewFor(s)
    const commit = deferred()
    const inserted = deferred()
    const writer = prisma.$transaction(async (tx) => {
      await ownerLock.lockAccountOwner(tx, s.sourceId)
      await tx.reviewHelpfulVote.create({ data: { reviewId, voterKey: `user:${s.sourceId}` } })
      inserted.resolve()
      await commit.promise
    }, { timeout: 20_000 })
    await inserted.promise
    const merging = runMerge(s)
    expect(await settledWithin(merging, 300)).toBe('pending')
    commit.resolve()
    await writer
    await expect(merging).rejects.toMatchObject({ code: 'blocked', blockers: ['source_site_activity'] })
    expect(await prisma.user.findUnique({ where: { id: s.sourceId } })).not.toBeNull()
  })

  // ── 3. mailing blocks, rollback and audit of the undo ────────────────────────────────────

  it.each([
    ['the block carried to the merged address was lifted', async (s: Seed) => {
      await prisma.keyValueSetting.delete({ where: { key: `marketing:optout:${s.sourceEmail}` } })
    }],
    ['the placeholder address block was changed', async (s: Seed) => {
      await prisma.keyValueSetting.update({ where: { key: `marketing:optout:${s.targetEmail}` }, data: { value: { email: s.targetEmail, source: 'self_service', optedOutAt: '2026-11-26T10:00:00.000Z' } } })
    }],
  ])('refuses the undo atomically when %s', async (_label, change) => {
    const s = await seed()
    await runMerge(s)
    await change(s)
    const changed = await snapshot(s)
    await expect(runRestore(s)).rejects.toMatchObject({ code: 'suppression_changed' })
    expect(await snapshot(s)).toEqual(changed)
    expect(await prisma.keyValueSetting.count({ where: { key: `account-merge:v1:${s.sourceId}` } })).toBe(1)
  })

  it('an undo that fails at its last statement rolls back and writes no audit row; a clean one is audited in the chain', async () => {
    const s = await seed()
    requireAdminMock.mockResolvedValue({ id: s.adminId, email: `admin-${s.tag}@example.invalid`, name: 'Synthetic Admin', platformRole: 'admin', superAdmin: false })
    await runMerge(s)
    const merged = await snapshot(s)
    const undo = () => mergeRoute.DELETE(new NextRequest('http://localhost/api/admin/users/merge', {
      method: 'DELETE', headers: { origin: 'http://localhost' },
      body: JSON.stringify({ sourceId: s.sourceId, reasonCode: 'other', note: 'merged by mistake', confirmed: true }),
    }))

    // Fail the last statement of the undo: deleting the recovery record.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION merge_undo_it_fail() RETURNS trigger AS $$
      BEGIN IF OLD.key LIKE 'account-merge:v1:a-undo-it-%' THEN RAISE EXCEPTION 'undo_it_forced_failure'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe('CREATE TRIGGER merge_undo_it_fail BEFORE DELETE ON "KeyValueSetting" FOR EACH ROW EXECUTE FUNCTION merge_undo_it_fail()')
    expect((await undo()).status).toBe(500)
    expect(await snapshot(s)).toEqual(merged)
    expect(await prisma.auditLog.count({ where: { action: 'user.accounts_merge_restored', entityId: s.sourceId } })).toBe(0)

    await prisma.$executeRawUnsafe('DROP TRIGGER merge_undo_it_fail ON "KeyValueSetting"')
    const response = await undo()
    expect(response.status).toBe(200)
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.accounts_merge_restored', entityId: s.sourceId } })
    expect(row).toMatchObject({ actorUserId: s.adminId, reason: 'other: merged by mistake' })
    const previous = await prisma.auditLog.findFirst({
      where: { sequence: { lt: row.sequence }, integrityHash: { not: null } }, orderBy: { sequence: 'desc' }, select: { integrityHash: true },
    })
    // Appended to the hash chain right after the last hashed row.
    expect(row.integrityHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(row.previousHash).toBe(previous?.integrityHash ?? null)
    expect(JSON.stringify({ before: row.before, after: row.after, details: row.details })).not.toMatch(/@|passwordHash|pkLast3|synthetic-legacy|synthetic-card/u)
  })
})
