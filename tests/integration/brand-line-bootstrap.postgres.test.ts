import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { prisma } from '@/lib/prisma'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { runBrandLineBootstrap } from '@/lib/brand-lines/brand-line-bootstrap'
import { normalizeName, type LineSeed } from '@/lib/brand-lines/brand-line-plan'
import { persistTaxonomyBatch, persistTaxonomyBegin, persistTaxonomyFinalize } from '@/lib/sync/hairshop-taxonomy-persistence'
import {
  TAXONOMY_BATCH_KINDS,
  canonicalizeTaxonomySnapshot,
  taxonomyBatchSha256,
  taxonomySnapshotSha256,
  type TaxonomyBatchRequest,
  type TaxonomySnapshotData,
} from '@/lib/sync/hairshop-taxonomy-sync'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('ep-long-glitter')) {
  throw new Error('Refusing to run the BrandLine suite against the production database')
}

const TS = '2026-01-01T00:00:00.000Z'
let run = 0

async function applySnapshot(data: TaxonomySnapshotData, generatedAtUtc: string): Promise<void> {
  const canonical = canonicalizeTaxonomySnapshot(data)
  const batches = TAXONOMY_BATCH_KINDS.filter(kind => canonical[kind].length > 0).map(kind => {
    const batch = { kind, batchId: `${kind}:0`, index: 0, total: 1, payloadSha256: '', items: canonical[kind] } as TaxonomyBatchRequest['batch']
    batch.payloadSha256 = taxonomyBatchSha256(batch)
    return batch
  })
  const manifest = {
    source: 'nop390' as const, generatedAtUtc,
    categories: canonical.categories.length, manufacturers: canonical.manufacturers.length,
    productCategoryMappings: canonical.productCategories.length, productManufacturerMappings: canonical.productManufacturers.length,
    expectedBatchCount: batches.length, snapshotSha256: taxonomySnapshotSha256(canonical),
  }
  const base = { schemaVersion: 2 as const, runId: `it-brandline-${String(++run).padStart(4, '0')}-${Date.now()}`, mode: 'apply' as const }
  await persistTaxonomyBegin({ ...base, operation: 'begin', manifest })
  for (const batch of batches) await persistTaxonomyBatch({ ...base, operation: 'batch', snapshotSha256: manifest.snapshotSha256, batch })
  await persistTaxonomyFinalize({ ...base, operation: 'finalize', manifest })
}

type Fixture = { brandKey: string; otherBrandKey: string; products: string[]; foreignProduct: string; data: TaxonomySnapshotData; seeds: LineSeed[] }
let fixture: Fixture

function category(id: string, parent: string | null, name: string): TaxonomySnapshotData['categories'][number] {
  return { categoryId: id, parentCategoryId: parent, names: { default: name, lv: name }, slugs: {}, published: true, createdOnUtc: TS, updatedOnUtc: TS }
}

async function productFingerprint(ids: string[]): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ h: string }>>`SELECT md5(string_agg(x::text, '|' ORDER BY x.id)) AS h FROM "Product" x WHERE x.id = ANY(${ids})`
  return rows[0].h
}

beforeAll(async () => {
  // Real brands and real numeric-ID products from the isolated copy; nothing about them is written.
  const brands = (await getBrandsConfigFromStore()).brands
  const keyByName = new Map(brands.map(brand => [normalizeName(brand.name), brand.id]))
  const grouped = await prisma.product.groupBy({ by: ['brand'], where: { isDeleted: false, id: { startsWith: '1' } }, _count: { _all: true } })
  const usable = grouped.filter(row => keyByName.has(normalizeName(row.brand)) && row._count._all >= 4).map(row => row.brand)
  expect(usable.length).toBeGreaterThanOrEqual(6)
  const pick = async (brand: string, take: number) => (await prisma.product.findMany({ where: { brand, isDeleted: false, id: { startsWith: '1' } }, select: { id: true }, take, orderBy: { id: 'asc' } }))
    .map(row => row.id).filter(id => /^\d+$/u.test(id))
  const products = await pick(usable[0], 4)
  const foreignProduct = (await pick(usable[1], 1))[0]
  const brandKey = keyByName.get(normalizeName(usable[0]))!
  const otherBrandKey = keyByName.get(normalizeName(usable[1]))!
  fixture = {
    brandKey, otherBrandKey, products, foreignProduct,
    data: {
      categories: [
        category('9001', null, 'BRANDS'),
        ...usable.slice(0, 6).map((brand, index) => category(String(9010 + index), '9001', brand)),
        category('9100', '9010', 'IT LINE'), category('9101', '9100', 'IT SERIES A'), category('9102', '9100', 'IT SERIES NEW'),
        category('9103', '9010', 'IT UNKNOWN ROOT'),
      ],
      manufacturers: [],
      productCategories: [
        { productId: products[0], categoryId: '9101', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[0], categoryId: '9100', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[1], categoryId: '9102', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[2], categoryId: '9101', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[3], categoryId: '9103', displayOrder: 0, isFeaturedProduct: false },
        { productId: foreignProduct, categoryId: '9101', displayOrder: 0, isFeaturedProduct: false },
      ],
      productManufacturers: [],
    },
    seeds: [
      { key: `${brandKey}/it-line`, brandKey, kind: 'line', parentKey: null, categoryNames: ['IT LINE'] },
      { key: `${brandKey}/it-line/it-series-a`, brandKey, kind: 'series', parentKey: `${brandKey}/it-line`, categoryNames: ['IT SERIES A'] },
    ],
  }
})

beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "ProductBrandLine", "CatalogSourceCategoryMapping", "CatalogSourceManufacturerBrand", "BrandLineReviewItem", "BrandLine", "CatalogSourceProductCategory", "CatalogSourceProductManufacturer", "CatalogSourceCategory", "CatalogSourceManufacturer", "TaxonomySnapshotBatch", "TaxonomySnapshotSession"`
})

const bootstrap = (mode: 'dry-run' | 'apply' = 'apply') => runBrandLineBootstrap({ mode, seeds: fixture.seeds, aliases: [] })

describe('BrandLine bootstrap (isolated Postgres)', () => {
  it('creates lines, links and reviews once; a rerun changes nothing and Product rows stay untouched', async () => {
    await applySnapshot(fixture.data, '2026-10-30T10:00:00.000Z')
    const touched = [...fixture.products, fixture.foreignProduct]
    const before = await productFingerprint(touched)

    const dry = await bootstrap('dry-run')
    expect(dry.applied).toBeNull()
    expect(await prisma.brandLine.count()).toBe(0)

    const first = await bootstrap()
    expect(first.applied).toMatchObject({ lines: 3, linksCreated: 3, linksRefreshed: 0, linksMarkedMissing: 0 })
    const lines = await prisma.brandLine.findMany({ orderBy: { key: 'asc' } })
    expect(lines.map(line => [line.key, line.depth, line.origin])).toEqual([
      [`${fixture.brandKey}/it-line`, 1, 'source_sync'],
      [`${fixture.brandKey}/it-line/it-series-a`, 2, 'source_sync'],
      [`${fixture.brandKey}/it-line/it-series-new`, 2, 'source_sync'],
    ])
    const links = await prisma.productBrandLine.findMany({ include: { brandLine: { select: { key: true } } }, orderBy: [{ productId: 'asc' }] })
    expect(links.map(link => [link.productId, link.brandLine.key])).toEqual([
      [fixture.products[0], `${fixture.brandKey}/it-line/it-series-a`],
      [fixture.products[1], `${fixture.brandKey}/it-line/it-series-new`],
      [fixture.products[2], `${fixture.brandKey}/it-line/it-series-a`],
    ].sort((a, b) => a[0].localeCompare(b[0])))
    const reviews = await prisma.brandLineReviewItem.findMany({ select: { reason: true, subjectKey: true } })
    expect(reviews).toEqual(expect.arrayContaining([
      { reason: 'unknown_root_line', subjectKey: '9103' },
      { reason: 'product_brand_mismatch', subjectKey: `${fixture.foreignProduct}:${fixture.brandKey}/it-line/it-series-a` },
    ]))

    const second = await bootstrap()
    expect(second.applied).toMatchObject({ manufacturerMappings: 0, categoryMappings: 0, lines: 0, linksCreated: 0, linksRefreshed: 0, linksMarkedMissing: 0, reviewsCreated: 0 })
    expect(second.applied!.reviewsSeenAgain).toBe(reviews.length)
    expect(await prisma.brandLine.count()).toBe(3)
    expect(await prisma.productBrandLine.count()).toBe(3)
    expect(await prisma.brandLineReviewItem.count()).toBe(reviews.length)
    expect(await productFingerprint(touched)).toBe(before)

    // No product is linked to a line and to one of that line's ancestors.
    const duplicates = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM "ProductBrandLine" child
      JOIN "BrandLine" line ON line.id = child."brandLineId"
      JOIN "ProductBrandLine" ancestor ON ancestor."productId" = child."productId" AND ancestor."brandLineId" = line."parentId"`
    expect(duplicates[0].n).toBe(0)
  })

  it('keeps administrator overrides across reruns', async () => {
    await applySnapshot(fixture.data, '2026-10-30T10:00:00.000Z')
    await bootstrap()
    const series = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line/it-series-new` } })
    const root = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line` } })
    await prisma.brandLine.update({ where: { id: series.id }, data: { adminLocked: true, origin: 'admin', names: { default: 'Renamed by admin' } } })
    await prisma.productBrandLine.update({ where: { productId_brandLineId: { productId: fixture.products[0], brandLineId: (await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line/it-series-a` } })).id } }, data: { status: 'excluded' } })
    await prisma.productBrandLine.create({ data: { productId: fixture.products[3], brandLineId: root.id, origin: 'admin', status: 'active' } })
    await prisma.catalogSourceCategoryMapping.create({ data: { source: 'nop390', sourceCategoryId: '9103', targetType: 'ignore', status: 'rejected', origin: 'admin' } })

    const rerun = await bootstrap()
    expect(rerun.applied).toMatchObject({ lines: 0, linksCreated: 0, linksMarkedMissing: 0 })
    expect(rerun.plan.links.suppressedByAdmin).toHaveLength(1)
    expect((await prisma.brandLine.findUniqueOrThrow({ where: { id: series.id } })).names).toEqual({ default: 'Renamed by admin' })
    expect(await prisma.productBrandLine.findUniqueOrThrow({ where: { productId_brandLineId: { productId: fixture.products[3], brandLineId: root.id } } })).toMatchObject({ origin: 'admin', status: 'active' })
    expect(await prisma.productBrandLine.count({ where: { status: 'excluded' } })).toBe(1)
    expect(rerun.plan.reviews.some(item => item.subjectKey === '9103')).toBe(false)
  })

  it('counts a vanished source link once per snapshot and never deletes it', async () => {
    await applySnapshot(fixture.data, '2026-10-30T10:00:00.000Z')
    await bootstrap()
    const withoutEdge = { ...fixture.data, productCategories: fixture.data.productCategories.filter(edge => edge.categoryId !== '9102') }
    await applySnapshot(withoutEdge, '2026-10-30T11:00:00.000Z')
    expect((await bootstrap()).applied).toMatchObject({ linksMarkedMissing: 1 })
    expect((await bootstrap()).applied).toMatchObject({ linksMarkedMissing: 0 })
    const link = await prisma.productBrandLine.findFirstOrThrow({ where: { productId: fixture.products[1] } })
    expect(link).toMatchObject({ isPresentInSource: false, missingSnapshotCount: 1, status: 'active' })

    await applySnapshot(withoutEdge, '2026-10-30T12:00:00.000Z')
    expect((await bootstrap()).applied).toMatchObject({ linksMarkedMissing: 1 })
    expect(await prisma.productBrandLine.findFirstOrThrow({ where: { productId: fixture.products[1] } })).toMatchObject({ missingSnapshotCount: 2 })

    await applySnapshot(fixture.data, '2026-10-30T13:00:00.000Z')
    expect((await bootstrap()).applied).toMatchObject({ linksRefreshed: 1 })
    expect(await prisma.productBrandLine.findFirstOrThrow({ where: { productId: fixture.products[1] } })).toMatchObject({ isPresentInSource: true, missingSnapshotCount: 0 })
    expect(await prisma.productBrandLine.count()).toBe(3)
  })

  it('rejects cycles, cross-brand parents and inconsistent depth in the database', async () => {
    const root = await prisma.brandLine.create({ data: { key: `${fixture.brandKey}/it-a`, brandKey: fixture.brandKey, slug: 'it-a', names: { default: 'A' }, kind: 'line', origin: 'admin', depth: 1 } })
    const child = await prisma.brandLine.create({ data: { key: `${fixture.brandKey}/it-a/it-b`, brandKey: fixture.brandKey, parentId: root.id, slug: 'it-b', names: { default: 'B' }, kind: 'series', origin: 'admin', depth: 2 } })
    const otherRoot = await prisma.brandLine.create({ data: { key: `${fixture.otherBrandKey}/it-c`, brandKey: fixture.otherBrandKey, slug: 'it-c', names: { default: 'C' }, kind: 'line', origin: 'admin', depth: 1 } })

    await expect(prisma.brandLine.update({ where: { id: root.id }, data: { parentId: child.id, depth: 3 } })).rejects.toThrow(/brand_line_/u)
    await expect(prisma.brandLine.update({ where: { id: child.id }, data: { parentId: child.id } })).rejects.toThrow()
    await expect(prisma.brandLine.create({ data: { key: `${fixture.brandKey}/it-a/it-x`, brandKey: fixture.brandKey, parentId: otherRoot.id, slug: 'it-x', names: { default: 'X' }, kind: 'series', origin: 'admin', depth: 2 } })).rejects.toThrow(/brand_line_parent_brand_mismatch/u)
    await expect(prisma.brandLine.create({ data: { key: `${fixture.brandKey}/it-a/it-y`, brandKey: fixture.brandKey, parentId: root.id, slug: 'it-y', names: { default: 'Y' }, kind: 'series', origin: 'admin', depth: 3 } })).rejects.toThrow(/brand_line_depth_mismatch/u)
    await expect(prisma.brandLine.create({ data: { key: `${fixture.brandKey}/it-a/it-z`, brandKey: fixture.brandKey, parentId: child.id, slug: 'it-z', names: { default: 'Z' }, kind: 'series', origin: 'admin', depth: 3 } })).resolves.toBeTruthy()
    expect(await prisma.brandLine.count()).toBe(4)
  })
})
