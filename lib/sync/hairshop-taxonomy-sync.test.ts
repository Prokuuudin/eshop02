import { describe, expect, it } from 'vitest'
import {
  acceptTaxonomyBatch,
  beginTaxonomySnapshot,
  canonicalizeTaxonomySnapshot,
  finalizeTaxonomySnapshot,
  hairshopTaxonomySyncV2RequestSchema,
  taxonomyBatchSha256,
  taxonomySnapshotSha256,
  type TaxonomyBatchKind,
  type TaxonomyBatchRequest,
  type TaxonomyBeginRequest,
  type TaxonomyFinalizeRequest,
  type TaxonomyManifest,
  type TaxonomySnapshotData,
} from './hairshop-taxonomy-sync'

const generatedAtUtc = '2026-10-30T15:00:00.000Z'

function sampleData(): TaxonomySnapshotData {
  return {
    categories: [
      {
        categoryId: '11', parentCategoryId: '10', names: { default: 'Premium child', ru: 'Серия', lv: 'Sērija', en: 'Series' },
        slugs: { lv: 'serija', ru: 'seriya', en: 'series' }, published: true,
        createdOnUtc: '2020-01-01T00:00:00.000Z', updatedOnUtc: '2026-10-29T00:00:00.000Z',
      },
      {
        categoryId: '10', parentCategoryId: null, names: { default: 'Premium Line' }, slugs: { default: 'premium-line' },
        published: true, createdOnUtc: '2020-01-01T00:00:00.000Z', updatedOnUtc: '2026-10-28T00:00:00.000Z',
      },
    ],
    manufacturers: [{
      manufacturerId: '20', names: { default: 'Brand', ru: 'Бренд' }, slugs: { default: 'brand' }, published: true,
      createdOnUtc: '2020-01-01T00:00:00.000Z', updatedOnUtc: '2026-10-28T00:00:00.000Z',
    }],
    productCategories: [
      { productId: '101', categoryId: '11', displayOrder: 2, isFeaturedProduct: false },
      { productId: '101', categoryId: '10', displayOrder: 1, isFeaturedProduct: true },
    ],
    productManufacturers: [{ productId: '101', manufacturerId: '20', displayOrder: 1, isFeaturedProduct: false }],
  }
}

function split<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

function protocol(dataInput = sampleData(), batchSize = 1): {
  begin: TaxonomyBeginRequest
  batches: TaxonomyBatchRequest[]
  finalize: TaxonomyFinalizeRequest
} {
  const data = canonicalizeTaxonomySnapshot(dataInput)
  const batches: TaxonomyBatchRequest[] = []
  const entries: Array<[TaxonomyBatchKind, unknown[]]> = [
    ['categories', data.categories],
    ['manufacturers', data.manufacturers],
    ['productCategories', data.productCategories],
    ['productManufacturers', data.productManufacturers],
  ]
  for (const [kind, items] of entries) {
    const chunks = split(items, batchSize)
    chunks.forEach((chunk, index) => {
      const batch = { kind, batchId: `${kind}:${index}`, index, total: chunks.length, payloadSha256: '0'.repeat(64), items: chunk } as TaxonomyBatchRequest['batch']
      batch.payloadSha256 = taxonomyBatchSha256(batch)
      batches.push({ schemaVersion: 2, runId: 'taxonomy-test-0001', mode: 'dry-run', operation: 'batch', snapshotSha256: taxonomySnapshotSha256(data), batch })
    })
  }
  const manifest: TaxonomyManifest = {
    source: 'nop390', generatedAtUtc,
    categories: data.categories.length,
    manufacturers: data.manufacturers.length,
    productCategoryMappings: data.productCategories.length,
    productManufacturerMappings: data.productManufacturers.length,
    expectedBatchCount: batches.length,
    snapshotSha256: taxonomySnapshotSha256(data),
  }
  return {
    begin: { schemaVersion: 2, runId: 'taxonomy-test-0001', mode: 'dry-run', operation: 'begin', manifest },
    batches,
    finalize: { schemaVersion: 2, runId: 'taxonomy-test-0001', mode: 'dry-run', operation: 'finalize', manifest },
  }
}

