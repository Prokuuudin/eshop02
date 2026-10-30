import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma, type ExtendedPrismaClient } from '@/lib/prisma'
import {
  persistTaxonomyBatch,
  persistTaxonomyBegin,
  persistTaxonomyFinalize,
  pruneTaxonomyStaging,
} from '@/lib/sync/hairshop-taxonomy-persistence'
import {
  TAXONOMY_BATCH_KINDS,
  canonicalizeTaxonomySnapshot,
  taxonomyBatchSha256,
  taxonomySnapshotSha256,
  type TaxonomyBatchRequest,
  type TaxonomyBeginRequest,
  type TaxonomyFinalizeRequest,
  type TaxonomySnapshotData,
} from '@/lib/sync/hairshop-taxonomy-sync'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/observability', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/observability')>()
  return {
    ...actual,
    logOperationalEvent: vi.fn((event: { level?: string; event: string }, error?: unknown) => {
      if (event.level === 'error') console.error(event.event, error)
    }),
  }
})

import { POST as taxonomyPost } from '@/app/api/internal/hairshop-catalog-sync/taxonomy/route'
import { POST as v1Post } from '@/app/api/internal/hairshop-catalog-sync/route'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('ep-long-glitter')) {
  throw new Error('Refusing to run the taxonomy suite against the production database')
}

const SECRET = 'taxonomy-integration-secret-'.padEnd(48, 'x')
const T0 = '2026-10-30T15:00:00.000Z'
const SOURCE_TS = '2026-01-01T00:00:00.000Z'

type Protocol = { begin: TaxonomyBeginRequest; batches: TaxonomyBatchRequest[]; finalize: TaxonomyFinalizeRequest }

function protocol(
  runId: string,
  input: TaxonomySnapshotData,
  { mode = 'apply', batchSize = 100, generatedAtUtc = T0 }: { mode?: 'apply' | 'dry-run'; batchSize?: number; generatedAtUtc?: string } = {},
): Protocol {
  const data = canonicalizeTaxonomySnapshot(input)
  const batches: TaxonomyBatchRequest['batch'][] = []
  for (const kind of TAXONOMY_BATCH_KINDS) {
    const items = data[kind] as unknown[]
    const total = Math.ceil(items.length / batchSize)
    for (let index = 0; index < total; index++) {
      const batch = { kind, batchId: `${kind}:${index}`, index, total, payloadSha256: '', items: items.slice(index * batchSize, (index + 1) * batchSize) } as TaxonomyBatchRequest['batch']
      batch.payloadSha256 = taxonomyBatchSha256(batch)
      batches.push(batch)
    }
  }
  const manifest = {
    source: 'nop390' as const,
    generatedAtUtc,
    categories: data.categories.length,
    manufacturers: data.manufacturers.length,
    productCategoryMappings: data.productCategories.length,
    productManufacturerMappings: data.productManufacturers.length,
    expectedBatchCount: batches.length,
    snapshotSha256: taxonomySnapshotSha256(data),
  }
  const base = { schemaVersion: 2 as const, runId, mode }
  return {
    begin: { ...base, operation: 'begin', manifest },
    batches: batches.map(batch => ({ ...base, operation: 'batch', snapshotSha256: manifest.snapshotSha256, batch })),
    finalize: { ...base, operation: 'finalize', manifest },
  }
}

function category(id: number, parent: number | null, label = 'Kategorija'): TaxonomySnapshotData['categories'][number] {
  return {
    categoryId: String(id), parentCategoryId: parent === null ? null : String(parent),
    names: { default: `${label} ${id}`, ru: `Категория ${id}`, lv: `Kategorija ${id} ā`, en: `Category ${id}` },
    slugs: { lv: `kategorija-${id}` }, published: id % 17 !== 0, createdOnUtc: SOURCE_TS, updatedOnUtc: T0,
  }
}

function manufacturer(id: number): TaxonomySnapshotData['manufacturers'][number] {
  return { manufacturerId: String(id), names: { default: `Brand ${id}` }, slugs: { default: `brand-${id}` }, published: true, createdOnUtc: SOURCE_TS, updatedOnUtc: T0 }
}

