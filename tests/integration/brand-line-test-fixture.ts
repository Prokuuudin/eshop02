import { prisma } from '@/lib/prisma'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
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

const TS = '2026-01-01T00:00:00.000Z'
let run = 0

export async function truncateBrandLineAndTaxonomy(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "ProductBrandLine", "CatalogSourceCategoryMapping", "CatalogSourceManufacturerBrand", "BrandLineReviewItem", "BrandLine", "CatalogSourceProductCategory", "CatalogSourceProductManufacturer", "CatalogSourceCategory", "CatalogSourceManufacturer", "TaxonomySnapshotBatch", "TaxonomySnapshotSession"`
}

export async function applySnapshot(data: TaxonomySnapshotData, generatedAtUtc: string): Promise<void> {
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
  const base = { schemaVersion: 2 as const, runId: `it-brandline-admin-${String(++run).padStart(4, '0')}-${Date.now()}`, mode: 'apply' as const }
  await persistTaxonomyBegin({ ...base, operation: 'begin', manifest })
  for (const batch of batches) await persistTaxonomyBatch({ ...base, operation: 'batch', snapshotSha256: manifest.snapshotSha256, batch })
  await persistTaxonomyFinalize({ ...base, operation: 'finalize', manifest })
}

function category(id: string, parent: string | null, name: string): TaxonomySnapshotData['categories'][number] {
  return { categoryId: id, parentCategoryId: parent, names: { default: name, ru: `${name} RU`, lv: name, en: `${name} EN` }, slugs: {}, published: true, createdOnUtc: TS, updatedOnUtc: TS }
}

export type BrandLineFixture = {
  brandKey: string; otherBrandKey: string; otherBrandName: string
  products: string[]; foreignProduct: string; data: TaxonomySnapshotData; seeds: LineSeed[]
}

// Real brands and real numeric-ID products of the isolated copy; the fixture never writes them.
export async function buildBrandLineFixture(): Promise<BrandLineFixture> {
  const brands = (await getBrandsConfigFromStore()).brands
  const keyByName = new Map(brands.map(brand => [normalizeName(brand.name), brand.id]))
  const grouped = await prisma.product.groupBy({ by: ['brand'], where: { isDeleted: false, id: { startsWith: '1' } }, _count: { _all: true } })
  const usable = grouped.filter(row => keyByName.has(normalizeName(row.brand)) && row._count._all >= 5).map(row => row.brand).sort()
  if (usable.length < 6) throw new Error('fixture needs six brands with products')
  const pick = async (brand: string, take: number) => (await prisma.product.findMany({ where: { brand, isDeleted: false, id: { startsWith: '1' } }, select: { id: true }, take: take * 2, orderBy: { id: 'asc' } }))
    .map(row => row.id).filter(id => /^\d+$/u.test(id)).slice(0, take)
  const products = await pick(usable[0], 5)
  const foreignProduct = (await pick(usable[1], 1))[0]
  const brandKey = keyByName.get(normalizeName(usable[0]))!
  const otherBrandKey = keyByName.get(normalizeName(usable[1]))!
  return {
    brandKey, otherBrandKey, otherBrandName: usable[1], products, foreignProduct,
    data: {
      categories: [
        category('9001', null, 'BRANDS'),
        ...usable.slice(0, 6).map((brand, index) => category(String(9010 + index), '9001', brand)),
        category('9100', '9010', 'IT LINE'), category('9101', '9100', 'IT SERIES A'),
        category('9103', '9010', 'IT UNKNOWN ROOT'),
        // A category under brand 0 named like brand 1, as FUDGE URBAN / DANDY in the real source.
        category('9104', '9010', usable[1]),
      ],
      manufacturers: [],
      productCategories: [
        { productId: products[0], categoryId: '9101', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[1], categoryId: '9101', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[2], categoryId: '9103', displayOrder: 0, isFeaturedProduct: false },
        { productId: products[3], categoryId: '9104', displayOrder: 0, isFeaturedProduct: false },
      ],
      productManufacturers: [],
    },
    seeds: [
      { key: `${brandKey}/it-line`, brandKey, kind: 'line', parentKey: null, categoryNames: ['IT LINE'] },
      { key: `${brandKey}/it-line/it-series-a`, brandKey, kind: 'series', parentKey: `${brandKey}/it-line`, categoryNames: ['IT SERIES A'] },
    ],
  }
}
