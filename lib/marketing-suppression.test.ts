import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { Prisma } from '@/generated/prisma/client'

// In-memory KeyValueSetting: the suppression list is plain rows keyed by normalized email.
const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  failReads: false,
  sendEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn(), logApiError: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/prisma', () => {
  type Where = { key: string | { in: string[] } }
  const read = () => { if (h.failReads) throw new Error('db unavailable') }
  const keyValueSetting = {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
      read()
      return h.kv.has(where.key) ? { key: where.key, value: h.kv.get(where.key) } : null
    }),
    findMany: vi.fn(async ({ where }: { where: Where }) => {
      read()
      const keys = typeof where.key === 'string' ? [where.key] : where.key.in
      return keys.filter((key) => h.kv.has(key)).map((key) => ({ key, value: h.kv.get(key) }))
    }),
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; value: unknown } }) => {
      if (!h.kv.has(where.key)) h.kv.set(create.key, create.value)
      return { key: where.key, value: h.kv.get(where.key) }
    }),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
      const had = h.kv.delete(where.key)
      return { count: had ? 1 : 0 }
    }),
  }
  return { prisma: { keyValueSetting } }
})

import { prisma } from '@/lib/prisma'
import {
  addMarketingSuppression,
  carryMarketingSuppression,
  getMarketingSuppressions,
  isMarketingSuppressed,
  marketingSuppressionKey,
  removeMarketingSuppression,
  sendMarketingEmail,
  suppressedUserIds,
} from '@/lib/marketing-suppression'
import { getMarketingOptedOutSet, unsubscribeFromMarketing } from '@/lib/newsletter-store'
import { addInvitationSuppression } from '@/lib/invitation-suppression'

const db = prisma as unknown as Parameters<typeof addMarketingSuppression>[0]

beforeEach(() => {
  h.kv.clear()
  h.failReads = false
  h.sendEmail.mockReset()
  h.sendEmail.mockResolvedValue(undefined)
})

describe('suppression list keyed by normalized email', () => {
  it('treats case and surrounding spaces as the same person (several accounts, one address)', async () => {
    await addMarketingSuppression(db, { email: ' Anna@Example.LV ', source: 'admin', setByUserId: 'admin-1', setByName: 'Admin', reason: 'asked by phone' })
    expect(marketingSuppressionKey('anna@example.lv')).toBe('marketing:optout:anna@example.lv')
    expect(await isMarketingSuppressed('ANNA@example.lv')).toBe(true)
    expect(await isMarketingSuppressed('anna@example.lv')).toBe(true)
    const entry = (await getMarketingSuppressions(['Anna@example.lv'])).get('anna@example.lv')
    expect(entry).toMatchObject({ source: 'admin', setByUserId: 'admin-1', setByName: 'Admin', reason: 'asked by phone' })
    expect(Date.parse(entry!.optedOutAt)).not.toBeNaN()
  })

  it('keeps the first entry: a later self-service click never downgrades an admin block', async () => {
    expect(await addMarketingSuppression(db, { email: 'a@x.lv', source: 'admin', setByName: 'Admin', reason: 'documented' })).toEqual({ created: true })
    await unsubscribeFromMarketing('A@X.lv')
    expect((await getMarketingSuppressions(['a@x.lv'])).get('a@x.lv')).toMatchObject({ source: 'admin', reason: 'documented' })
    expect(await addMarketingSuppression(db, { email: 'a@x.lv', source: 'admin' })).toEqual({ created: false })
  })

  it('reads rows written before this change ({ email, optedOutAt }) as a self-service opt-out', async () => {
    h.kv.set('marketing:optout:old@x.lv', { email: 'old@x.lv', optedOutAt: '2026-10-01T00:00:00.000Z' })
    expect((await getMarketingSuppressions(['old@x.lv'])).get('old@x.lv')).toMatchObject({ source: 'self_service', optedOutAt: '2026-10-01T00:00:00.000Z', reason: null })
    expect(await getMarketingOptedOutSet(['OLD@x.lv'])).toEqual(new Set(['old@x.lv']))
  })

  it('removes an entry and reports what was removed', async () => {
    await addMarketingSuppression(db, { email: 'b@x.lv', source: 'admin' })
    expect(await removeMarketingSuppression(db, 'B@x.lv')).toMatchObject({ email: 'b@x.lv', source: 'admin' })
    expect(await isMarketingSuppressed('b@x.lv')).toBe(false)
    expect(await removeMarketingSuppression(db, 'b@x.lv')).toBeNull()
  })

  it('carries the block to a changed address and keeps the old one blocked', async () => {
    await addMarketingSuppression(db, { email: 'old@x.lv', source: 'admin', setByName: 'Admin', reason: 'r' })
    expect(await carryMarketingSuppression(db, 'old@x.lv', 'New@X.lv')).toBe(true)
    expect(await isMarketingSuppressed('new@x.lv')).toBe(true)
    expect(await isMarketingSuppressed('old@x.lv')).toBe(true)
    expect(await carryMarketingSuppression(db, 'free@x.lv', 'other@x.lv')).toBe(false)
    expect(await isMarketingSuppressed('other@x.lv')).toBe(false)
  })
})