// Audit reference sizes (284 categories, 10,878 Product-Category edges); test data only.
function largeData(): TaxonomySnapshotData {
  const categories = Array.from({ length: 284 }, (_, index) => {
    const id = index + 1
    return category(id, id <= 8 ? null : 1 + ((id * 7919) % (id - 1)))
  })
  const manufacturers = Array.from({ length: 250 }, (_, index) => manufacturer(index + 1))
  const productCategories: TaxonomySnapshotData['productCategories'] = []
  const productManufacturers: TaxonomySnapshotData['productManufacturers'] = []
  for (let product = 1; productCategories.length < 10_878; product++) {
    for (let j = 0; j < 1 + (product % 3) && productCategories.length < 10_878; j++) {
      productCategories.push({ productId: String(1000 + product), categoryId: String(1 + ((product * 31 + j * 97) % 284)), displayOrder: j, isFeaturedProduct: j === 0 })
    }
    productManufacturers.push({ productId: String(1000 + product), manufacturerId: String(1 + (product % 250)), displayOrder: 0, isFeaturedProduct: false })
  }
  return { categories, manufacturers, productCategories, productManufacturers }
}

function smallData(label = 'Kategorija'): TaxonomySnapshotData {
  return {
    categories: [category(1, null, label), category(2, 1, label), category(3, 2, label)],
    manufacturers: [manufacturer(10), manufacturer(11)],
    productCategories: [
      { productId: '100', categoryId: '2', displayOrder: 1, isFeaturedProduct: false },
      { productId: '101', categoryId: '3', displayOrder: 2, isFeaturedProduct: true },
    ],
    productManufacturers: [
      { productId: '100', manufacturerId: '10', displayOrder: 1, isFeaturedProduct: false },
      { productId: '101', manufacturerId: '11', displayOrder: 1, isFeaturedProduct: false },
    ],
  }
}

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await taxonomyPost(new NextRequest('http://localhost/api/internal/hairshop-catalog-sync/taxonomy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hairshop-catalog-sync-key': SECRET },
    body: JSON.stringify(body),
  }))
  return { status: response.status, json: await response.json() as Record<string, unknown> }
}

async function inPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  }))
  return results
}

async function sendAll(p: Protocol): Promise<void> {
  expect((await post(p.begin)).status).toBe(200)
  for (const batch of p.batches) {
    const result = await post(batch)
    expect(result.status, JSON.stringify(result.json)).toBe(200)
  }
}

async function applySnapshot(p: Protocol): Promise<void> {
  await sendAll(p)
  const result = await post(p.finalize)
  expect(result.status, JSON.stringify(result.json)).toBe(200)
  expect(result.json.status).toBe('completed')
}

async function mirrorFingerprint(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ t: string; n: number; h: string }>>`
    SELECT 'c' AS t, count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x."sourceCategoryId")), '') AS h FROM "CatalogSourceCategory" x
    UNION ALL SELECT 'm', count(*)::int, coalesce(md5(string_agg(x::text, '|' ORDER BY x."sourceManufacturerId")), '') FROM "CatalogSourceManufacturer" x
    UNION ALL SELECT 'pc', count(*)::int, coalesce(md5(string_agg(x::text, '|' ORDER BY x."legacyProductId", x."sourceCategoryId")), '') FROM "CatalogSourceProductCategory" x
    UNION ALL SELECT 'pm', count(*)::int, coalesce(md5(string_agg(x::text, '|' ORDER BY x."legacyProductId", x."sourceManufacturerId")), '') FROM "CatalogSourceProductManufacturer" x`
  return rows.map(row => `${row.t}:${row.n}:${row.h}`).join(' ')
}

async function freshClient(): Promise<ExtendedPrismaClient> {
  vi.resetModules()
  delete (globalThis as { prisma?: unknown }).prisma
  return (await import('@/lib/prisma')).prisma
}

