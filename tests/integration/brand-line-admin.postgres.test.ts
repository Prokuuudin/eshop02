import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ServerUser } from '@/lib/server-auth'
import { runBrandLineBootstrap } from '@/lib/brand-lines/brand-line-bootstrap'
import {
  actOnReviewItem,
  createBrandLine,
  setProductMembership,
  updateBrandLine,
} from '@/lib/brand-lines/brand-line-admin'
import { applySnapshot, buildBrandLineFixture, truncateBrandLineAndTaxonomy, type BrandLineFixture } from './brand-line-test-fixture'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('ep-long-glitter')) {
  throw new Error('Refusing to run the BrandLine admin suite against the production database')
}

let fixture: BrandLineFixture
let actor: ServerUser
const request = (): NextRequest => new NextRequest('http://localhost/api/admin/brand-lines', { method: 'POST', headers: { 'user-agent': 'brand-line-admin-it' } })
const bootstrap = () => runBrandLineBootstrap({ mode: 'apply', seeds: fixture.seeds, aliases: [] })
const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: { code?: string; message?: string }) => error.code ?? error.message)

async function productFingerprint(ids: string[]): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ h: string }>>`SELECT md5(string_agg(x::text, '|' ORDER BY x.id)) AS h FROM "Product" x WHERE x.id = ANY(${ids})`
  return rows[0].h
}

beforeAll(async () => {
  fixture = await buildBrandLineFixture()
  const admin = await prisma.user.findFirstOrThrow({ where: { platformRole: 'admin' }, select: { id: true, email: true } })
  actor = { id: admin.id, email: admin.email, platformRole: 'admin', approvalRequired: false, auditLoggingEnabled: false } as ServerUser
})

beforeEach(async () => {
  await truncateBrandLineAndTaxonomy()
  await applySnapshot(fixture.data, '2026-10-30T10:00:00.000Z')
  await bootstrap()
})

