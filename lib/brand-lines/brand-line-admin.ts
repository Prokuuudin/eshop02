import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import { MAX_LINE_DEPTH, normalizeName } from './brand-line-plan'

const SOURCE = 'nop390' as const

export class BrandLineAdminError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) {
    super(message)
    this.name = 'BrandLineAdminError'
  }
}

const slugSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u)
const namesSchema = z.object({
  default: z.string().trim().max(200).optional(),
  ru: z.string().trim().max(200).optional(),
  lv: z.string().trim().max(200).optional(),
  en: z.string().trim().max(200).optional(),
}).strict().transform((names, ctx) => {
  const clean = Object.fromEntries(Object.entries(names).filter(([, value]) => value)) as Record<string, string>
  const fallback = clean.default ?? clean.lv ?? clean.ru ?? clean.en
  if (!fallback) ctx.addIssue({ code: 'custom', message: 'At least one name is required' })
  return { ...clean, default: fallback ?? '' }
})
const kindSchema = z.enum(['line', 'series', 'subbrand'])

export const createBrandLineSchema = z.object({
  brandKey: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().trim().min(1).max(64).nullable().optional(),
  slug: slugSchema,
  names: namesSchema,
  kind: kindSchema.default('line'),
}).strict()

export const updateBrandLineSchema = z.object({
  names: namesSchema.optional(),
  slug: slugSchema.optional(),
  kind: kindSchema.optional(),
  status: z.enum(['active', 'archived']).optional(),
  parentId: z.string().trim().min(1).max(64).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Nothing to update')

export const productMembershipSchema = z.object({
  product: z.string().trim().min(1).max(200),
  action: z.enum(['include', 'exclude']),
}).strict()

export const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal('dismiss'), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal('reject'), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal('confirm_brand'), brandKey: z.string().trim().min(1).max(120), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({
    action: z.literal('confirm_line'), brandKey: z.string().trim().min(1).max(120), parentId: z.string().trim().min(1).max(64).nullable().optional(),
    slug: slugSchema, kind: kindSchema.default('line'), note: z.string().trim().max(1000).optional(),
  }).strict(),
])

// Category-subject reasons that an administrator may turn into a line or reject.
const CATEGORY_LINE_REASONS = new Set(['unknown_root_line', 'brand_vs_line_conflict', 'ambiguous_new_series', 'new_series_too_deep'])

type Tx = ExtendedTransactionClient
type Actor = ServerUser

function revalidatePromotionCatalog(): void {
  revalidateTag('storefront-sale-products', { expire: 0 })
  revalidateTag('storefront-bestsellers', { expire: 0 })
}

async function lockBrandLines(tx: Tx): Promise<void> {
  // Same lock as the bootstrap, so a synchronization never interleaves with an admin edit.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hairshop-brand-line-bootstrap'))`
}

async function brandIndex(tx: Tx): Promise<{ keys: Map<string, string>; resolve: (name: string) => string | null }> {
  const brands = (await getBrandsConfigFromStore(tx)).brands
  const keys = new Map(brands.map(brand => [brand.id, brand.name]))
  const byName = new Map(brands.map(brand => [normalizeName(brand.name), brand.id]))
  return { keys, resolve: name => byName.get(normalizeName(name)) ?? null }
}

async function ancestorIds(tx: Tx, lineId: string | null): Promise<string[]> {
  const out: string[] = []
  let current = lineId
  for (let guard = 0; current && guard < 32; guard++) {
    out.push(current)
    current = (await tx.brandLine.findUnique({ where: { id: current }, select: { parentId: true } }))?.parentId ?? null
  }
  return out
}