beforeAll(() => {
  process.env.HAIRSHOP_CATALOG_SYNC_SECRET = SECRET
  process.env.HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED = 'true'
  delete process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED
})

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "CatalogSourceProductCategory", "CatalogSourceProductManufacturer", "CatalogSourceCategory", "CatalogSourceManufacturer", "TaxonomySnapshotBatch", "TaxonomySnapshotSession"`
})

describe('taxonomy sync v2 persistent staging (isolated Postgres)', () => {
  it('accepts and applies a full-size snapshot through the HTTP route', async () => {
    const p = protocol('it-full-size-0001', largeData())
    expect(p.batches.length).toBeGreaterThan(150)
    expect((await post(p.begin)).json).toMatchObject({ status: 'accepted', sessionStatus: 'receiving' })

    const started = Date.now()
    const results = await inPool(p.batches.map(batch => () => post(batch)), 8)
    expect(results.every(result => result.status === 200 && result.json.status === 'accepted')).toBe(true)
    const batchesMs = Date.now() - started

    const finalizeStarted = Date.now()
    const finalized = await post(p.finalize)
    const finalizeMs = Date.now() - finalizeStarted
    expect(finalized.status, JSON.stringify(finalized.json)).toBe(200)
    expect(finalized.json).toMatchObject({
      status: 'completed', mirrorApplied: true,
      counts: { categories: 284, manufacturers: 250, productCategoryMappings: 10_878, productManufacturerMappings: p.begin.manifest.productManufacturerMappings },
    })

    expect(await prisma.catalogSourceCategory.count({ where: { isPresent: true } })).toBe(284)
    expect(await prisma.catalogSourceManufacturer.count({ where: { isPresent: true } })).toBe(250)
    expect(await prisma.catalogSourceProductCategory.count({ where: { isPresent: true } })).toBe(10_878)
    expect(await prisma.catalogSourceProductManufacturer.count({ where: { isPresent: true } })).toBe(p.begin.manifest.productManufacturerMappings)
    const session = await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: p.begin.runId } } })
    expect(session).toMatchObject({ status: 'completed', errorCount: 0, lastErrorCode: null })
    expect(session.appliedAt).not.toBeNull()

    const row = await prisma.catalogSourceCategory.findUniqueOrThrow({ where: { source_sourceCategoryId: { source: 'nop390', sourceCategoryId: '20' } } })
    const source = largeData().categories[19]
    expect(row.names).toEqual(source.names)
    expect(row.parentSourceCategoryId).toBe(source.parentCategoryId)
    expect(row.sourceCreatedAt.toISOString()).toBe(SOURCE_TS)
    expect(row.sourceUpdatedAt.toISOString()).toBe(T0)
    console.info(`[taxonomy-it] ${p.batches.length} batches in ${batchesMs} ms (8 parallel), finalize ${finalizeMs} ms`)
  })

  it('treats identical retries as no-ops and rejects conflicting retries', async () => {
    const p = protocol('it-retry-0001', smallData(), { batchSize: 1 })
    expect((await post(p.begin)).json.status).toBe('accepted')
    expect((await post(p.begin)).json.status).toBe('duplicate')
    expect((await post(p.batches[0])).json.status).toBe('accepted')
    expect((await post(p.batches[0])).json).toMatchObject({ status: 'duplicate', receivedBatchCount: 1 })

    const conflicting = structuredClone(p.batches[0])
    const item = conflicting.batch.items[0] as { names: { default: string } }
    item.names.default = 'Changed'
    conflicting.batch.payloadSha256 = taxonomyBatchSha256(conflicting.batch)
    expect(await post(conflicting)).toMatchObject({ status: 409, json: { error: 'batch_conflict' } })

    const otherManifest = { ...p.begin, manifest: { ...p.begin.manifest, categories: 4 } }
    expect(await post(otherManifest)).toMatchObject({ status: 409, json: { error: 'begin_conflict' } })
    expect(await prisma.taxonomySnapshotBatch.count()).toBe(1)
  })

  it('rejects corrupted checksums without storing anything', async () => {
    const p = protocol('it-checksum-0001', smallData(), { batchSize: 1 })
    await post(p.begin)
    const corrupted = structuredClone(p.batches[0])
    corrupted.batch.payloadSha256 = 'f'.repeat(64)
    expect(await post(corrupted)).toMatchObject({ status: 409, json: { error: 'batch_hash_mismatch' } })
    expect(await post({ ...p.batches[0], snapshotSha256: 'e'.repeat(64) })).toMatchObject({ status: 409, json: { error: 'snapshot_hash_mismatch' } })
    expect(await post({ ...p.batches[0], batch: { ...p.batches[0].batch, batchId: 'categories:7' } })).toMatchObject({ status: 422, json: { error: 'invalid_batch_id' } })
    expect(await post({ ...p.batches[0], mode: 'dry-run' })).toMatchObject({ status: 409, json: { error: 'mode_mismatch' } })
    expect(await post({ ...protocol('it-unknown-run-0001', smallData()).batches[0] })).toMatchObject({ status: 404, json: { error: 'session_not_found' } })
    expect(await prisma.taxonomySnapshotBatch.count()).toBe(0)
  })

  it('resumes after a process restart using only database state', async () => {
    const p = protocol('it-restart-0001', largeData(), { batchSize: 500 })
    const half = Math.floor(p.batches.length / 2)
    const first = await freshClient()
    await persistTaxonomyBegin(p.begin, first)
    for (const batch of p.batches.slice(0, half)) await persistTaxonomyBatch(batch, first)
    await first.$disconnect()

    const second = await freshClient()
    const resumed = await persistTaxonomyBegin(p.begin, second)
    expect(resumed).toMatchObject({ status: 'duplicate', receivedBatchCount: half })
    const statuses = []
    for (const batch of p.batches) statuses.push((await persistTaxonomyBatch(batch, second)).status)
    expect(statuses.filter(status => status === 'duplicate')).toHaveLength(half)
    expect(await persistTaxonomyFinalize(p.finalize, second)).toMatchObject({ status: 'completed', mirrorApplied: true })
    await second.$disconnect()
    expect(await prisma.catalogSourceProductCategory.count()).toBe(10_878)
  })

  it('serializes parallel duplicate batches and parallel finalize calls', async () => {
    const p = protocol('it-parallel-0001', smallData(), { batchSize: 1 })
    await post(p.begin)
    const duplicates = await Promise.all(Array.from({ length: 6 }, () => post(p.batches[0])))
    expect(duplicates.filter(result => result.json.status === 'accepted')).toHaveLength(1)
    expect(duplicates.filter(result => result.json.status === 'duplicate')).toHaveLength(5)
    await Promise.all(p.batches.slice(1).map(batch => post(batch)))

    const finals = await Promise.all(Array.from({ length: 4 }, () => post(p.finalize)))
    expect(finals.every(result => result.status === 200)).toBe(true)
    expect(finals.filter(result => result.json.status === 'completed')).toHaveLength(1)
    expect(finals.filter(result => result.json.status === 'duplicate')).toHaveLength(3)
    expect(await prisma.catalogSourceCategory.count()).toBe(3)
    expect(await prisma.taxonomySnapshotBatch.count()).toBe(p.batches.length)
  })

  it('leaves the active snapshot untouched by an incomplete snapshot and completes after the missing batch', async () => {
    await applySnapshot(protocol('it-base-0001', smallData()))
    const active = await mirrorFingerprint()

    const next = protocol('it-incomplete-0001', smallData('Updated'), { batchSize: 1, generatedAtUtc: '2026-10-30T16:00:00.000Z' })
    expect((await post(next.begin)).status).toBe(200)
    for (const batch of next.batches.slice(0, -1)) await post(batch)
    expect(await post(next.finalize)).toMatchObject({ status: 422, json: { error: 'snapshot_incomplete' } })
    expect(await mirrorFingerprint()).toBe(active)
    const session = await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: next.begin.runId } } })
    expect(session).toMatchObject({ status: 'receiving', lastErrorCode: 'SNAPSHOT_INCOMPLETE', errorCount: 1, appliedAt: null })

    await post(next.batches[next.batches.length - 1])
    expect((await post(next.finalize)).json.status).toBe('completed')
    expect(await mirrorFingerprint()).not.toBe(active)
    const updated = await prisma.catalogSourceCategory.findUniqueOrThrow({ where: { source_sourceCategoryId: { source: 'nop390', sourceCategoryId: '1' } } })
    expect((updated.names as { default: string }).default).toBe('Updated 1')
  })

  it('rejects invalid hierarchy and orphaned references and keeps the active snapshot', async () => {
    await applySnapshot(protocol('it-base-0002', smallData()))
    const active = await mirrorFingerprint()
    const variants: Array<[string, (data: TaxonomySnapshotData) => void]> = [
      ['category_cycle', data => { data.categories[0].parentCategoryId = '3' }],
      ['missing_category_parent', data => { data.categories[1].parentCategoryId = '999' }],
      ['duplicate_category', data => { data.categories.push({ ...data.categories[2] }) }],
      ['duplicate_product_category', data => { data.productCategories.push({ ...data.productCategories[0] }) }],
      ['missing_mapping_category', data => { data.productCategories[0].categoryId = '404' }],
      ['missing_mapping_manufacturer', data => { data.productManufacturers[0].manufacturerId = '404' }],
    ]
    let run = 0
    for (const [code, mutate] of variants) {
      const data = smallData('Broken')
      mutate(data)
      const p = protocol(`it-invalid-${String(++run).padStart(4, '0')}`, data, { batchSize: 1, generatedAtUtc: '2026-10-30T17:00:00.000Z' })
      await sendAll(p)
      expect(await post(p.finalize), code).toMatchObject({ status: 422, json: { error: code } })
      const session = await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: p.begin.runId } } })
      expect(session).toMatchObject({ status: 'rejected', lastErrorCode: code.toUpperCase(), appliedAt: null })
      expect(await post(p.finalize)).toMatchObject({ status: 409, json: { error: 'session_closed' } })
      expect(await post(p.batches[0])).toMatchObject({ status: 409, json: { error: 'session_closed' } })
      expect(await mirrorFingerprint()).toBe(active)
    }
  })

  it('never lets an older snapshot replace a newer active one, also under concurrent finalize', async () => {
    await applySnapshot(protocol('it-newer-0001', smallData('Newer'), { generatedAtUtc: '2026-10-30T18:00:00.000Z' }))
    const active = await mirrorFingerprint()
    const older = protocol('it-older-0001', smallData('Older'), { generatedAtUtc: '2026-10-30T12:00:00.000Z' })
    await sendAll(older)
    expect(await post(older.finalize)).toMatchObject({ status: 409, json: { error: 'stale_snapshot' } })
    expect((await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: older.begin.runId } } })).status).toBe('rejected')
    expect(await mirrorFingerprint()).toBe(active)

    const runA = protocol('it-concurrent-a-0001', smallData('RunA'), { generatedAtUtc: '2026-10-30T19:00:00.000Z' })
    const runB = protocol('it-concurrent-b-0001', smallData('RunB'), { generatedAtUtc: '2026-10-30T20:00:00.000Z' })
    await Promise.all([sendAll(runA), sendAll(runB)])
    const [a, b] = await Promise.all([post(runA.finalize), post(runB.finalize)])
    expect(b.json.status).toBe('completed')
    expect(a.json.status === 'completed' || a.json.error === 'stale_snapshot').toBe(true)
    const final = await prisma.catalogSourceCategory.findUniqueOrThrow({ where: { source_sourceCategoryId: { source: 'nop390', sourceCategoryId: '1' } } })
    expect((final.names as { default: string }).default).toBe('RunB 1')
  })

  it('soft-marks rows missing from later snapshots and never deletes them', async () => {
    const withoutThree = (): TaxonomySnapshotData => {
      const data = smallData()
      data.categories = data.categories.filter(row => row.categoryId !== '3')
      data.productCategories = data.productCategories.filter(row => row.categoryId !== '3')
      return data
    }
    await applySnapshot(protocol('it-missing-0001', smallData(), { generatedAtUtc: '2026-10-30T10:00:00.000Z' }))
    await applySnapshot(protocol('it-missing-0002', withoutThree(), { generatedAtUtc: '2026-10-30T11:00:00.000Z' }))
    const second = await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: 'it-missing-0002' } } })
    const where = { source_sourceCategoryId: { source: 'nop390', sourceCategoryId: '3' } }
    expect(await prisma.catalogSourceCategory.findUniqueOrThrow({ where })).toMatchObject({
      isPresent: false, missingSnapshotCount: 1, missingSinceSnapshotId: second.id, names: smallData().categories[2].names,
    })
    expect(await prisma.catalogSourceProductCategory.count({ where: { isPresent: false } })).toBe(1)

    await applySnapshot(protocol('it-missing-0003', withoutThree(), { generatedAtUtc: '2026-10-30T12:00:00.000Z' }))
    expect(await prisma.catalogSourceCategory.findUniqueOrThrow({ where })).toMatchObject({ isPresent: false, missingSnapshotCount: 2, missingSinceSnapshotId: second.id })

    await applySnapshot(protocol('it-missing-0004', smallData(), { generatedAtUtc: '2026-10-30T13:00:00.000Z' }))
    expect(await prisma.catalogSourceCategory.findUniqueOrThrow({ where })).toMatchObject({ isPresent: true, missingSnapshotCount: 0, missingSinceAt: null, missingSinceSnapshotId: null })
    expect(await prisma.catalogSourceCategory.count()).toBe(3)
    expect(await prisma.catalogSourceProductCategory.count({ where: { isPresent: true } })).toBe(2)
  })

  it('validates a dry-run snapshot without touching the mirror', async () => {
    await applySnapshot(protocol('it-base-0003', smallData()))
    const active = await mirrorFingerprint()
    const dry = protocol('it-dry-run-0001', smallData('Dry'), { mode: 'dry-run', generatedAtUtc: '2026-10-31T00:00:00.000Z' })
    await sendAll(dry)
    expect((await post(dry.finalize)).json).toMatchObject({ status: 'completed', mirrorApplied: false })
    expect((await prisma.taxonomySnapshotSession.findUniqueOrThrow({ where: { source_runId: { source: 'nop390', runId: dry.begin.runId } } })).appliedAt).toBeNull()
    expect(await mirrorFingerprint()).toBe(active)
  })

  it('prunes staged payloads of old closed sessions and expires abandoned ones', async () => {
    await applySnapshot(protocol('it-prune-applied-0001', smallData(), { batchSize: 1 }))
    const abandoned = protocol('it-prune-abandoned-0001', smallData(), { batchSize: 1 })
    await post(abandoned.begin)
    await post(abandoned.batches[0])
    const active = await mirrorFingerprint()
    const total = await prisma.taxonomySnapshotBatch.count()

    expect(await pruneTaxonomyStaging()).toEqual({ expiredSessions: 0, deletedBatches: 0 })
    await prisma.$executeRaw`UPDATE "TaxonomySnapshotSession" SET "createdAt" = "createdAt" - interval '15 days'`
    expect(await pruneTaxonomyStaging()).toEqual({ expiredSessions: 1, deletedBatches: total })
    expect(await prisma.taxonomySnapshotSession.count()).toBe(2)
    expect(await mirrorFingerprint()).toBe(active)
    expect(await post(abandoned.begin)).toMatchObject({ status: 409, json: { error: 'session_closed' } })
  })

  it('keeps the v1 new-product endpoint and products unchanged', async () => {
    const existing = await prisma.product.findFirstOrThrow({ where: { isDeleted: false, sku: { not: null } }, select: { sku: true } })
    const productCount = await prisma.product.count()
    const response = await v1Post(new NextRequest('http://localhost/api/internal/hairshop-catalog-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hairshop-catalog-sync-key': SECRET },
      body: JSON.stringify({
        schemaVersion: 1, runId: 'it-v1-compat-0001', mode: 'dry-run',
        products: [{
          legacyProductId: 999_999_001, sku: existing.sku, ean: null, published: true,
          titles: { default: 'Compatibility probe' }, descriptions: {}, categoryNames: [], manufacturerName: null,
          images: [], createdOnUtc: SOURCE_TS, updatedOnUtc: T0,
        }],
      }),
    }))
    const json = await response.json() as { schemaVersion: number; results: Array<{ status: string }> }
    expect(response.status).toBe(200)
    expect(json.schemaVersion).toBe(1)
    expect(json.results).toHaveLength(1)
    expect(json.results[0].status).not.toBe('created')
    expect(await prisma.product.count()).toBe(productCount)
  })
})
