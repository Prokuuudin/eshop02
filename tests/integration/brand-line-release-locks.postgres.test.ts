import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ServerUser } from '@/lib/server-auth'
import { lockBrandLineBootstrap, runBrandLineBootstrap } from '@/lib/brand-lines/brand-line-bootstrap'
import { setProductMembership } from '@/lib/brand-lines/brand-line-admin'
import { applyReleasePlan, buildReleasePlan } from '@/lib/brand-lines/brand-line-release'
import { lockTaxonomySource, persistTaxonomyBegin } from '@/lib/sync/hairshop-taxonomy-persistence'
import { taxonomySnapshotSha256 } from '@/lib/sync/hairshop-taxonomy-sync'
import { applySnapshot, buildBrandLineFixture, truncateBrandLineAndTaxonomy, type BrandLineFixture } from './brand-line-test-fixture'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('ep-long-glitter')) {
  throw new Error('Refusing to run the BrandLine release suite against the production database')
}

const IDENTITY = { projectId: 'lively-resonance-45595963', branchId: 'br-wild-field-aqqqqlnz', endpointId: 'ep-empty-feather-aqiutjd0' }
let fixture: BrandLineFixture
let actor: ServerUser
const request = (): NextRequest => new NextRequest('http://localhost/cli/brand-lines-release', { headers: { 'user-agent': 'brand-line-release-it' } })
const seeds = () => ({ seeds: fixture.seeds, aliases: [] })
const code = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: { code?: string; message?: string }) => error.code ?? error.message)

async function counts(): Promise<string> {
  const [lines, links, mappings, reviews] = await Promise.all([
    prisma.brandLine.count(), prisma.productBrandLine.count(), prisma.catalogSourceCategoryMapping.count(), prisma.brandLineReviewItem.count(),
  ])
  return `${lines}/${links}/${mappings}/${reviews}`
}

async function pendingFor<T>(promise: Promise<T>, ms: number): Promise<boolean> {
  const marker = Symbol('pending')
  const winner = await Promise.race([promise.then(() => null, () => null), new Promise(resolve => setTimeout(() => resolve(marker), ms))])
  return winner === marker
}

// Opens a transaction that takes the given locks and keeps them until release() is called.
async function holdLocks(take: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<void>): Promise<{ release: () => void; done: Promise<unknown> }> {
  let locked!: () => void
  let release!: () => void
  const acquired = new Promise<void>(resolve => { locked = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const done = prisma.$transaction(async tx => { await take(tx); locked(); await gate }, { maxWait: 10_000, timeout: 120_000 })
  await acquired
  return { release, done }
}

beforeAll(async () => {
  fixture = await buildBrandLineFixture()
  const admin = await prisma.user.findFirstOrThrow({ where: { platformRole: 'admin' }, select: { id: true, email: true } })
  actor = { id: admin.id, email: admin.email, platformRole: 'admin', approvalRequired: false, auditLoggingEnabled: true } as ServerUser
})

beforeEach(async () => {
  await truncateBrandLineAndTaxonomy()
  await applySnapshot(fixture.data, '2026-10-30T10:00:00.000Z')
})

describe('BrandLine release bootstrap (isolated Postgres)', () => {
  it('plans read-only, applies exactly the approved plan once and audits it', async () => {
    const before = await counts()
    const { release } = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    expect(await counts()).toBe(before)
    expect(release.summary).toMatchObject({ linesCreate: 2, linksCreate: 2, linksMarkMissing: 0, reviewsExisting: 0 })
    expect(release.guard.exceeded).toBe(false)

    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: 'f'.repeat(64), identity: IDENTITY, ...seeds(), actor, request: request() }))).toBe('APPROVAL_MISMATCH')
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: { ...IDENTITY, endpointId: 'ep-long-glitter-aq88pk3t' }, ...seeds(), actor, request: request() }))).toBe('IDENTITY_MISMATCH')
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, seeds: fixture.seeds.slice(1), aliases: [], actor, request: request() }))).toBe('SEED_MISMATCH')
    expect(await counts()).toBe(before)

    const result = await applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() })
    expect(result.applied).toMatchObject({ lines: 2, linksCreated: 2 })
    expect(await prisma.auditLog.count({ where: { action: 'catalog.brand_line_bootstrap_applied', requestId: release.planSha256 } })).toBe(1)

    // The approved plan is consumed: replaying it is refused and writes nothing.
    const applied = await counts()
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() }))).toBe('PLAN_CHANGED')
    expect(await counts()).toBe(applied)
    const again = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    expect(again.release.summary).toMatchObject({ linesCreate: 0, linksCreate: 0, linksRefresh: 0, linksMarkMissing: 0, reviewsNew: 0 })
    const noop = await applyReleasePlan(prisma, { approved: again.release, approvedHash: again.release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() })
    expect(noop.applied).toMatchObject({ lines: 0, linksCreated: 0, linksMarkedMissing: 0, reviewsCreated: 0 })
    expect(await counts()).toBe(applied)
  })

  it('refuses a plan whose data or snapshot changed, or while a synchronization is running', async () => {
    const { release } = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    await prisma.catalogSourceCategoryMapping.create({ data: { source: 'nop390', sourceCategoryId: '9103', targetType: 'ignore', status: 'rejected', origin: 'admin' } })
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() }))).toBe('PLAN_CHANGED')
    expect(await prisma.brandLine.count()).toBe(0)

    const second = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    await applySnapshot(fixture.data, '2026-10-30T11:00:00.000Z')
    expect(await code(applyReleasePlan(prisma, { approved: second.release, approvedHash: second.release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() }))).toBe('SNAPSHOT_CHANGED')

    const manifest = { source: 'nop390' as const, generatedAtUtc: '2026-10-30T12:00:00.000Z', categories: 0, manufacturers: 0, productCategoryMappings: 0, productManufacturerMappings: 0, expectedBatchCount: 0, snapshotSha256: taxonomySnapshotSha256({ categories: [], manufacturers: [], productCategories: [], productManufacturers: [] }) }
    await persistTaxonomyBegin({ schemaVersion: 2, runId: `it-release-running-${Date.now()}`, mode: 'apply', operation: 'begin', manifest })
    expect(await code(buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() }))).toBe('SYNC_IN_PROGRESS')
    expect(await prisma.brandLine.count()).toBe(0)
  })

  it('holds back mass missing marks unless the operator confirms the exact count', async () => {
    const extra = (await prisma.product.findMany({ where: { brand: { equals: (await prisma.product.findUniqueOrThrow({ where: { id: fixture.products[0] } })).brand }, isDeleted: false, id: { startsWith: '1' } }, select: { id: true }, take: 40, orderBy: { id: 'asc' } }))
      .map(row => row.id).filter(id => /^\d+$/u.test(id)).slice(0, 8)
    expect(extra.length).toBeGreaterThanOrEqual(7)
    const wide = { ...fixture.data, productCategories: extra.map(productId => ({ productId, categoryId: '9101', displayOrder: 0, isFeaturedProduct: false })) }
    await applySnapshot(wide, '2026-10-30T11:00:00.000Z')
    await runBrandLineBootstrap({ mode: 'apply', ...seeds() })
    await applySnapshot({ ...wide, productCategories: [] }, '2026-10-30T12:00:00.000Z')
    const { release } = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    expect(release.guard).toMatchObject({ markMissing: extra.length, exceeded: true })
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() }))).toBe('MASS_CHANGE')
    expect(await prisma.productBrandLine.count({ where: { isPresentInSource: false } })).toBe(0)
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request(), allowMassMissing: extra.length - 1 }))).toBe('MASS_CHANGE')
    await applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request(), allowMassMissing: extra.length })
    expect(await prisma.productBrandLine.count({ where: { isPresentInSource: false } })).toBe(extra.length)
    expect(await prisma.productBrandLine.count()).toBe(extra.length)
  })

  it('rolls the whole apply back when the audit write fails, and a later run succeeds', async () => {
    const { release } = await buildReleasePlan(prisma, { identity: IDENTITY, ...seeds() })
    const broken = { ...actor, email: null } as unknown as ServerUser
    expect(await code(applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor: broken, request: request() }))).not.toBe('ok')
    expect(await counts()).toBe('0/0/0/0')
    const result = await applyReleasePlan(prisma, { approved: release, approvedHash: release.planSha256, identity: IDENTITY, ...seeds(), actor, request: request() })
    expect(result.applied).toMatchObject({ lines: 2, linksCreated: 2 })
  })
})

