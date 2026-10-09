import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import {
  BACKUP_KEY_PREFIX, MANUAL_IMPORT_MAX_BYTES, applyManualImport, consumePendingPreview, createPreImportBackup,
  decodeUpload, evaluateFeed, restorePreImportBackup, savePendingPreview, sha256Hex,
} from './manual-import'
import { PREFLIGHT_THRESHOLDS } from './sync-preflight'

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Parsing a production-sized feed takes seconds; the fixture is 10x smaller and only the
// ABSOLUTE row minimum is scaled with it. Every ratio threshold stays the production one.
const ROWS = 1_500
const thresholds = PREFLIGHT_THRESHOLDS as { feedMinRows: number }
const originalFeedMinRows = thresholds.feedMinRows
beforeAll(() => { thresholds.feedMinRows = originalFeedMinRows / 10 })
afterAll(() => { thresholds.feedMinRows = originalFeedMinRows })

type Item = { sku: string; price2?: string; wh?: number[] }

/** wh = quantities for XML warehouse ids 1..9 (ids 1,2,3,6 = 10000,10001,10002,10005 count). */
function makeXml(items: Item[]): string {
  const body = items.map(({ sku, price2 = '10.00', wh = [1, 1, 1, 0, 0, 1, 0, 0, 0] }) =>
    `<item><sku>${sku}</sku><price1>12</price1><price2>${price2}</price2><price3>5</price3><price4>0</price4><quantity>4</quantity>` +
    `<warehouses>${wh.map((q, i) => `<warehouse id="${i + 1}">${q}</warehouse>`).join('')}</warehouses></item>`).join('')
  return `﻿<?xml version="1.0" encoding="utf-8"?><root>${body}</root>`
}

const baseItems = (): Item[] => Array.from({ length: ROWS }, (_, i) => ({ sku: `S${i}` }))

interface DbState {
  kv: Map<string, unknown>
  lockHeld: boolean
  previousProductsTotal: number | null
  linked: Array<{ externalId: string; price: string; stock: number; isActive: boolean; isDeleted: boolean; erpPriceMissing: boolean; manualPriceApproved: boolean; manualApprovedPrice: string | null }>
}

