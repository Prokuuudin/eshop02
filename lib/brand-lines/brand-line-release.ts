import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import { applyPlan, loadBrandLinePlanInput, lockBrandLineBootstrap, type BrandLineApplyResult } from './brand-line-bootstrap'
import { planBrandLines, type BrandAlias, type BrandLinePlan, type LineSeed } from './brand-line-plan'

// Release-grade BrandLine bootstrap: a read-only plan that an operator reviews and
// approves by its hash, then an apply that recomputes the plan under the shared
// taxonomy/BrandLine locks and refuses unless it is byte-for-byte the approved one.

const SOURCE = 'nop390'
// A receiving taxonomy session younger than this means a synchronization is running.
export const SYNC_IN_PROGRESS_WINDOW_MS = 6 * 60 * 60 * 1000
const REQUIRED_MIGRATIONS = ['20261030170000_taxonomy_snapshot_staging', '20261030200000_brand_line_bootstrap']

export class BrandLineReleaseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'BrandLineReleaseError'
  }
}

export type DatabaseIdentity = { projectId: string; branchId: string; endpointId: string }

/** `ep-xxx` from a Neon connection string (direct or pooled host). */
export function endpointFromDatabaseUrl(databaseUrl: string): string {
  let host: string
  try { host = new URL(databaseUrl).hostname } catch { throw new BrandLineReleaseError('INVALID_DATABASE_URL', 'DATABASE_URL is not a URL.') }
  const match = /^(ep-[a-z0-9-]+?)(-pooler)?\./u.exec(host)
  if (!match) throw new BrandLineReleaseError('NOT_A_NEON_ENDPOINT', 'DATABASE_URL does not point at a Neon endpoint.')
  return match[1]
}

export type NeonEndpointLookup = (projectId: string, endpointId: string) => Promise<{ projectId: string; branchId: string }>

/**
 * The connection must be the endpoint the operator named, and the Neon API must
 * confirm that endpoint belongs to the named project and branch.
 */
export async function verifyDatabaseIdentity(databaseUrl: string, expected: DatabaseIdentity, lookup: NeonEndpointLookup): Promise<DatabaseIdentity> {
  const endpointId = endpointFromDatabaseUrl(databaseUrl)
  if (endpointId !== expected.endpointId) throw new BrandLineReleaseError('ENDPOINT_MISMATCH', 'DATABASE_URL points at a different endpoint than --expect-endpoint.')
  const actual = await lookup(expected.projectId, endpointId)
  if (actual.projectId !== expected.projectId || actual.branchId !== expected.branchId) {
    throw new BrandLineReleaseError('BRANCH_MISMATCH', 'The Neon API reports another project or branch for this endpoint.')
  }
  return { projectId: actual.projectId, branchId: actual.branchId, endpointId }
}