describe('sendMarketingEmail — the check runs right before SMTP', () => {
  it('sends to a client without a block', async () => {
    expect(await sendMarketingEmail('c@x.lv', 'S', '<p>h</p>', { category: 'invitation' })).toBe('sent')
    expect(h.sendEmail).toHaveBeenCalledWith('c@x.lv', 'S', '<p>h</p>', undefined)
  })

  it('stops an email planned before the block was set (queued, resumed or retried)', async () => {
    const planned = ['q1@x.lv', 'Q2@x.lv', 'q3@x.lv']
    await addMarketingSuppression(db, { email: 'q2@x.lv', source: 'admin' })
    const outcomes = []
    for (const to of planned) outcomes.push(await sendMarketingEmail(to, 'S', 'H', { category: 'card_rules_campaign' }))
    expect(outcomes).toEqual(['sent', 'suppressed', 'sent'])
    expect(h.sendEmail.mock.calls.map((call) => call[0])).toEqual(['q1@x.lv', 'q3@x.lv'])
    // A retry of the same email later is refused again.
    expect(await sendMarketingEmail('q2@x.lv', 'S', 'H', { category: 'card_rules_campaign' })).toBe('suppressed')
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('stops an invitation-only opt-out immediately before SMTP without blocking other mailings', async () => {
    await addInvitationSuppression(db, { userId: 'u-opted-out', source: 'client_link' })
    expect(await sendMarketingEmail('client@x.lv', 'S', 'H', { category: 'invitation', userId: 'u-opted-out' })).toBe('invitation_suppressed')
    expect(h.sendEmail).not.toHaveBeenCalled()

    expect(await sendMarketingEmail('client@x.lv', 'S', 'H', { category: 'broadcast', userId: 'u-opted-out' })).toBe('sent')
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('keeps the full mailing block as the priority when both restrictions exist', async () => {
    await addMarketingSuppression(db, { email: 'both@x.lv', source: 'admin' })
    await addInvitationSuppression(db, { userId: 'u-both', source: 'admin' })
    expect(await sendMarketingEmail('both@x.lv', 'S', 'H', { category: 'invitation', userId: 'u-both' })).toBe('suppressed')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('fails closed: when the list cannot be read, nothing is sent', async () => {
    h.failReads = true
    await expect(sendMarketingEmail('c@x.lv', 'S', 'H', { category: 'broadcast' })).rejects.toThrow('db unavailable')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('refuses several recipients in one marketing email', async () => {
    await addMarketingSuppression(db, { email: 'blocked@x.lv', source: 'admin' })
    await expect(sendMarketingEmail('ok@x.lv,blocked@x.lv', 'S', 'H', { category: 'broadcast' })).rejects.toThrow('marketing_email_single_recipient_required')
    await expect(sendMarketingEmail('ok@x.lv;blocked@x.lv', 'S', 'H', { category: 'broadcast' })).rejects.toThrow()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('passes options (List-Unsubscribe, attachments) through unchanged', async () => {
    await sendMarketingEmail('c@x.lv', 'S', 'H', { category: 'broadcast' }, { listUnsubscribeUrl: 'https://shop.test/u' })
    expect(h.sendEmail).toHaveBeenCalledWith('c@x.lv', 'S', 'H', { listUnsubscribeUrl: 'https://shop.test/u' })
  })
})

describe('suppressedUserIds on real SQL (PGlite)', () => {
  let pg: PGlite
  const sqlDb = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = Prisma.sql(strings, ...values)
      return pg.query(query.text, query.values as unknown[]).then((result) => result.rows)
    },
  } as unknown as Parameters<typeof suppressedUserIds>[0]

  beforeEach(async () => {
    pg = new PGlite()
    await pg.exec(`
      CREATE TABLE "User" (id text PRIMARY KEY, email text NOT NULL UNIQUE);
      CREATE TABLE "KeyValueSetting" (key text PRIMARY KEY, value jsonb NOT NULL);
      INSERT INTO "User" VALUES ('u1','Anna@Example.lv'), ('u2','anna@example.lv '), ('u3','other@example.lv');
      INSERT INTO "KeyValueSetting" VALUES ('marketing:optout:anna@example.lv', '{"source":"admin"}');
    `)
  })
  afterEach(async () => { await pg.close() })

  it('matches every account whose email normalizes to a blocked address', async () => {
    expect((await suppressedUserIds(sqlDb)).sort()).toEqual(['u1', 'u2'])
    expect(await suppressedUserIds(sqlDb, ['u2', 'u3'])).toEqual(['u2'])
    expect(await suppressedUserIds(sqlDb, [])).toEqual([])
  })

  it('a re-imported (deleted and recreated) client with the same address is still blocked', async () => {
    await pg.exec(`DELETE FROM "User" WHERE id IN ('u1','u2'); INSERT INTO "User" VALUES ('u9','ANNA@EXAMPLE.LV');`)
    expect(await suppressedUserIds(sqlDb, ['u9', 'u3'])).toEqual(['u9'])
  })
})