describe('BrandLine administration (isolated Postgres)', () => {
  it('creates and edits nested lines, blocks cycles, cross-brand parents and depth breaks, and audits every change', async () => {
    const started = new Date()
    const root = await createBrandLine(request(), actor, { brandKey: fixture.brandKey, slug: 'it-admin-root', names: { ru: 'Корень', lv: 'Sakne', en: 'Root' } })
    const child = await createBrandLine(request(), actor, { parentId: root.id, slug: 'it-admin-child', kind: 'series', names: { lv: 'Bērns' } })
    expect(child.key).toBe(`${fixture.brandKey}/it-admin-root/it-admin-child`)
    const stored = await prisma.brandLine.findUniqueOrThrow({ where: { id: child.id } })
    expect(stored).toMatchObject({ origin: 'admin', adminLocked: true, depth: 2, brandKey: fixture.brandKey })

    await updateBrandLine(request(), actor, child.id, { names: { ru: 'Ребёнок', lv: 'Bērns', en: 'Child' }, slug: 'it-admin-kid' })
    expect(await prisma.brandLine.findUniqueOrThrow({ where: { id: child.id } })).toMatchObject({ slug: 'it-admin-kid', key: child.key, names: { ru: 'Ребёнок', lv: 'Bērns', en: 'Child', default: 'Bērns' } })

    expect(await code(updateBrandLine(request(), actor, root.id, { parentId: child.id }))).toBe('line_cycle')
    expect(await code(updateBrandLine(request(), actor, root.id, { parentId: root.id }))).toBe('line_cycle')
    const other = await createBrandLine(request(), actor, { brandKey: fixture.otherBrandKey, slug: 'it-other', names: { lv: 'Cits' } })
    expect(await code(createBrandLine(request(), actor, { brandKey: fixture.brandKey, parentId: other.id, slug: 'it-x', names: { lv: 'X' } }))).toBe('cross_brand_parent')
    expect(await code(updateBrandLine(request(), actor, child.id, { parentId: other.id }))).toBe('cross_brand_parent')
    expect(await code(createBrandLine(request(), actor, { parentId: root.id, slug: 'it-admin-kid', names: { lv: 'Dup' } }))).toBe('line_slug_exists')
    const series = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line/it-series-a` } })
    expect(await code(updateBrandLine(request(), actor, root.id, { parentId: series.id }))).toBe('move_changes_subtree_depth')
    expect(await code(updateBrandLine(request(), actor, root.id, { status: 'archived' }))).toBe('line_has_active_children')
    expect(await code(createBrandLine(request(), actor, { brandKey: 'no-such-brand', slug: 'it-y', names: { lv: 'Y' } }))).toBe('brand_not_found')
    expect(await code(createBrandLine(request(), actor, { brandKey: fixture.brandKey, slug: 'Bad Slug', names: { lv: 'Y' } }))).not.toBe('ok')

    // A leaf may move to any parent of the same brand; the database trigger agrees.
    await updateBrandLine(request(), actor, child.id, { parentId: series.id })
    expect(await prisma.brandLine.findUniqueOrThrow({ where: { id: child.id } })).toMatchObject({ parentId: series.id, depth: 3 })

    const audits = await prisma.auditLog.findMany({ where: { action: { startsWith: 'catalog.brand_line_' }, at: { gte: started } }, select: { action: true, entityType: true } })
    expect(audits.map(row => row.action).sort()).toEqual([
      'catalog.brand_line_created', 'catalog.brand_line_created', 'catalog.brand_line_created',
      'catalog.brand_line_updated', 'catalog.brand_line_updated',
    ])
  })

  it('includes and excludes products manually and keeps those decisions through a resynchronization', async () => {
    const before = await productFingerprint([...fixture.products, fixture.foreignProduct])
    const series = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line/it-series-a` } })
    const line = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line` } })

    await setProductMembership(request(), actor, series.id, { product: fixture.products[0], action: 'exclude' })
    await setProductMembership(request(), actor, line.id, { product: fixture.products[4], action: 'include' })
    expect(await code(setProductMembership(request(), actor, series.id, { product: fixture.products[4], action: 'include' }))).toBe('duplicate_through_hierarchy')
    expect(await code(setProductMembership(request(), actor, series.id, { product: fixture.foreignProduct, action: 'include' }))).toBe('product_brand_mismatch')
    expect(await code(setProductMembership(request(), actor, series.id, { product: 'no-such-product', action: 'include' }))).toBe('product_not_found')

    const rerun = await bootstrap()
    expect(rerun.applied).toMatchObject({ linksCreated: 0, linksMarkedMissing: 0 })
    expect(rerun.plan.links.suppressedByAdmin.map(link => link.productId)).toEqual([fixture.products[0]])
    expect(await prisma.productBrandLine.findUniqueOrThrow({ where: { productId_brandLineId: { productId: fixture.products[0], brandLineId: series.id } } })).toMatchObject({ status: 'excluded' })
    expect(await prisma.productBrandLine.findUniqueOrThrow({ where: { productId_brandLineId: { productId: fixture.products[4], brandLineId: line.id } } })).toMatchObject({ origin: 'admin', status: 'active' })

    await setProductMembership(request(), actor, series.id, { product: fixture.products[0], action: 'include' })
    expect(await prisma.productBrandLine.findUniqueOrThrow({ where: { productId_brandLineId: { productId: fixture.products[0], brandLineId: series.id } } })).toMatchObject({ origin: 'admin', status: 'active' })
    expect(await productFingerprint([...fixture.products, fixture.foreignProduct])).toBe(before)
  })

  it('never classifies a brand-versus-line conflict on its own and applies only the administrator decision', async () => {
    const conflict = await prisma.brandLineReviewItem.findUniqueOrThrow({ where: { source_reason_subjectKey: { source: 'nop390', reason: 'brand_vs_line_conflict', subjectKey: '9104' } } })
    expect(conflict.status).toBe('open')
    await bootstrap()
    expect(await prisma.catalogSourceCategoryMapping.count({ where: { sourceCategoryId: '9104' } })).toBe(0)
    expect(await prisma.brandLineReviewItem.findUniqueOrThrow({ where: { id: conflict.id } })).toMatchObject({ status: 'open', occurrences: 2 })

    expect(await code(actOnReviewItem(request(), actor, conflict.id, { action: 'confirm_line', brandKey: fixture.otherBrandKey, slug: 'it-urban' }))).toBe('category_brand_mismatch')
    const confirmed = await actOnReviewItem(request(), actor, conflict.id, { action: 'confirm_line', brandKey: fixture.brandKey, slug: 'it-urban', note: 'owner decision' })
    expect(confirmed.status).toBe('resolved')
    expect(await prisma.brandLine.findUniqueOrThrow({ where: { id: confirmed.brandLineId! } })).toMatchObject({ origin: 'admin', adminLocked: true, brandKey: fixture.brandKey })
    expect(await code(actOnReviewItem(request(), actor, conflict.id, { action: 'resolve' }))).toBe('review_closed')

    const unknownRoot = await prisma.brandLineReviewItem.findUniqueOrThrow({ where: { source_reason_subjectKey: { source: 'nop390', reason: 'unknown_root_line', subjectKey: '9103' } } })
    await actOnReviewItem(request(), actor, unknownRoot.id, { action: 'reject' })
    expect(await prisma.catalogSourceCategoryMapping.findFirstOrThrow({ where: { sourceCategoryId: '9103' } })).toMatchObject({ targetType: 'ignore', status: 'rejected', origin: 'admin' })

    // The next synchronization links the products of the admin line and leaves the rejected category alone.
    const rerun = await bootstrap()
    expect(rerun.plan.links.create.map(link => [link.productId, link.lineKey])).toEqual([[fixture.products[3], `${fixture.brandKey}/it-urban`]])
    expect(rerun.plan.reviews.some(item => item.subjectKey === '9103' || item.subjectKey === '9104')).toBe(false)
    expect(await prisma.brandLineReviewItem.findUniqueOrThrow({ where: { id: unknownRoot.id } })).toMatchObject({ status: 'dismissed' })
    expect(await prisma.auditLog.count({ where: { action: { in: ['catalog.brand_line_review_confirm_line', 'catalog.brand_line_review_reject'] }, entityId: { in: [conflict.id, unknownRoot.id] } } })).toBe(2)
  })
})