function makeDb(overrides: Partial<DbState> = {}) {
  const state: DbState = {
    kv: new Map(),
    lockHeld: false,
    previousProductsTotal: ROWS,
    linked: Array.from({ length: ROWS }, (_, i) => ({ externalId: `S${i}`, price: '10.00', stock: 4, isActive: true, isDeleted: false, erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null })),
    ...overrides,
  }
  let runSeq = 0
  const db = {
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('AS owned')) return [{ owned: true }]
      if (sql.includes('AS fingerprint')) return [{ fingerprint: 'catalog-v1' }]
      if (sql.includes('AS hash')) return [{ hash: 'extra-v1' }]
      if (sql.includes('SELECT key')) return [{ key: 'sync-run-lock' }]
      if (sql.includes('AS held')) return [{ held: state.lockHeld }]
      if (sql.includes('INSERT INTO "KeyValueSetting"')) return state.lockHeld ? [] : [{ key: 'sync-run-lock' }]
      if (sql.startsWith('DELETE FROM "KeyValueSetting"')) {
        const [key, previewId, sha, actorId] = params as string[]
        const value = state.kv.get(key) as Record<string, string> | undefined
        if (!value || value.previewId !== previewId || value.sha256 !== sha || value.actorId !== actorId) return []
        state.kv.delete(key)
        return [{ value }]
      }
      if (sql.includes('"manualPriceApproved"')) return state.linked.filter(p => !p.isDeleted)
      if (sql.includes('"isActive", "isDeleted"')) return state.linked
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`)
    }),
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => (sql.includes('UPDATE "Product"') ? params.length / 6 : 1)),
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (state.kv.has(where.key) ? { key: where.key, value: state.kv.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => { state.kv.set(where.key, structuredClone(create.value)) }),
      create: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
        if (state.kv.has(data.key)) throw new Error('unique violation')
        state.kv.set(data.key, structuredClone(data.value))
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => { state.kv.set(where.key, structuredClone(data.value)) }),
      findMany: vi.fn(async ({ where }: { where: { key: { startsWith: string } } }) =>
        [...state.kv.keys()].filter(k => k.startsWith(where.key.startsWith)).sort().reverse().map(key => ({ key }))),
      deleteMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => { for (const k of where.key.in) state.kv.delete(k) }),
    },
    syncRun: {
      findUniqueOrThrow: vi.fn(async () => ({ status: 'running', productsSynced: 0, errorSample: {} })),
      findFirst: vi.fn(async () => (state.previousProductsTotal === null ? null : { productsTotal: state.previousProductsTotal })),
      create: vi.fn(async () => ({ id: `run-${++runSeq}` })),
      update: vi.fn(async () => ({})),
    },
    product: {
      findMany: vi.fn(async () => state.linked.map((p, i) => ({ id: `p${i}`, sku: p.externalId, ...p }))),
    },
  }
  ;(db as typeof db & { $transaction: unknown }).$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  return { db: db as unknown as ExtendedPrismaClient, raw: db, state }
}

async function preview(db: ExtendedPrismaClient, xml: string, actorId = 'admin-1') {
  const decoded = decodeUpload(new TextEncoder().encode(xml), 'export.xml')
  if (!decoded.ok) throw new Error(decoded.error)
  const evaluation = await evaluateFeed(db, decoded.xml)
  const pending = await savePendingPreview(db, { sha256: decoded.sha256, fileName: 'export.xml', sizeBytes: xml.length, actorId, xml: decoded.xml })
  return { evaluation, pending }
}

// ─── Upload validation ───────────────────────────────────────────────────────

describe('decodeUpload', () => {
  const enc = (s: string) => new TextEncoder().encode(s)

  it('accepts a UTF-8 export.xml and hashes the exact uploaded bytes (BOM included)', () => {
    const bytes = enc(makeXml([{ sku: 'A' }]))
    const result = decodeUpload(bytes, 'export.xml')
    expect(result).toMatchObject({ ok: true, sha256: sha256Hex(bytes) })
    if (result.ok) expect(sha256Hex(result.xml)).toBe(result.sha256)
  })

  it.each([
    ['empty file', new Uint8Array(), 'export.xml', 'empty_file'],
    ['wrong extension', enc('<root/>'), 'export.csv', 'not_xml_file'],
    ['invalid UTF-8', new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]), 'export.xml', 'invalid_encoding'],
    ['non-UTF-8 declaration', enc('<?xml version="1.0" encoding="windows-1257"?><root/>'), 'export.xml', 'invalid_encoding'],
    ['DOCTYPE (XXE)', enc('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>'), 'export.xml', 'forbidden_xml_construct'],
    ['ENTITY expansion', enc('<root><!ENTITY a "aaaa"></root>'), 'export.xml', 'forbidden_xml_construct'],
  ])('rejects %s', (_label, bytes, name, error) => {
    expect(decodeUpload(bytes, name)).toEqual({ ok: false, error })
  })

  it('rejects files above the size limit without decoding them', () => {
    expect(decodeUpload(new Uint8Array(MANUAL_IMPORT_MAX_BYTES + 1), 'export.xml')).toEqual({ ok: false, error: 'file_too_large' })
  })
})

// ─── Preview (read-only evaluation) ──────────────────────────────────────────

describe('evaluateFeed', () => {
  it('passes a correct full export and reports matched rows with no inserts or deactivations', async () => {
    const items = baseItems()
    items[0].price2 = '11.00'
    const { db, raw } = makeDb()
    const { preflight, summary } = await evaluateFeed(db, makeXml(items))
    expect(preflight.hard).toEqual([])
    expect(summary).toMatchObject({ rows: ROWS, matched: ROWS, unlinked: 0, priceChanges: 1, stockChanges: 0, inserts: 0, deactivations: 0 })
    expect(raw.$executeRawUnsafe).not.toHaveBeenCalled()
    expect(raw.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('blocks corrupted XML', async () => {
    const { db } = makeDb()
    const xml = makeXml(baseItems()).slice(0, 5000)
    const { preflight, summary } = await evaluateFeed(db, xml)
    expect(preflight.hard.some(h => h.startsWith('invalid XML'))).toBe(true)
    expect(summary.rows).toBe(0)
  })

  it('blocks an incomplete export (feed shrank vs the previous full run)', async () => {
    const { db } = makeDb()
    const { preflight, summary } = await evaluateFeed(db, makeXml(baseItems().slice(0, 1_000)))
    expect(preflight.hard.some(h => h.includes('feed shrank'))).toBe(true)
    expect(summary.linkedMissingFromXml).toBe(500)
  })

  it('blocks duplicate SKUs', async () => {
    const items = baseItems()
    items[1].sku = items[0].sku
    const { db } = makeDb()
    const { preflight, summary } = await evaluateFeed(db, makeXml(items))
    expect(preflight.hard.some(h => h.includes('duplicate externalId/SKU'))).toBe(true)
    expect(summary.duplicateSkus).toBe(1)
  })

  it('counts price2=0 as kept price (no change) and warns below the hard limit', async () => {
    const items = baseItems()
    for (let i = 0; i < 150; i++) items[i].price2 = '0'
    const { db } = makeDb()
    const { preflight, summary } = await evaluateFeed(db, makeXml(items))
    expect(preflight.hard).toEqual([])
    expect(summary.priceZero).toBe(150)
    expect(summary.priceChanges).toBe(0)
    expect(preflight.warnings.some(w => w.includes('price2=0'))).toBe(true)
  })

  it('blocks mass price2=0', async () => {
    const items = baseItems()
    for (let i = 0; i < 300; i++) items[i].price2 = '0'
    const { db } = makeDb()
    const { preflight } = await evaluateFeed(db, makeXml(items))
    expect(preflight.hard.some(h => h.includes('price2=0'))).toBe(true)
  })

  it('ignores excluded warehouses (10003/4/6/7 and slot 9) in available stock', async () => {
    const items = baseItems()
    items[0].wh = [0, 0, 0, 50, 50, 0, 50, 50, 50]
    const { db } = makeDb()
    const { products, summary } = await evaluateFeed(db, makeXml(items))
    expect(products[0].stock).toBe(0)
    expect(products[1].stock).toBe(4)
    expect(summary.stockToZero).toBe(1)
  })

  it('blocks a mass stock drop to zero', async () => {
    const items = baseItems()
    for (let i = 0; i < 500; i++) items[i].wh = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const { db } = makeDb()
    const { preflight } = await evaluateFeed(db, makeXml(items))
    expect(preflight.hard.some(h => h.includes('would drop to stock 0'))).toBe(true)
  })
})

// ─── Preview → apply binding ─────────────────────────────────────────────────

describe('manual numeric preflight regression', () => {
  it.each(['0x10', '-1', 'Infinity', '1e2'])('blocks price2=%s before interpreting products', async value => {
    const { db } = makeDb()
    const items = baseItems()
    items[0].price2 = value
    const evaluation = await evaluateFeed(db, makeXml(items))
    expect(evaluation.preflight.hard.some(message => message.includes('invalid price'))).toBe(true)
    expect(evaluation.products).toEqual([])
    expect(evaluation.summary.invalidValues).toBe(1)
  })
})

describe('consumePendingPreview', () => {
  it('can be consumed exactly once (no repeated apply of one preview)', async () => {
    const { db } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    const input = { previewId: pending.previewId, sha256: pending.sha256, actorId: 'admin-1' }
    expect((await consumePendingPreview(db, input)).ok).toBe(true)
    expect(await consumePendingPreview(db, input)).toEqual({ ok: false, error: 'preview_not_found' })
  })

  it('refuses a different SHA or a different user and keeps the preview', async () => {
    const { db, state } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    expect(await consumePendingPreview(db, { previewId: pending.previewId, sha256: 'f'.repeat(64), actorId: 'admin-1' })).toEqual({ ok: false, error: 'preview_mismatch' })
    expect(await consumePendingPreview(db, { previewId: pending.previewId, sha256: pending.sha256, actorId: 'admin-2' })).toEqual({ ok: false, error: 'preview_mismatch' })
    expect(state.kv.size).toBe(1)
  })

  it('refuses stored content that no longer matches the previewed SHA (tampering)', async () => {
    const { db, state } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    const stored = [...state.kv.values()][0] as { xml: string }
    stored.xml = stored.xml.replace('<price2>10.00</price2>', '<price2>99.00</price2>')
    expect(await consumePendingPreview(db, { previewId: pending.previewId, sha256: pending.sha256, actorId: 'admin-1' })).toEqual({ ok: false, error: 'content_mismatch' })
  })

  it('refuses an expired preview', async () => {
    const { db } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    const later = new Date(Date.now() + 31 * 60 * 1000)
    expect(await consumePendingPreview(db, { previewId: pending.previewId, sha256: pending.sha256, actorId: 'admin-1' }, later)).toEqual({ ok: false, error: 'preview_expired' })
  })

  it('a newer upload supersedes the older preview', async () => {
    const { db } = makeDb()
    const first = await preview(db, makeXml(baseItems()))
    await preview(db, makeXml(baseItems().reverse()))
    expect(await consumePendingPreview(db, { previewId: first.pending.previewId, sha256: first.pending.sha256, actorId: 'admin-1' })).toEqual({ ok: false, error: 'preview_mismatch' })
  })
})

// ─── Apply ───────────────────────────────────────────────────────────────────

describe('applyManualImport orchestration (SQL guarantees verified separately)', () => {
  it('uses the atomic transaction rather than the batch runner', async () => {
    const { db, raw, state } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    const runSync = vi.fn()
    const outcome = await applyManualImport({ db, runSync }, { ...pending, actorId: 'admin-1' })
    expect(outcome.status).toBe('completed')
    expect(runSync).not.toHaveBeenCalled()
    expect(raw.$executeRawUnsafe.mock.calls.some(([sql]) => sql.includes('LOCK TABLE "Product"'))).toBe(true)
    expect(state.kv.has('grins-manual-import-applied:' + pending.sha256)).toBe(true)
    expect(raw.syncRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'running', errorSample: expect.objectContaining({ actorId: 'admin-1', xmlSha256: pending.sha256 }) }) })
  })
  it('rejects repeated XML even with a new preview and returns original run id', async () => {
    const { db } = makeDb()
    const runSync = vi.fn()
    const first = await preview(db, makeXml(baseItems()))
    await applyManualImport({ db, runSync }, { ...first.pending, actorId: 'admin-1' })
    const second = await preview(db, makeXml(baseItems()))
    expect(await applyManualImport({ db, runSync }, { ...second.pending, actorId: 'admin-1' })).toMatchObject({ status: 'rejected', error: 'already_applied', runId: 'run-1' })
  })
  it('does not consume a preview or write catalog under a competing lease', async () => {
    const { db, state, raw } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    state.lockHeld = true
    expect(await applyManualImport({ db, runSync: vi.fn() }, { ...pending, actorId: 'admin-1' })).toMatchObject({ status: 'rejected', error: 'sync_running' })
    expect(state.kv.has('grins-manual-import-pending')).toBe(true)
    expect(raw.$executeRawUnsafe).not.toHaveBeenCalled()
  })
  it('recomputes preflight after locking and refuses without product writes', async () => {
    const { db, state, raw } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    for (const row of state.linked) row.stock = 50
    expect(await applyManualImport({ db, runSync: vi.fn() }, { ...pending, actorId: 'admin-1' })).toMatchObject({ status: 'rejected', error: 'preflight_failed' })
    expect(raw.$executeRawUnsafe.mock.calls.some(([sql]) => sql.includes('UPDATE "Product"'))).toBe(false)
  })
  it('backup error stops before product SQL and journals a stable error code', async () => {
    const { db, raw } = makeDb()
    const { pending } = await preview(db, makeXml(baseItems()))
    raw.keyValueSetting.create.mockRejectedValueOnce(new Error('postgresql://secret-canary:password@host/db'))
    expect(await applyManualImport({ db, runSync: vi.fn() }, { ...pending, actorId: 'admin-1' })).toMatchObject({ status: 'rejected', error: 'backup_failed' })
    expect(raw.$executeRawUnsafe.mock.calls.some(([sql]) => sql.includes('UPDATE "Product"'))).toBe(false)
    expect(JSON.stringify(raw.syncRun.update.mock.calls)).not.toContain('secret-canary')
  })
})

describe('legacy backup inspection', () => {
  it('pins backups instead of deleting recovery evidence on subsequent attempts', async () => {
    const { db, state } = makeDb()
    for (let i = 0; i < 7; i++) await createPreImportBackup(db, { previewId: `p${i}`, sha256: 'a'.repeat(64) }, new Date(Date.UTC(2026, 9, 8, 10, i)))
    expect([...state.kv.keys()].filter(k => k.startsWith(BACKUP_KEY_PREFIX))).toHaveLength(7)
  })
  it('permits read-only comparison of legacy snapshots', async () => {
    const { db, state } = makeDb()
    const { key } = await createPreImportBackup(db, { previewId: 'p', sha256: 'a'.repeat(64) })
    state.linked[0].stock = 1
    expect(await restorePreImportBackup(db, key, { execute: false })).toMatchObject({ differing: 1, restored: 0 })
  })
  it('refuses legacy snapshot execution because it cannot detect intervening sales', async () => {
    const { db, raw } = makeDb()
    const { key } = await createPreImportBackup(db, { previewId: 'p', sha256: 'a'.repeat(64) })
    await expect(restorePreImportBackup(db, key, { execute: true })).rejects.toThrow('Legacy backup')
    expect(raw.$executeRawUnsafe.mock.calls.some(([sql]) => sql.includes('UPDATE "Product"'))).toBe(false)
  })
})