async function subtreeIds(tx: Tx, lineId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "BrandLine" WHERE id = ${lineId}
      UNION ALL SELECT child.id FROM "BrandLine" child JOIN tree ON child."parentId" = tree.id
    ) SELECT id FROM tree`
  return rows.map(row => row.id)
}

async function assertSiblingSlugFree(tx: Tx, brandKey: string, parentId: string | null, slug: string, exceptId?: string): Promise<void> {
  const clash = await tx.brandLine.findFirst({ where: { brandKey, parentId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
  if (clash) throw new BrandLineAdminError('line_slug_exists', 409)
}

async function withAudit<T>(request: NextRequest, actor: Actor, run: (tx: Tx) => Promise<{ result: T; audit: Parameters<typeof appendServerAudit>[3] }>): Promise<T> {
  return prisma.$transaction(async tx => {
    await lockBrandLines(tx)
    const { result, audit } = await run(tx)
    await appendServerAudit(tx, request, actor, audit)
    return result
  }, { maxWait: 15_000, timeout: 30_000 })
}

async function createLineInTx(tx: Tx, input: z.infer<typeof createBrandLineSchema>): Promise<{ id: string; key: string; brandKey: string }> {
  const brands = await brandIndex(tx)
  const parent = input.parentId ? await tx.brandLine.findUnique({ where: { id: input.parentId } }) : null
  if (input.parentId && !parent) throw new BrandLineAdminError('parent_not_found', 404)
  const brandKey = parent?.brandKey ?? input.brandKey
  if (!brandKey || !brands.keys.has(brandKey)) throw new BrandLineAdminError('brand_not_found', 422)
  if (parent && input.brandKey && input.brandKey !== parent.brandKey) throw new BrandLineAdminError('cross_brand_parent', 422)
  const depth = parent ? parent.depth + 1 : 1
  if (depth > MAX_LINE_DEPTH) throw new BrandLineAdminError('line_too_deep', 422)
  await assertSiblingSlugFree(tx, brandKey, parent?.id ?? null, input.slug)
  const key = `${parent ? parent.key : brandKey}/${input.slug}`
  if (await tx.brandLine.findUnique({ where: { key }, select: { id: true } })) throw new BrandLineAdminError('line_key_exists', 409)
  return tx.brandLine.create({
    data: { key, brandKey, parentId: parent?.id ?? null, slug: input.slug, names: input.names, kind: input.kind, status: 'active', origin: 'admin', adminLocked: true, depth },
    select: { id: true, key: true, brandKey: true },
  })
}

// ---------------------------------------------------------------------------
// Reads

export async function listBrandLines(): Promise<{
  brands: Array<{ key: string; name: string }>
  lines: Array<{
    id: string; key: string; brandKey: string; parentId: string | null; slug: string; names: unknown; kind: string; status: string
    origin: string; adminLocked: boolean; depth: number; directProducts: number; excludedProducts: number; sourceCategoryIds: string[]
  }>
  openReviews: number
}> {
  const [brandsConfig, lines, counts, mappings, openReviews] = await Promise.all([
    getBrandsConfigFromStore(),
    prisma.brandLine.findMany({ orderBy: [{ brandKey: 'asc' }, { depth: 'asc' }, { key: 'asc' }] }),
    prisma.productBrandLine.groupBy({ by: ['brandLineId', 'status'], _count: { _all: true } }),
    prisma.catalogSourceCategoryMapping.findMany({ where: { targetType: 'brand_line', status: 'confirmed' }, select: { brandLineId: true, sourceCategoryId: true } }),
    prisma.brandLineReviewItem.count({ where: { status: 'open' } }),
  ])
  const count = (lineId: string, status: string): number => counts.find(row => row.brandLineId === lineId && row.status === status)?._count._all ?? 0
  return {
    brands: brandsConfig.brands.map(brand => ({ key: brand.id, name: brand.name })).sort((a, b) => a.name.localeCompare(b.name)),
    lines: lines.map(line => ({
      id: line.id, key: line.key, brandKey: line.brandKey, parentId: line.parentId, slug: line.slug, names: line.names, kind: line.kind,
      status: line.status, origin: line.origin, adminLocked: line.adminLocked, depth: line.depth,
      directProducts: count(line.id, 'active'), excludedProducts: count(line.id, 'excluded'),
      sourceCategoryIds: mappings.filter(row => row.brandLineId === line.id).map(row => row.sourceCategoryId),
    })),
    openReviews,
  }
}

export async function getBrandLineDetail(id: string): Promise<unknown> {
  const line = await prisma.brandLine.findUnique({ where: { id } })
  if (!line) throw new BrandLineAdminError('line_not_found', 404)
  const [links, mappings] = await Promise.all([
    prisma.productBrandLine.findMany({
      where: { brandLineId: id },
      include: { product: { select: { id: true, sku: true, title: true, titleLv: true, titleEn: true, brand: true, isActive: true, isDeleted: true } } },
      orderBy: [{ status: 'asc' }, { productId: 'asc' }],
    }),
    prisma.catalogSourceCategoryMapping.findMany({ where: { brandLineId: id }, include: { category: { select: { names: true, isPresent: true } } } }),
  ])
  return {
    line,
    sources: mappings.map(row => ({ sourceCategoryId: row.sourceCategoryId, origin: row.origin, status: row.status, names: row.category.names, isPresent: row.category.isPresent })),
    products: links.map(link => ({
      productId: link.productId, origin: link.origin, status: link.status, isPresentInSource: link.isPresentInSource,
      missingSnapshotCount: link.missingSnapshotCount, sourceCategoryId: link.sourceCategoryId, product: link.product,
    })),
  }
}

export async function listReviewItems(filter: { status?: string; reason?: string }): Promise<unknown[]> {
  const items = await prisma.brandLineReviewItem.findMany({
    where: { source: SOURCE, ...(filter.status ? { status: filter.status } : {}), ...(filter.reason ? { reason: filter.reason } : {}) },
    orderBy: [{ status: 'asc' }, { reason: 'asc' }, { subjectKey: 'asc' }],
    take: 500,
  })
  const categoryIds = items.map(item => item.subjectKey).filter(key => /^\d+$/u.test(key))
  const categories = await prisma.catalogSourceCategory.findMany({ where: { source: SOURCE, sourceCategoryId: { in: categoryIds } }, select: { sourceCategoryId: true, names: true } })
  const names = new Map(categories.map(row => [row.sourceCategoryId, row.names]))
  return items.map(item => ({ ...item, categoryNames: names.get(item.subjectKey) ?? null }))
}

// ---------------------------------------------------------------------------
// Mutations (each in one transaction with an audit row)

export async function createBrandLine(request: NextRequest, actor: Actor, input: unknown): Promise<{ id: string; key: string }> {
  const data = createBrandLineSchema.parse(input)
  return withAudit(request, actor, async tx => {
    const created = await createLineInTx(tx, data)
    return { result: created, audit: { action: 'catalog.brand_line_created', entityType: 'brand_line', entityId: created.id, entityTitle: created.key, after: { ...data, key: created.key } } }
  })
}

export async function updateBrandLine(request: NextRequest, actor: Actor, id: string, input: unknown): Promise<{ id: string }> {
  const data = updateBrandLineSchema.parse(input)
  const result = await withAudit(request, actor, async tx => {
    const line = await tx.brandLine.findUnique({ where: { id } })
    if (!line) throw new BrandLineAdminError('line_not_found', 404)
    let parentId = line.parentId
    let depth = line.depth
    if (data.parentId !== undefined && data.parentId !== line.parentId) {
      const parent = data.parentId ? await tx.brandLine.findUnique({ where: { id: data.parentId } }) : null
      if (data.parentId && !parent) throw new BrandLineAdminError('parent_not_found', 404)
      if (parent && parent.brandKey !== line.brandKey) throw new BrandLineAdminError('cross_brand_parent', 422)
      const subtree = await subtreeIds(tx, id)
      if (parent && subtree.includes(parent.id)) throw new BrandLineAdminError('line_cycle', 422)
      depth = parent ? parent.depth + 1 : 1
      if (depth > MAX_LINE_DEPTH) throw new BrandLineAdminError('line_too_deep', 422)
      if (depth !== line.depth && subtree.length > 1) throw new BrandLineAdminError('move_changes_subtree_depth', 422)
      // Moving must not leave a product linked both to the moved subtree and to a new ancestor.
      const newAncestors = await ancestorIds(tx, parent?.id ?? null)
      if (newAncestors.length) {
        const overlap = await tx.productBrandLine.count({
          where: { brandLineId: { in: subtree }, status: 'active', product: { brandLines: { some: { brandLineId: { in: newAncestors }, status: 'active' } } } },
        })
        if (overlap > 0) throw new BrandLineAdminError('duplicate_through_hierarchy', 409)
      }
      parentId = parent?.id ?? null
    }
    if (data.slug && data.slug !== line.slug) await assertSiblingSlugFree(tx, line.brandKey, parentId, data.slug, id)
    if (data.status === 'archived' && await tx.brandLine.count({ where: { parentId: id, status: 'active' } })) {
      throw new BrandLineAdminError('line_has_active_children', 409)
    }
    const updated = await tx.brandLine.update({
      where: { id },
      data: {
        ...(data.names ? { names: data.names } : {}), ...(data.slug ? { slug: data.slug } : {}), ...(data.kind ? { kind: data.kind } : {}),
        ...(data.status ? { status: data.status } : {}), parentId, depth, adminLocked: true,
      },
    })
    const before = { names: line.names, slug: line.slug, kind: line.kind, status: line.status, parentId: line.parentId, adminLocked: line.adminLocked }
    const after = { names: updated.names, slug: updated.slug, kind: updated.kind, status: updated.status, parentId: updated.parentId, adminLocked: true }
    return { result: { id }, audit: { action: 'catalog.brand_line_updated', entityType: 'brand_line', entityId: id, entityTitle: line.key, before, after } }
  })
  revalidatePromotionCatalog()
  return result
}

export async function setProductMembership(request: NextRequest, actor: Actor, lineId: string, input: unknown): Promise<{ productId: string; status: string }> {
  const data = productMembershipSchema.parse(input)
  const result = await withAudit(request, actor, async tx => {
    const line = await tx.brandLine.findUnique({ where: { id: lineId } })
    if (!line) throw new BrandLineAdminError('line_not_found', 404)
    const matches = await tx.product.findMany({ where: { OR: [{ id: data.product }, { sku: data.product }] }, select: { id: true, brand: true, isDeleted: true, title: true }, take: 3 })
    const exact = matches.find(row => row.id === data.product)
    const product = exact ?? (matches.length === 1 ? matches[0] : null)
    if (!product) throw new BrandLineAdminError(matches.length > 1 ? 'product_ambiguous' : 'product_not_found', matches.length > 1 ? 409 : 404)
    const current = await tx.productBrandLine.findUnique({ where: { productId_brandLineId: { productId: product.id, brandLineId: lineId } } })
    if (data.action === 'include') {
      if (product.isDeleted) throw new BrandLineAdminError('product_deleted', 422)
      const productBrand = (await brandIndex(tx)).resolve(product.brand)
      if (productBrand && productBrand !== line.brandKey) throw new BrandLineAdminError('product_brand_mismatch', 422)
      const related = [...await ancestorIds(tx, line.parentId), ...(await subtreeIds(tx, lineId)).filter(id => id !== lineId)]
      if (related.length && await tx.productBrandLine.count({ where: { productId: product.id, brandLineId: { in: related }, status: 'active' } })) {
        throw new BrandLineAdminError('duplicate_through_hierarchy', 409)
      }
    }
    const status = data.action === 'include' ? 'active' : 'excluded'
    // An exclusion of a link that never existed is stored too: it stops a later synchronization from adding it.
    await tx.productBrandLine.upsert({
      where: { productId_brandLineId: { productId: product.id, brandLineId: lineId } },
      create: { productId: product.id, brandLineId: lineId, origin: 'admin', status },
      update: data.action === 'include'
        ? { origin: 'admin', status, isPresentInSource: true, missingSnapshotCount: 0 }
        : { status },
    })
    return {
      result: { productId: product.id, status },
      audit: {
        action: data.action === 'include' ? 'catalog.brand_line_product_included' : 'catalog.brand_line_product_excluded',
        entityType: 'product_brand_line', entityId: `${product.id}:${lineId}`, entityTitle: `${line.key} · ${product.title}`,
        before: current ? { origin: current.origin, status: current.status } : null, after: { status },
      },
    }
  })
  revalidatePromotionCatalog()
  return result
}

export async function actOnReviewItem(request: NextRequest, actor: Actor, id: string, input: unknown): Promise<{ id: string; status: string; brandLineId?: string }> {
  const data = reviewActionSchema.parse(input)
  return withAudit(request, actor, async tx => {
    const item = await tx.brandLineReviewItem.findUnique({ where: { id } })
    if (!item) throw new BrandLineAdminError('review_not_found', 404)
    if (item.status !== 'open') throw new BrandLineAdminError('review_closed', 409)
    const closedBy = actor.email ?? actor.id
    const close = async (status: 'resolved' | 'dismissed', extra: Record<string, unknown> = {}): Promise<void> => {
      await tx.brandLineReviewItem.update({
        where: { id },
        data: { status, resolvedAt: new Date(), resolvedBy: closedBy, details: { ...(item.details as Record<string, unknown>), resolution: { action: data.action, note: data.note ?? null, ...extra } } },
      })
    }
    const isCategoryReason = CATEGORY_LINE_REASONS.has(item.reason) || item.reason === 'unknown_brand_category'
    const audit = { entityType: 'brand_line_review', entityId: id, entityTitle: `${item.reason}:${item.subjectKey}`, before: { status: item.status } }
    let brandLineId: string | undefined

    if (data.action === 'resolve' || data.action === 'dismiss') {
      await close(data.action === 'resolve' ? 'resolved' : 'dismissed')
    } else if (data.action === 'reject') {
      if (item.reason === 'unknown_manufacturer') {
        await tx.catalogSourceManufacturerBrand.create({ data: { source: SOURCE, sourceManufacturerId: item.subjectKey, brandKey: null, status: 'rejected', origin: 'admin' } })
      } else if (isCategoryReason) {
        if (await tx.catalogSourceCategoryMapping.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: item.subjectKey } } })) throw new BrandLineAdminError('mapping_exists', 409)
        await tx.catalogSourceCategoryMapping.create({ data: { source: SOURCE, sourceCategoryId: item.subjectKey, targetType: 'ignore', status: 'rejected', origin: 'admin' } })
      } else {
        throw new BrandLineAdminError('action_not_supported', 422)
      }
      await close('dismissed')
    } else if (data.action === 'confirm_brand') {
      const brands = await brandIndex(tx)
      if (!brands.keys.has(data.brandKey)) throw new BrandLineAdminError('brand_not_found', 422)
      if (item.reason === 'unknown_manufacturer') {
        await tx.catalogSourceManufacturerBrand.create({ data: { source: SOURCE, sourceManufacturerId: item.subjectKey, brandKey: data.brandKey, status: 'confirmed', origin: 'admin' } })
      } else if (item.reason === 'unknown_brand_category') {
        if (await tx.catalogSourceCategoryMapping.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: item.subjectKey } } })) throw new BrandLineAdminError('mapping_exists', 409)
        await tx.catalogSourceCategoryMapping.create({ data: { source: SOURCE, sourceCategoryId: item.subjectKey, targetType: 'brand', brandKey: data.brandKey, status: 'confirmed', origin: 'admin' } })
      } else {
        throw new BrandLineAdminError('action_not_supported', 422)
      }
      await close('resolved', { brandKey: data.brandKey })
    } else {
      if (!CATEGORY_LINE_REASONS.has(item.reason)) throw new BrandLineAdminError('action_not_supported', 422)
      const category = await tx.catalogSourceCategory.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: item.subjectKey } } })
      if (!category) throw new BrandLineAdminError('source_category_not_found', 404)
      if (await tx.catalogSourceCategoryMapping.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: item.subjectKey } } })) throw new BrandLineAdminError('mapping_exists', 409)
      // The category must sit under a source brand category mapped to the chosen brand.
      let cursor = category.parentSourceCategoryId
      let sourceBrand: string | null = null
      for (let guard = 0; cursor && guard < 32 && !sourceBrand; guard++) {
        const mapping = await tx.catalogSourceCategoryMapping.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: cursor } } })
        if (mapping?.targetType === 'brand' && mapping.status === 'confirmed') sourceBrand = mapping.brandKey
        cursor = (await tx.catalogSourceCategory.findUnique({ where: { source_sourceCategoryId: { source: SOURCE, sourceCategoryId: cursor } }, select: { parentSourceCategoryId: true } }))?.parentSourceCategoryId ?? null
      }
      if (sourceBrand !== data.brandKey) throw new BrandLineAdminError('category_brand_mismatch', 422)
      const created = await createLineInTx(tx, { brandKey: data.brandKey, parentId: data.parentId ?? null, slug: data.slug, kind: data.kind, names: category.names as z.infer<typeof namesSchema> })
      await tx.catalogSourceCategoryMapping.create({ data: { source: SOURCE, sourceCategoryId: item.subjectKey, targetType: 'brand_line', brandLineId: created.id, status: 'confirmed', origin: 'admin' } })
      brandLineId = created.id
      await close('resolved', { brandLineId: created.id, key: created.key })
    }
    const status = (await tx.brandLineReviewItem.findUniqueOrThrow({ where: { id }, select: { status: true } })).status
    return { result: { id, status, brandLineId }, audit: { ...audit, action: `catalog.brand_line_review_${data.action}`, after: { status, brandLineId: brandLineId ?? null }, reason: data.note ?? null } }
  })
}

export function brandLineErrorResponse(error: unknown): { status: number; body: { error: string; issues?: unknown } } | null {
  if (error instanceof BrandLineAdminError) return { status: error.status, body: { error: error.code } }
  if (error instanceof z.ZodError) return { status: 400, body: { error: 'invalid_request', issues: error.flatten() } }
  const message = error instanceof Error ? error.message : ''
  const trigger = /brand_line_(cycle|parent_brand_mismatch|depth_mismatch|too_deep|has_children)/u.exec(message)
  if (trigger) return { status: 409, body: { error: `brand_line_${trigger[1]}` } }
  if ((error as { code?: string })?.code === 'P2002') return { status: 409, body: { error: 'conflict' } }
  return null
}