export function neonApiLookup(apiKey: string, fetchImpl: typeof fetch = fetch): NeonEndpointLookup {
  return async (projectId, endpointId) => {
    const response = await fetchImpl(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    })
    if (!response.ok) throw new BrandLineReleaseError('NEON_API_FAILED', `Neon API answered ${response.status} for the endpoint lookup.`)
    const body = await response.json() as { endpoint?: { project_id?: string; branch_id?: string } }
    if (!body.endpoint?.project_id || !body.endpoint.branch_id) throw new BrandLineReleaseError('NEON_API_FAILED', 'Neon API response has no endpoint.')
    return { projectId: body.endpoint.project_id, branchId: body.endpoint.branch_id }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

const byJson = (a: unknown, b: unknown): number => JSON.stringify(a).localeCompare(JSON.stringify(b))

/** Order-independent fingerprint of everything the apply would write. */
export function planHash(snapshotId: string, plan: BrandLinePlan): string {
  const canonical = {
    snapshotId,
    manufacturerMappings: [...plan.manufacturerMappings].sort(byJson),
    categoryMappings: [...plan.categoryMappings].sort(byJson),
    lines: [...plan.lines].sort(byJson),
    linksCreate: [...plan.links.create].sort(byJson),
    linksRefresh: [...plan.links.refresh].sort(byJson),
    linksMarkMissing: [...plan.links.markMissing].sort(byJson),
    reviews: plan.reviews.map(item => `${item.reason}:${item.subjectKey}`).sort(),
  }
  return sha256(JSON.stringify(canonical))
}

export function seedHash(seeds: LineSeed[], aliases: BrandAlias[]): string {
  return sha256(JSON.stringify({ seeds: [...seeds].sort(byJson), aliases: [...aliases].sort(byJson) }))
}

export type MassChangeGuard = { activeSyncLinks: number; markMissing: number; markMissingLimit: number; exceeded: boolean }

/** Marking links missing is the only bulk loss of membership; it must stay small. */
export function massChangeGuard(plan: BrandLinePlan, activeSyncLinks: number): MassChangeGuard {
  const markMissingLimit = Math.max(5, Math.ceil(activeSyncLinks * 0.02))
  const markMissing = plan.links.markMissing.length
  return { activeSyncLinks, markMissing, markMissingLimit, exceeded: markMissing > markMissingLimit }
}

type Tx = ExtendedTransactionClient

async function assertPreconditions(tx: Tx, now: Date): Promise<{ id: string; runId: string; snapshotSha256: string; generatedAtUtc: Date; appliedAt: Date }> {
  const applied = await tx.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL AND migration_name = ANY(${REQUIRED_MIGRATIONS})`
  const missing = REQUIRED_MIGRATIONS.filter(name => !applied.some(row => row.migration_name === name))
  if (missing.length) throw new BrandLineReleaseError('MIGRATIONS_MISSING', `Required migrations are not applied: ${missing.join(', ')}.`)
  const active = await tx.taxonomySnapshotSession.findFirst({
    where: { source: SOURCE, status: 'completed', appliedAt: { not: null } },
    orderBy: { appliedAt: 'desc' },
    select: { id: true, runId: true, snapshotSha256: true, generatedAtUtc: true, appliedAt: true },
  })
  if (!active?.appliedAt) throw new BrandLineReleaseError('NO_ACTIVE_SNAPSHOT', 'No completed, applied taxonomy snapshot exists.')
  const running = await tx.taxonomySnapshotSession.count({
    where: { source: SOURCE, status: 'receiving', createdAt: { gte: new Date(now.getTime() - SYNC_IN_PROGRESS_WINDOW_MS) } },
  })
  if (running > 0) throw new BrandLineReleaseError('SYNC_IN_PROGRESS', 'A taxonomy synchronization is still receiving batches.')
  return { ...active, appliedAt: active.appliedAt }
}

export type ReleasePlan = {
  kind: 'brand-line-release-plan'
  version: 1
  createdAt: string
  identity: DatabaseIdentity
  snapshot: { id: string; runId: string; snapshotSha256: string; generatedAtUtc: string; appliedAt: string }
  seedSha256: string
  planSha256: string
  guard: MassChangeGuard
  summary: {
    linesCreate: number; categoryMappingsCreate: number; manufacturerMappingsCreate: number
    linksCreate: number; linksRefresh: number; linksMarkMissing: number; linksSuppressedByAdmin: number
    reviewsNew: number; reviewsExisting: number
    preserved: { adminLockedLines: number; adminLinks: number; excludedLinks: number; adminMappings: number }
  }
}

async function summarize(tx: Tx, plan: BrandLinePlan): Promise<ReleasePlan['summary']> {
  const [existingReviews, adminLockedLines, adminLinks, excludedLinks, adminMappings] = await Promise.all([
    tx.brandLineReviewItem.findMany({ where: { source: SOURCE }, select: { reason: true, subjectKey: true } }),
    tx.brandLine.count({ where: { adminLocked: true } }),
    tx.productBrandLine.count({ where: { origin: 'admin' } }),
    tx.productBrandLine.count({ where: { status: 'excluded' } }),
    tx.catalogSourceCategoryMapping.count({ where: { origin: 'admin' } }),
  ])
  const known = new Set(existingReviews.map(row => `${row.reason}:${row.subjectKey}`))
  const reviewsExisting = plan.reviews.filter(item => known.has(`${item.reason}:${item.subjectKey}`)).length
  return {
    linesCreate: plan.lines.length,
    categoryMappingsCreate: plan.categoryMappings.length,
    manufacturerMappingsCreate: plan.manufacturerMappings.length,
    linksCreate: plan.links.create.length,
    linksRefresh: plan.links.refresh.length,
    linksMarkMissing: plan.links.markMissing.length,
    linksSuppressedByAdmin: plan.links.suppressedByAdmin.length,
    reviewsNew: plan.reviews.length - reviewsExisting,
    reviewsExisting,
    preserved: { adminLockedLines, adminLinks, excludedLinks, adminMappings },
  }
}

async function computePlan(tx: Tx, seeds: LineSeed[], aliases: BrandAlias[]): Promise<{ plan: BrandLinePlan; snapshotId: string; guard: MassChangeGuard }> {
  const input = await loadBrandLinePlanInput(tx, seeds, aliases)
  const plan = planBrandLines(input)
  const activeSyncLinks = input.existing.links.filter(link => link.origin === 'source_sync' && link.status === 'active').length
  return { plan, snapshotId: input.snapshotId, guard: massChangeGuard(plan, activeSyncLinks) }
}

/** Read-only: one REPEATABLE READ snapshot, nothing is written. */
export async function buildReleasePlan(db: ExtendedPrismaClient, options: {
  identity: DatabaseIdentity; seeds: LineSeed[]; aliases: BrandAlias[]; now?: Date
}): Promise<{ release: ReleasePlan; plan: BrandLinePlan }> {
  const now = options.now ?? new Date()
  return db.$transaction(async tx => {
    const snapshot = await assertPreconditions(tx, now)
    const { plan, snapshotId, guard } = await computePlan(tx, options.seeds, options.aliases)
    if (snapshotId !== snapshot.id) throw new BrandLineReleaseError('SNAPSHOT_CHANGED', 'The active snapshot changed while planning.')
    const release: ReleasePlan = {
      kind: 'brand-line-release-plan',
      version: 1,
      createdAt: now.toISOString(),
      identity: options.identity,
      snapshot: { id: snapshot.id, runId: snapshot.runId, snapshotSha256: snapshot.snapshotSha256, generatedAtUtc: snapshot.generatedAtUtc.toISOString(), appliedAt: snapshot.appliedAt.toISOString() },
      seedSha256: seedHash(options.seeds, options.aliases),
      planSha256: planHash(snapshotId, plan),
      guard,
      summary: await summarize(tx, plan),
    }
    return { release, plan }
  }, { isolationLevel: 'RepeatableRead', maxWait: 30_000, timeout: 300_000 })
}

export type ReleaseApplyResult = { applied: BrandLineApplyResult; planSha256: string; snapshotId: string }

/**
 * Applies exactly the approved plan or nothing: identity, seeds, active snapshot,
 * sync state, plan hash and the mass-change guard are re-checked inside the
 * transaction under the shared locks. Any failure rolls the whole apply back.
 */
export async function applyReleasePlan(db: ExtendedPrismaClient, options: {
  approved: ReleasePlan
  approvedHash: string
  identity: DatabaseIdentity
  seeds: LineSeed[]
  aliases: BrandAlias[]
  actor: ServerUser
  request: NextRequest
  allowMassMissing?: number
  now?: Date
}): Promise<ReleaseApplyResult> {
  const { approved } = options
  if (options.approvedHash !== approved.planSha256) throw new BrandLineReleaseError('APPROVAL_MISMATCH', 'The --approve hash is not the hash of the plan file.')
  const sameIdentity = approved.identity.projectId === options.identity.projectId
    && approved.identity.branchId === options.identity.branchId && approved.identity.endpointId === options.identity.endpointId
  if (!sameIdentity) throw new BrandLineReleaseError('IDENTITY_MISMATCH', 'The plan was made for another database.')
  if (seedHash(options.seeds, options.aliases) !== approved.seedSha256) throw new BrandLineReleaseError('SEED_MISMATCH', 'The seed file differs from the planned one.')

  return db.$transaction(async tx => {
    await lockBrandLineBootstrap(tx)
    const snapshot = await assertPreconditions(tx, options.now ?? new Date())
    if (snapshot.id !== approved.snapshot.id) throw new BrandLineReleaseError('SNAPSHOT_CHANGED', 'A newer taxonomy snapshot was applied after planning; plan again.')
    const { plan, snapshotId, guard } = await computePlan(tx, options.seeds, options.aliases)
    const hash = planHash(snapshotId, plan)
    if (hash !== approved.planSha256) throw new BrandLineReleaseError('PLAN_CHANGED', 'The data changed since the plan was approved; plan again.')
    if (guard.exceeded && options.allowMassMissing !== guard.markMissing) {
      throw new BrandLineReleaseError('MASS_CHANGE', `The plan marks ${guard.markMissing} links missing (limit ${guard.markMissingLimit}); confirm with --allow-mass-missing ${guard.markMissing}.`)
    }
    const applied = await applyPlan(tx, plan, snapshotId)
    await appendServerAudit(tx, options.request, options.actor, {
      action: 'catalog.brand_line_bootstrap_applied',
      entityType: 'brand_line_bootstrap',
      entityId: snapshotId,
      entityTitle: `taxonomy run ${snapshot.runId}`,
      after: { planSha256: hash, seedSha256: approved.seedSha256, identity: options.identity, applied },
      details: `Applied approved BrandLine plan ${hash}`,
      requestId: hash.slice(0, 64),
    })
    return { applied, planSha256: hash, snapshotId }
  }, { maxWait: 30_000, timeout: 300_000 })
}

export type RevalidationOutcome = { ok: boolean; status: number | null; attempts: number }

/**
 * Asks the running application to drop the storefront caches of an audited bootstrap.
 * Network errors and 5xx answers are retried; 4xx answers are final (wrong key, unknown
 * bootstrap). Idempotent: repeating it only revalidates again. Caches also expire on
 * their own (sale products 300 s, bestsellers 600 s), so a lost call means bounded staleness.
 */
export async function requestStorefrontRevalidation(options: {
  baseUrl: string
  secret: string
  snapshotId: string
  planSha256: string
  fetchImpl?: typeof fetch
  attempts?: number
  delayMs?: number
}): Promise<RevalidationOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch
  const attempts = Math.max(1, options.attempts ?? 4)
  let status: number | null = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(new URL('/api/internal/hairshop-catalog-sync/storefront-revalidate', options.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hairshop-catalog-sync-key': options.secret },
        body: JSON.stringify({ reason: 'brand_line_bootstrap', snapshotId: options.snapshotId, planSha256: options.planSha256 }),
      })
      status = response.status
      if (response.ok) return { ok: true, status, attempts: attempt }
      if (status < 500) return { ok: false, status, attempts: attempt }
    } catch {
      status = null
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, (options.delayMs ?? 1_000) * 2 ** (attempt - 1)))
  }
  return { ok: false, status, attempts }
}
