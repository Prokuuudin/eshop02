import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assertNotProductionDatabaseUrl } from '../../scripts/e2e-database-guard'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))

// Account merge and its undo on real PostgreSQL: transactions, rollback, row locks against
// concurrent writers, and an exact round trip. Synthetic data only. Run against a disposable DB:
//   ALLOW_ACCOUNT_MERGE_DB_TESTS=isolated-postgres DATABASE_URL=postgresql://…@127.0.0.1:…/… \
//     npx vitest run --config vitest.integration.config.ts tests/integration/account-merge-postgres.integration.test.ts
// CI runs it in the `account-merge-postgres` job against a postgres service container.
const enabled = process.env.ALLOW_ACCOUNT_MERGE_DB_TESTS === 'isolated-postgres'
const suite = enabled ? describe : describe.skip

type Deferred = { promise: Promise<void>; resolve: () => void }
const deferred = (): Deferred => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Resolves to 'pending' if the promise has not settled within `ms`. */
const settledWithin = async (promise: Promise<unknown>, ms: number) =>
  Promise.race([promise.then(() => 'settled', () => 'settled'), sleep(ms).then(() => 'pending')])

suite('account merge on isolated PostgreSQL', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let merge: typeof import('@/lib/admin-account-merge')
  let restore: typeof import('@/lib/admin-account-merge-restore')
  let ownerLock: typeof import('@/lib/account-owner-lock')
  const created: { users: string[]; promo: string[]; keys: string[] } = { users: [], promo: [], keys: [] }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    assertNotProductionDatabaseUrl(process.env.DATABASE_URL, 'account merge integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    merge = await import('@/lib/admin-account-merge')
    restore = await import('@/lib/admin-account-merge-restore')
    ownerLock = await import('@/lib/account-owner-lock')
  })

  afterEach(async () => {
    const ids = created.users
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS merge_it_fail ON "KeyValueSetting"')
    await prisma.order.deleteMany({ where: { userId: { in: ids } } })
    await prisma.wishlistItem.deleteMany({ where: { userId: { in: ids } } })
    await prisma.promoCodeRedemption.deleteMany({ where: { userId: { in: ids } } })
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await prisma.keyValueSetting.deleteMany({ where: { key: { in: created.keys } } })
    await prisma.user.deleteMany({ where: { id: { in: ids } } })
    await prisma.promoCode.deleteMany({ where: { id: { in: created.promo } } })
    created.users = []
    created.promo = []
    created.keys = []
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
  })

  /** A legacy account without a card and a card holder, with history on both. Ids sort source < target. */
  async function seed() {
    const tag = randomUUID().slice(0, 8)
    const sourceId = `a-merge-it-${tag}`
    const targetId = `b-merge-it-${tag}`
    const sourceEmail = `legacy-${tag}@example.invalid`
    const targetEmail = `card.${tag}@client.local`
    created.users.push(sourceId, targetId)
    created.keys.push(`account-merge:v1:${sourceId}`, `marketing:optout:${sourceEmail}`, `marketing:optout:${targetEmail}`)
    await prisma.user.create({ data: {
      id: sourceId, email: sourceEmail, passwordHash: '$2b$12$synthetic-legacy-hash', name: 'Synthetic Legacy',
      mustChangePassword: true, marketingConsent: true, marketingConsentAt: new Date('2024-03-04T05:06:07.123Z'),
      avatarUrl: '/synthetic.png', createdAt: new Date('2024-05-01T09:00:00.000Z'), updatedAt: new Date(),
    } })
    await prisma.user.create({ data: {
      id: targetId, email: targetEmail, passwordHash: '$2b$10$synthetic-card-hash', name: 'Synthetic Legacy',
      phone: '20000001', cardNumber: `9${tag.replace(/\D/gu, '').padEnd(5, '1').slice(0, 5)}`, pkLast3: '901',
      createdAt: new Date('2026-08-01T12:00:00.000Z'), updatedAt: new Date(),
    } })
    const order = (id: string, userId: string) => prisma.order.create({ data: {
      id, createdAt: new Date('2024-06-01T10:00:00.000Z'), items: [], subtotal: 10, tax: 2.1, delivery: 0, total: 12.1,
      deliveryMethod: 'pickup', paymentMethod: 'Payments.PurchaseOrder', paymentStatus: 'paid', firstName: 'Synthetic',
      lastName: 'Legacy', email: sourceEmail, phone: '000', address: 'Synthetic', city: 'Synthetic', userId,
    } })
    await order(`merge-it-${tag}-1`, sourceId)
    await order(`merge-it-${tag}-2`, sourceId)
    await prisma.savedAddress.create({ data: { id: `merge-it-${tag}-addr`, userId: sourceId, email: sourceEmail, firstName: 'S', lastName: 'L', phone: '000', address: 'Synthetic 1', city: 'Synthetic' } })
    // p1 is on both wishlists (dropped and kept for undo), p2 only on the legacy one (moved).
    await prisma.wishlistItem.createMany({ data: [
      { id: `merge-it-${tag}-w1`, userId: sourceId, productId: 'p1', addedAt: new Date('2024-07-01T00:00:00.000Z') },
      { id: `merge-it-${tag}-w2`, userId: sourceId, productId: 'p2' },
      { id: `merge-it-${tag}-w3`, userId: targetId, productId: 'p1' },
    ] })
    await prisma.productNewsSubscription.create({ data: { id: `merge-it-${tag}-n1`, userId: sourceId, productId: 'p1', productTitle: 'Synthetic', notifyPromo: false } })
    await prisma.productNewsSubscription.create({ data: { id: `merge-it-${tag}-n2`, userId: targetId, productId: 'p1', productTitle: 'Synthetic' } })
    const promoId = `merge-it-${tag}-promo`
    created.promo.push(promoId)
    await prisma.promoCode.create({ data: { id: promoId, code: `MERGEIT${tag}`.toUpperCase(), discount: 5 } })
    await prisma.promoCodeRedemption.create({ data: { id: `merge-it-${tag}-r1`, promoCodeId: promoId, orderId: `merge-it-${tag}-1`, userId: sourceId, email: sourceEmail, discount: 1.5 } })
    await prisma.userNotification.create({ data: { id: `merge-it-${tag}-un`, userId: sourceId, title: 'Synthetic', message: 'Synthetic' } })
    // An admin once edited the legacy account: audit history about it stays untouched.
    await prisma.auditLog.create({ data: { id: `merge-it-${tag}-audit`, adminEmail: 'staff@example.invalid', action: 'user.updated', entityType: 'user', entityId: sourceId } })
    // The card account's placeholder address carries a mailing block that must follow the person.
    await prisma.keyValueSetting.create({ data: { key: `marketing:optout:${targetEmail}`, value: { email: targetEmail, source: 'admin', optedOutAt: '2026-11-24T10:00:00.000Z' } } })
    const users = await prisma.user.findMany({ where: { id: { in: [sourceId, targetId] } }, select: { id: true, updatedAt: true } })
    const updatedAt = (id: string) => users.find((u) => u.id === id)!.updatedAt.toISOString()
    return { tag, sourceId, targetId, sourceEmail, targetEmail, promoId, sourceUpdatedAt: updatedAt(sourceId), targetUpdatedAt: updatedAt(targetId) }
  }
  type Seed = Awaited<ReturnType<typeof seed>>

  /** Every row the merge may touch, as PostgreSQL stores it. The password hash is left out (never restorable). */
  async function snapshot(s: Seed) {
    const ids = [s.sourceId, s.targetId]
    const rows = async (sql: string, ...params: unknown[]) =>
      (await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(sql, ...params)).map((r) => r.row)
    return {
      users: await rows(`SELECT to_jsonb(u) - 'passwordHash' AS row FROM "User" u WHERE id = ANY($1) ORDER BY id`, ids),
      orders: await rows(`SELECT to_jsonb(o) AS row FROM "Order" o WHERE "userId" = ANY($1) OR id LIKE $2 ORDER BY id`, ids, `merge-it-${s.tag}-%`),
      addresses: await rows(`SELECT to_jsonb(a) AS row FROM "SavedAddress" a WHERE "userId" = ANY($1) ORDER BY id`, ids),
      wishlist: await rows(`SELECT to_jsonb(w) AS row FROM "WishlistItem" w WHERE "userId" = ANY($1) ORDER BY id`, ids),
      news: await rows(`SELECT to_jsonb(n) AS row FROM "ProductNewsSubscription" n WHERE "userId" = ANY($1) ORDER BY id`, ids),
      promo: await rows(`SELECT to_jsonb(p) AS row FROM "PromoCodeRedemption" p WHERE "promoCodeId" = $1 ORDER BY id`, s.promoId),
      notifications: await rows(`SELECT to_jsonb(n) AS row FROM "UserNotification" n WHERE "userId" = ANY($1) ORDER BY id`, ids),
      audit: await rows(`SELECT to_jsonb(a) AS row FROM "AuditLog" a WHERE "entityId" = ANY($1) ORDER BY id`, ids),
      settings: await rows(`SELECT to_jsonb(k) - 'updatedAt' AS row FROM "KeyValueSetting" k WHERE key = ANY($1) ORDER BY key`, created.keys),
    }
  }

  const runMerge = (s: Seed, overrides: Partial<import('@/lib/admin-account-merge').MergeInput> = {}) =>
    prisma.$transaction((tx) => merge.executeAccountMerge(tx, {
      sourceId: s.sourceId, targetId: s.targetId, sourceUpdatedAt: s.sourceUpdatedAt, targetUpdatedAt: s.targetUpdatedAt,
      reasonCode: 'phone_match', note: null, actor: { id: 'staff-it', email: 'staff@example.invalid' }, ...overrides,
    }), merge.ACCOUNT_MERGE_TRANSACTION)
  const runRestore = (s: Seed) => prisma.$transaction((tx) => restore.restoreAccountMerge(tx, s.sourceId), merge.ACCOUNT_MERGE_TRANSACTION)

  it('merges everything onto the card account and the undo restores the exact prior state', async () => {
    const s = await seed()
    const before = await snapshot(s)

    const outcome = await runMerge(s)
    expect(outcome).toMatchObject({
      alreadyMerged: false, email: s.sourceEmail, suppressionCarried: true,
      moved: { 'Order.userId': 2, 'SavedAddress.userId': 1, 'WishlistItem.userId': 1, 'ProductNewsSubscription.userId': 0, 'PromoCodeRedemption.userId': 1, 'UserNotification.userId': 1 },
      dropped: { 'WishlistItem.userId': 1, 'ProductNewsSubscription.userId': 1 },
      profileCopied: ['avatarUrl', 'marketingConsent'],
    })

    // After the merge: no row points at the source, the card account has the email and history.
    expect(await prisma.user.findUnique({ where: { id: s.sourceId } })).toBeNull()
    const target = await prisma.user.findUniqueOrThrow({ where: { id: s.targetId } })
    expect(target).toMatchObject({ email: s.sourceEmail, avatarUrl: '/synthetic.png', marketingConsent: true, pkLast3: '901', bonusPoints: 0 })
    const remaining = await merge.countUserReferences(prisma, s.sourceId, s.sourceEmail)
    expect(Object.entries(remaining).filter(([key, n]) => n > 0 && key !== 'AuditLog.entityId')).toEqual([])
    expect(remaining['AuditLog.entityId']).toBe(1)
    expect(await prisma.keyValueSetting.findUnique({ where: { key: `marketing:optout:${s.sourceEmail}` } })).not.toBeNull()

    // The recovery record carries no secrets.
    const record = (await prisma.keyValueSetting.findUniqueOrThrow({ where: { key: `account-merge:v1:${s.sourceId}` } })).value as Record<string, unknown>
    const text = JSON.stringify(record)
    expect(text).not.toContain('synthetic-legacy-hash')
    expect(text).not.toContain('synthetic-card-hash')
    for (const field of merge.SECRET_USER_FIELDS) expect(Object.keys(record.source as object)).not.toContain(field)
    expect(Object.keys(record.targetBefore as object)).not.toContain('pkLast3')

    await runRestore(s)
    const after = await snapshot(s)
    expect(after).toEqual(before)
    expect(await prisma.keyValueSetting.findUnique({ where: { key: `account-merge:v1:${s.sourceId}` } })).toBeNull()
    // The old password hash is not restorable: the restored legacy account gets an unknown one.
    const restored = await prisma.user.findUniqueOrThrow({ where: { id: s.sourceId }, select: { passwordHash: true } })
    expect(restored.passwordHash).toMatch(/^\$2[aby]\$12\$/u)
    expect(restored.passwordHash).not.toBe('$2b$12$synthetic-legacy-hash')
  })

  it('rolls everything back when the last write fails', async () => {
    const s = await seed()
    const before = await snapshot(s)
    // Fail the very last statement of the merge (the recovery record insert).
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION merge_it_fail() RETURNS trigger AS $$
      BEGIN IF NEW.key LIKE 'account-merge:v1:a-merge-it-%' THEN RAISE EXCEPTION 'merge_it_forced_failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe('CREATE TRIGGER merge_it_fail BEFORE INSERT ON "KeyValueSetting" FOR EACH ROW EXECUTE FUNCTION merge_it_fail()')

    await expect(runMerge(s)).rejects.toThrow(/merge_it_forced_failure/u)
    expect(await snapshot(s)).toEqual(before)
  })

  it('a writer of a plain user-id column that waits on the merge finds the account gone and writes nothing', async () => {
    const s = await seed()
    // Hold the target row so the merge locks the source (lower id) and then waits.
    const holdTarget = deferred()
    const targetHeld = deferred()
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${s.targetId} FOR UPDATE`
      targetHeld.resolve()
      await holdTarget.promise
    }, { timeout: 20_000 })
    await targetHeld.promise
    const merging = runMerge(s)
    await sleep(300)

    const orderId = `merge-it-${s.tag}-late`
    const writer = prisma.$transaction(async (tx) => {
      await ownerLock.lockAccountOwner(tx, s.sourceId)
      await tx.order.create({ data: {
        id: orderId, createdAt: new Date(), items: [], subtotal: 1, tax: 0, delivery: 0, total: 1, deliveryMethod: 'pickup',
        paymentMethod: 'bank', firstName: 'Late', lastName: 'Writer', email: s.sourceEmail, phone: '000', address: 'x', city: 'x', userId: s.sourceId,
      } })
    })
    expect(await settledWithin(writer, 300)).toBe('pending')

    holdTarget.resolve()
    await holder
    await expect(merging).resolves.toMatchObject({ alreadyMerged: false })
    await expect(writer).rejects.toBeInstanceOf(ownerLock.AccountOwnerMissingError)
    expect(await prisma.order.findUnique({ where: { id: orderId } })).toBeNull()
    expect(await prisma.order.count({ where: { userId: s.sourceId } })).toBe(0)
  })

  it('a merge that waits on a writer moves the row the writer committed', async () => {
    const s = await seed()
    const commitWriter = deferred()
    const writerInserted = deferred()
    const orderId = `merge-it-${s.tag}-concurrent`
    const writer = prisma.$transaction(async (tx) => {
      await ownerLock.lockAccountOwner(tx, s.sourceId)
      await tx.order.create({ data: {
        id: orderId, createdAt: new Date(), items: [], subtotal: 1, tax: 0, delivery: 0, total: 1, deliveryMethod: 'pickup',
        paymentMethod: 'Payments.PurchaseOrder', paymentStatus: 'paid', firstName: 'Concurrent', lastName: 'Writer',
        email: s.sourceEmail, phone: '000', address: 'x', city: 'x', userId: s.sourceId,
      } })
      writerInserted.resolve()
      await commitWriter.promise
    }, { timeout: 20_000 })
    await writerInserted.promise

    const merging = runMerge(s)
    expect(await settledWithin(merging, 300)).toBe('pending')
    commitWriter.resolve()
    await writer

    await expect(merging).resolves.toMatchObject({ moved: { 'Order.userId': 3 } })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).userId).toBe(s.targetId)
    expect(await prisma.order.count({ where: { userId: s.sourceId } })).toBe(0)
  })

  it('two simultaneous merges of the same pair: one merges, the other is told it is done', async () => {
    const s = await seed()
    const results = await Promise.allSettled([runMerge(s), runMerge(s)])
    const values = results.map((r) => (r.status === 'fulfilled' ? r.value.alreadyMerged : r.reason))
    expect(values.sort()).toEqual([false, true])
    expect(await prisma.order.count({ where: { userId: s.targetId } })).toBe(2)
    expect(await prisma.keyValueSetting.count({ where: { key: `account-merge:v1:${s.sourceId}` } })).toBe(1)
  })

  it('refuses a blocked or stale merge without writing anything', async () => {
    const s = await seed()
    const before = await snapshot(s)
    await expect(runMerge(s, { targetUpdatedAt: '2020-01-01T00:00:00.000Z' })).rejects.toMatchObject({ code: 'optimistic_conflict' })
    await prisma.session.create({ data: { id: `merge-it-${s.tag}-s`, userId: s.sourceId, tokenHash: `merge-it-${s.tag}`, expiresAt: new Date(Date.now() + 60_000) } })
    await expect(runMerge(s)).rejects.toMatchObject({ code: 'blocked', blockers: ['source_sessions'] })
    await prisma.session.deleteMany({ where: { userId: s.sourceId } })
    expect(await snapshot(s)).toEqual(before)
  })

  it('refuses to undo when the card account changed after the merge', async () => {
    const s = await seed()
    await runMerge(s)
    await prisma.user.update({ where: { id: s.targetId }, data: { phone: '20000002' } })
    const merged = await snapshot(s)
    await expect(runRestore(s)).rejects.toMatchObject({ code: 'target_changed' })
    expect(await snapshot(s)).toEqual(merged)
  })
})