describe('Taxonomy finalize and BrandLine bootstrap coordination (isolated Postgres)', () => {
  it('a bootstrap waits for a finalize in progress, and a finalize waits for a running bootstrap', async () => {
    const finalizing = await holdLocks(tx => lockTaxonomySource(tx))
    const bootstrap = runBrandLineBootstrap({ mode: 'apply', ...seeds() })
    expect(await pendingFor(bootstrap, 2_500)).toBe(true)
    finalizing.release()
    await finalizing.done
    expect((await bootstrap).applied).toMatchObject({ lines: 2 })

    const bootstrapping = await holdLocks(tx => lockBrandLineBootstrap(tx))
    const finalize = applySnapshot(fixture.data, '2026-10-30T11:00:00.000Z')
    expect(await pendingFor(finalize, 2_500)).toBe(true)
    bootstrapping.release()
    await bootstrapping.done
    await finalize
    expect(await prisma.taxonomySnapshotSession.count({ where: { status: 'completed' } })).toBe(2)
  })

  it('two concurrent bootstraps apply once; finalize, bootstrap and an admin edit together do not deadlock', async () => {
    const [first, second] = await Promise.all([runBrandLineBootstrap({ mode: 'apply', ...seeds() }), runBrandLineBootstrap({ mode: 'apply', ...seeds() })])
    expect((first.applied!.linksCreated) + (second.applied!.linksCreated)).toBe(2)
    expect((first.applied!.lines) + (second.applied!.lines)).toBe(2)
    expect(await prisma.productBrandLine.count()).toBe(2)

    const series = await prisma.brandLine.findUniqueOrThrow({ where: { key: `${fixture.brandKey}/it-line/it-series-a` } })
    const started = Date.now()
    await Promise.all([
      applySnapshot(fixture.data, '2026-10-30T11:00:00.000Z'),
      runBrandLineBootstrap({ mode: 'apply', ...seeds() }),
      setProductMembership(request(), actor, series.id, { product: fixture.products[0], action: 'exclude' }),
      applySnapshot(fixture.data, '2026-10-30T12:00:00.000Z'),
      runBrandLineBootstrap({ mode: 'apply', ...seeds() }),
    ])
    expect(Date.now() - started).toBeLessThan(120_000)
    expect(await prisma.productBrandLine.findUniqueOrThrow({ where: { productId_brandLineId: { productId: fixture.products[0], brandLineId: series.id } } })).toMatchObject({ status: 'excluded' })
    expect(await prisma.productBrandLine.count()).toBe(2)
  })

  it('leaves the v1 new-product lock independent of the taxonomy and BrandLine locks', async () => {
    const held = await holdLocks(tx => lockBrandLineBootstrap(tx))
    const free = await prisma.$transaction(tx => tx.$queryRaw<Array<{ free: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('hairshop-catalog-new-products')) AS free`)
    held.release()
    await held.done
    expect(free[0].free).toBe(true)
  })
})

