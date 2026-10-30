import { prisma, type ExtendedPrismaClient, type ExtendedTransactionClient } from '@/lib/prisma'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import {
  planBrandLines,
  type BrandAlias,
  type BrandLinePlan,
  type ExistingCategoryMapping,
  type ExistingLine,
  type ExistingLink,
  type ExistingManufacturerMapping,
  type LineSeed,
  type LocalizedNames,
  type PlanInput,
} from './brand-line-plan'

const SOURCE = 'nop390' as const

type Db = ExtendedPrismaClient | ExtendedTransactionClient

export class BrandLineBootstrapError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'BrandLineBootstrapError'
  }
}

// Reads everything the planner needs. Products are read, never written.
export async function loadBrandLinePlanInput(db: Db, seeds: LineSeed[], aliases: BrandAlias[]): Promise<PlanInput & { snapshotId: string }> {
  const active = await db.taxonomySnapshotSession.findFirst({
    where: { source: SOURCE, appliedAt: { not: null } },
    orderBy: { appliedAt: 'desc' },
    select: { id: true },
  })
  if (!active) throw new BrandLineBootstrapError('NO_ACTIVE_SNAPSHOT', 'No applied taxonomy snapshot exists for the source.')
  const [categories, manufacturers, categoryEdges, manufacturerEdges, brandsConfig, products, lines, categoryMappings, manufacturerMappings, links] = await Promise.all([
    db.catalogSourceCategory.findMany({ where: { source: SOURCE }, select: { sourceCategoryId: true, parentSourceCategoryId: true, names: true, published: true, isPresent: true } }),
    db.catalogSourceManufacturer.findMany({ where: { source: SOURCE }, select: { sourceManufacturerId: true, names: true, isPresent: true } }),
    db.catalogSourceProductCategory.findMany({ where: { source: SOURCE }, select: { legacyProductId: true, sourceCategoryId: true, isPresent: true } }),
    db.catalogSourceProductManufacturer.findMany({ where: { source: SOURCE }, select: { legacyProductId: true, sourceManufacturerId: true, isPresent: true } }),
    getBrandsConfigFromStore(db),
    db.product.findMany({ select: { id: true, brand: true, isDeleted: true } }),
    db.brandLine.findMany(),
    db.catalogSourceCategoryMapping.findMany({ where: { source: SOURCE } }),
    db.catalogSourceManufacturerBrand.findMany({ where: { source: SOURCE } }),
    db.productBrandLine.findMany(),
  ])
  return {
    snapshotId: active.id,
    categories: categories.map(row => ({ id: row.sourceCategoryId, parentId: row.parentSourceCategoryId, names: row.names as LocalizedNames, published: row.published, isPresent: row.isPresent })),
    manufacturers: manufacturers.map(row => ({ id: row.sourceManufacturerId, names: row.names as LocalizedNames, isPresent: row.isPresent })),
    categoryEdges: categoryEdges.map(row => ({ productId: row.legacyProductId, categoryId: row.sourceCategoryId, isPresent: row.isPresent })),
    manufacturerEdges: manufacturerEdges.map(row => ({ productId: row.legacyProductId, manufacturerId: row.sourceManufacturerId, isPresent: row.isPresent })),
    brands: brandsConfig.brands.map(brand => ({ key: brand.id, name: brand.name })),
    aliases,
    products,
    seeds,
    existing: {
      lines: lines.map(row => ({ ...row, names: row.names as LocalizedNames })) as ExistingLine[],
      categoryMappings: categoryMappings as ExistingCategoryMapping[],
      manufacturerMappings: manufacturerMappings as ExistingManufacturerMapping[],
      links: links as ExistingLink[],
    },
  }
}

export type BrandLineApplyResult = {
  manufacturerMappings: number
  categoryMappings: number
  lines: number
  linksCreated: number
  linksRefreshed: number
  linksMarkedMissing: number
  reviewsCreated: number
  reviewsSeenAgain: number
}