describe('Hairshop taxonomy sync v2 contract', () => {
  it('serializes string IDs, localized values, slugs and the parent hierarchy', () => {
    const requests = protocol()
    expect(hairshopTaxonomySyncV2RequestSchema.parse(requests.begin)).toEqual(requests.begin)
    const categoryBatch = requests.batches.find(request => request.batch.kind === 'categories' && request.batch.index === 1)
    expect(categoryBatch?.batch.items[0]).toMatchObject({
      categoryId: '11', parentCategoryId: '10',
      names: { ru: 'Серия', lv: 'Sērija', en: 'Series' },
      slugs: { lv: 'serija', ru: 'seriya', en: 'series' },
    })
  })

  it('produces the same snapshot checksum regardless of source row order', () => {
    const data = sampleData()
    const reversed: TaxonomySnapshotData = {
      categories: [...data.categories].reverse(), manufacturers: [...data.manufacturers].reverse(),
      productCategories: [...data.productCategories].reverse(), productManufacturers: [...data.productManufacturers].reverse(),
    }
    expect(taxonomySnapshotSha256(reversed)).toBe(taxonomySnapshotSha256(data))
  })

  it('accepts a repeated identical batch idempotently and finalizes only a complete snapshot', () => {
    const requests = protocol()
    let session = beginTaxonomySnapshot(requests.begin)
    const first = acceptTaxonomyBatch(session, requests.batches[0])
    expect(first.status).toBe('accepted')
    const repeated = acceptTaxonomyBatch(first.session, requests.batches[0])
    expect(repeated.status).toBe('duplicate')
    session = repeated.session
    for (const request of requests.batches.slice(1)) session = acceptTaxonomyBatch(session, request).session
    const finalized = finalizeTaxonomySnapshot(session, requests.finalize)
    expect(finalized.data).toEqual(canonicalizeTaxonomySnapshot(sampleData()))
  })

  it('rejects an incomplete snapshot at finalize', () => {
    const requests = protocol()
    let session = beginTaxonomySnapshot(requests.begin)
    for (const request of requests.batches.slice(0, -1)) session = acceptTaxonomyBatch(session, request).session
    expect(() => finalizeTaxonomySnapshot(session, requests.finalize)).toThrow(/Not all expected batches/u)
  })

  it('rejects a corrupted batch and a conflicting retry', () => {
    const requests = protocol()
    const session = beginTaxonomySnapshot(requests.begin)
    const corrupted = structuredClone(requests.batches[0])
    if (corrupted.batch.kind === 'categories') corrupted.batch.items[0].names.default = 'tampered'
    expect(() => acceptTaxonomyBatch(session, corrupted)).toThrow(/checksum/u)

    const accepted = acceptTaxonomyBatch(session, requests.batches[0]).session
    const conflict = structuredClone(requests.batches[0])
    if (conflict.batch.kind === 'categories') conflict.batch.items[0].names.default = 'different valid retry'
    conflict.batch.payloadSha256 = taxonomyBatchSha256(conflict.batch)
    expect(() => acceptTaxonomyBatch(accepted, conflict)).toThrow(/already accepted/u)
  })

  it('rejects a manifest with incorrect completeness counts', () => {
    const requests = protocol()
    const begin = structuredClone(requests.begin)
    begin.manifest.productCategoryMappings += 1
    begin.manifest.snapshotSha256 = requests.begin.manifest.snapshotSha256
    const finalize = { ...requests.finalize, manifest: begin.manifest }
    let session = beginTaxonomySnapshot(begin)
    for (const request of requests.batches) session = acceptTaxonomyBatch(session, request).session
    expect(() => finalizeTaxonomySnapshot(session, finalize)).toThrow(/count does not match/u)
  })

  it('handles an audit-sized snapshot without hard-coding audit counts in production code', () => {
    const categoryCount = 284
    const mappingCount = 10_878
    const data: TaxonomySnapshotData = {
      categories: Array.from({ length: categoryCount }, (_, index) => ({
        categoryId: String(index + 1), parentCategoryId: index === 0 ? null : '1', names: { default: `Category ${index + 1}` }, slugs: {},
        published: true, createdOnUtc: generatedAtUtc, updatedOnUtc: generatedAtUtc,
      })),
      manufacturers: [{ manufacturerId: '1', names: { default: 'Brand' }, slugs: {}, published: true, createdOnUtc: generatedAtUtc, updatedOnUtc: generatedAtUtc }],
      productCategories: Array.from({ length: mappingCount }, (_, index) => ({
        productId: String(Math.floor(index / categoryCount) + 1), categoryId: String(index % categoryCount + 1), displayOrder: index % 10, isFeaturedProduct: false,
      })),
      productManufacturers: [],
    }
    const requests = protocol(data, 100)
    let session = beginTaxonomySnapshot(requests.begin)
    for (const request of requests.batches) session = acceptTaxonomyBatch(session, request).session
    const finalized = finalizeTaxonomySnapshot(session, requests.finalize)
    expect(finalized.manifest.categories).toBe(categoryCount)
    expect(finalized.manifest.productCategoryMappings).toBe(mappingCount)
  }, 30_000)
})