async function applyPlan(tx: ExtendedTransactionClient, plan: BrandLinePlan, snapshotId: string): Promise<BrandLineApplyResult> {
  if (plan.manufacturerMappings.length) {
    await tx.catalogSourceManufacturerBrand.createMany({
      data: plan.manufacturerMappings.map(row => ({ source: SOURCE, sourceManufacturerId: row.sourceManufacturerId, brandKey: row.brandKey, status: 'confirmed', origin: row.origin })),
      skipDuplicates: true,
    })
  }
  const lineIdByKey = new Map((await tx.brandLine.findMany({ select: { id: true, key: true } })).map(row => [row.key, row.id]))
  for (const line of plan.lines) {
    const parentId = line.parentKey ? lineIdByKey.get(line.parentKey) : null
    if (line.parentKey && !parentId) throw new BrandLineBootstrapError('PARENT_LINE_MISSING', `Parent line ${line.parentKey} is not available.`)
    const created = await tx.brandLine.create({
      data: { key: line.key, brandKey: line.brandKey, parentId, slug: line.slug, names: line.names, kind: line.kind, status: 'active', origin: 'source_sync', depth: line.depth },
      select: { id: true },
    })
    lineIdByKey.set(line.key, created.id)
  }
  if (plan.categoryMappings.length) {
    await tx.catalogSourceCategoryMapping.createMany({
      data: plan.categoryMappings.map(row => ({
        source: SOURCE, sourceCategoryId: row.sourceCategoryId, targetType: row.targetType, status: 'confirmed', origin: row.origin,
        brandKey: row.targetType === 'brand' ? row.brandKey : null,
        brandLineId: row.targetType === 'brand_line' ? lineIdByKey.get(row.lineKey!)! : null,
      })),
      skipDuplicates: true,
    })
  }
  const lineId = (key: string): string => {
    const id = lineIdByKey.get(key)
    if (!id) throw new BrandLineBootstrapError('LINE_MISSING', `Line ${key} is not available.`)
    return id
  }
  const created = plan.links.create.length
    ? (await tx.productBrandLine.createMany({
      data: plan.links.create.map(link => ({
        productId: link.productId, brandLineId: lineId(link.lineKey), origin: 'source_sync', status: 'active',
        sourceCategoryId: link.sourceCategoryId, lastSeenSnapshotId: snapshotId, lastCheckedSnapshotId: snapshotId,
      })),
      skipDuplicates: true,
    })).count
    : 0
  for (const link of plan.links.refresh) {
    await tx.productBrandLine.update({
      where: { productId_brandLineId: { productId: link.productId, brandLineId: lineId(link.lineKey) } },
      data: { isPresentInSource: true, missingSnapshotCount: 0, sourceCategoryId: link.sourceCategoryId, lastSeenSnapshotId: snapshotId, lastCheckedSnapshotId: snapshotId },
    })
  }
  // Never delete a link: a link the source no longer supports is counted as missing.
  for (const link of plan.links.markMissing) {
    await tx.productBrandLine.update({
      where: { productId_brandLineId: link },
      data: { isPresentInSource: false, missingSnapshotCount: { increment: 1 }, lastCheckedSnapshotId: snapshotId },
    })
  }
  let reviewsCreated = 0
  if (plan.reviews.length) {
    const rows = await tx.$queryRaw<Array<{ inserted: boolean }>>`
      INSERT INTO "BrandLineReviewItem" ("id", "source", "reason", "subjectKey", "details", "status", "occurrences", "firstSeenAt", "lastSeenAt")
      SELECT 'blr_' || md5(${SOURCE} || ':' || r."reason" || ':' || r."subjectKey"), ${SOURCE}, r."reason", r."subjectKey", r."details", 'open', 1,
        (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(plan.reviews)}::jsonb) AS r("reason" text, "subjectKey" text, "details" jsonb)
      ON CONFLICT ("source", "reason", "subjectKey") DO UPDATE SET
        "details" = EXCLUDED."details", "lastSeenAt" = EXCLUDED."lastSeenAt",
        "occurrences" = "BrandLineReviewItem"."occurrences" + 1
      RETURNING (xmax = 0) AS inserted`
    reviewsCreated = rows.filter(row => row.inserted).length
  }
  return {
    manufacturerMappings: plan.manufacturerMappings.length,
    categoryMappings: plan.categoryMappings.length,
    lines: plan.lines.length,
    linksCreated: created,
    linksRefreshed: plan.links.refresh.length,
    linksMarkedMissing: plan.links.markMissing.length,
    reviewsCreated,
    reviewsSeenAgain: plan.reviews.length - reviewsCreated,
  }
}

export async function runBrandLineBootstrap(options: {
  mode: 'dry-run' | 'apply'
  seeds: LineSeed[]
  aliases: BrandAlias[]
  db?: ExtendedPrismaClient
}): Promise<{ plan: BrandLinePlan; applied: BrandLineApplyResult | null }> {
  const db = options.db ?? prisma
  if (options.mode === 'dry-run') {
    const input = await loadBrandLinePlanInput(db, options.seeds, options.aliases)
    return { plan: planBrandLines(input), applied: null }
  }
  return db.$transaction(async tx => {
    // One bootstrap at a time; the plan is recomputed under the lock so a
    // concurrent run can never apply a stale plan.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hairshop-brand-line-bootstrap'))`
    const input = await loadBrandLinePlanInput(tx, options.seeds, options.aliases)
    const plan = planBrandLines(input)
    return { plan, applied: await applyPlan(tx, plan, input.snapshotId) }
  }, { maxWait: 30_000, timeout: 300_000 })
}
