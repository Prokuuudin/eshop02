import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedPrismaClient, type ExtendedTransactionClient } from '@/lib/prisma'
import {
  TAXONOMY_BATCH_KINDS,
  taxonomyBatchRequestSchema,
  taxonomyBatchSha256,
  taxonomyBeginRequestSchema,
  taxonomyFinalizeRequestSchema,
  taxonomyManifestSchema,
  finalizeTaxonomySnapshot,
  type TaxonomyBatchRequest,
  type TaxonomySnapshotData,
  type TaxonomySnapshotSession as ProtocolSession,
} from './hairshop-taxonomy-sync'

const SOURCE = 'nop390' as const
const MANIFEST_LIMITS = {
  categories: 100_000,
  manufacturers: 100_000,
  productCategoryMappings: 5_000_000,
  productManufacturerMappings: 5_000_000,
  expectedBatchCount: 100_000,
} as const

// Staged batch payloads are a transport buffer: the mirror keeps the data and the
// session row keeps the manifest. Payloads of closed sessions are pruned after this.
export const TAXONOMY_STAGING_RETENTION_DAYS = 14

// Raw SQL writes into Prisma's TIMESTAMP(3) (without time zone) columns, which
// hold UTC. Converting explicitly keeps them correct whatever the session TimeZone.
const NOW_UTC = Prisma.sql`(now() AT TIME ZONE 'UTC')`

// A finalize that fails with one of these codes can never succeed for the same
// session, so the session is closed as rejected. Other failures (for example a
// still incomplete snapshot) are recorded but leave the session receiving.
const TERMINAL_FINALIZE_CODES = new Set([
  'SNAPSHOT_HASH_MISMATCH',
  'MANIFEST_COUNT_MISMATCH',
  'BATCH_TOTAL_CONFLICT',
  'DUPLICATE_CATEGORY',
  'DUPLICATE_MANUFACTURER',
  'DUPLICATE_PRODUCT_CATEGORY',
  'DUPLICATE_PRODUCT_MANUFACTURER',
  'MISSING_CATEGORY_PARENT',
  'CATEGORY_CYCLE',
  'MISSING_MAPPING_CATEGORY',
  'MISSING_MAPPING_MANUFACTURER',
  'STALE_SNAPSHOT',
])

type DatabaseClient = ExtendedPrismaClient | ExtendedTransactionClient

export class TaxonomyPersistenceError extends Error {
  constructor(readonly code: string, message: string, readonly sessionId?: string) {
    super(message)
    this.name = 'TaxonomyPersistenceError'
  }
}

export type TaxonomySessionStatus = 'receiving' | 'completed' | 'rejected' | 'expired'

export type TaxonomyOperationResult = {
  status: 'accepted' | 'duplicate' | 'completed'
  sessionId: string
  runId: string
  operation: 'begin' | 'batch' | 'finalize'
  sessionStatus: TaxonomySessionStatus
  receivedBatchCount?: number
  mirrorApplied?: boolean
  counts?: {
    categories: number
    manufacturers: number
    productCategoryMappings: number
    productManufacturerMappings: number
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertManifestLimits(manifest: z.infer<typeof taxonomyManifestSchema>): void {
  for (const [key, limit] of Object.entries(MANIFEST_LIMITS)) {
    if (manifest[key as keyof typeof MANIFEST_LIMITS] > limit) {
      throw new TaxonomyPersistenceError('MANIFEST_LIMIT_EXCEEDED', `${key} exceeds the accepted snapshot limit.`)
    }
  }
}

async function lockRun(db: DatabaseClient, runId: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'hairshop-taxonomy:' + SOURCE + ':' + runId}, 0))`
}

// Serializes finalize (and pruning) across all runs of the source, so two
// snapshots can never be promoted into the mirror concurrently. The BrandLine
// bootstrap takes it too, so it never reads a mirror that a finalize is rewriting.
export async function lockTaxonomySource(db: DatabaseClient): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'hairshop-taxonomy:' + SOURCE + ':finalize'}, 0))`
}

function parsedManifest(value: unknown): z.infer<typeof taxonomyManifestSchema> {
  const result = taxonomyManifestSchema.safeParse(value)
  if (!result.success) throw new TaxonomyPersistenceError('STORED_MANIFEST_INVALID', 'Stored snapshot manifest is invalid.')
  return result.data
}

function sessionStatus(value: string): TaxonomySessionStatus {
  return z.enum(['receiving', 'completed', 'rejected', 'expired']).parse(value)
}

function assertSessionMatches(
  session: { mode: string; snapshotSha256: string },
  request: { mode: string },
  snapshotSha256: string,
): void {
  if (session.mode !== request.mode) throw new TaxonomyPersistenceError('MODE_MISMATCH', 'Request mode differs from the persisted session.')
  if (session.snapshotSha256 !== snapshotSha256) {
    throw new TaxonomyPersistenceError('SNAPSHOT_HASH_MISMATCH', 'Request references a different snapshot checksum.')
  }
}

function assertSessionOpenForRetry(session: { status: string }): void {
  if (session.status === 'rejected' || session.status === 'expired') {
    throw new TaxonomyPersistenceError('SESSION_CLOSED', `The snapshot session is ${session.status}; start a new runId.`)
  }
}

export async function persistTaxonomyBegin(
  input: unknown,
  db: ExtendedPrismaClient = prisma,
): Promise<TaxonomyOperationResult> {
  const request = taxonomyBeginRequestSchema.parse(input)
  assertManifestLimits(request.manifest)
  return db.$transaction(async tx => {
    await lockRun(tx, request.runId)
    const existing = await tx.taxonomySnapshotSession.findUnique({
      where: { source_runId: { source: SOURCE, runId: request.runId } },
      include: { _count: { select: { batches: true } } },
    })
    if (existing) {
      const manifest = parsedManifest(existing.manifest)
      assertSessionMatches(existing, request, request.manifest.snapshotSha256)
      if (!jsonEqual(manifest, request.manifest)) {
        throw new TaxonomyPersistenceError('BEGIN_CONFLICT', 'The runId already exists with a different manifest.')
      }
      assertSessionOpenForRetry(existing)
      return {
        status: 'duplicate', sessionId: existing.id, runId: request.runId, operation: 'begin',
        sessionStatus: sessionStatus(existing.status), receivedBatchCount: existing._count.batches,
      }
    }
    const created = await tx.taxonomySnapshotSession.create({
      data: {
        source: SOURCE,
        runId: request.runId,
        mode: request.mode,
        manifest: request.manifest,
        snapshotSha256: request.manifest.snapshotSha256,
        expectedBatchCount: request.manifest.expectedBatchCount,
        generatedAtUtc: new Date(request.manifest.generatedAtUtc),
      },
      select: { id: true },
    })
    return {
      status: 'accepted', sessionId: created.id, runId: request.runId, operation: 'begin',
      sessionStatus: 'receiving', receivedBatchCount: 0,
    }
  }, { maxWait: 10_000, timeout: 30_000 })
}

function sameStoredBatch(
  stored: { type: string; batchIndex: number; batchTotal: number; checksum: string; itemCount: number },
  batch: TaxonomyBatchRequest['batch'],
): boolean {
  return stored.type === batch.kind
    && stored.batchIndex === batch.index
    && stored.batchTotal === batch.total
    && stored.checksum === batch.payloadSha256
    && stored.itemCount === batch.items.length
}

export async function persistTaxonomyBatch(
  input: unknown,
  db: ExtendedPrismaClient = prisma,
): Promise<TaxonomyOperationResult> {
  const request = taxonomyBatchRequestSchema.parse(input)
  if (request.batch.index >= request.batch.total) {
    throw new TaxonomyPersistenceError('INVALID_BATCH_INDEX', 'Batch index must be smaller than batch total.')
  }
  if (request.batch.batchId !== `${request.batch.kind}:${request.batch.index}`) {
    throw new TaxonomyPersistenceError('INVALID_BATCH_ID', 'Batch ID is not deterministic for its kind and index.')
  }
  if (taxonomyBatchSha256(request.batch) !== request.batch.payloadSha256) {
    throw new TaxonomyPersistenceError('BATCH_HASH_MISMATCH', 'Batch payload checksum does not match its contents.')
  }

  return db.$transaction(async tx => {
    await lockRun(tx, request.runId)
    const session = await tx.taxonomySnapshotSession.findUnique({
      where: { source_runId: { source: SOURCE, runId: request.runId } },
      include: { _count: { select: { batches: true } } },
    })
    if (!session) throw new TaxonomyPersistenceError('SESSION_NOT_FOUND', 'Begin must be accepted before batches.')
    assertSessionMatches(session, request, request.snapshotSha256)
    assertSessionOpenForRetry(session)

    const existing = await tx.taxonomySnapshotBatch.findUnique({
      where: { sessionId_batchId: { sessionId: session.id, batchId: request.batch.batchId } },
    })
    if (existing) {
      if (!sameStoredBatch(existing, request.batch)) {
        throw new TaxonomyPersistenceError('BATCH_CONFLICT', 'The batchId already exists with different contents.')
      }
      return {
        status: 'duplicate', sessionId: session.id, runId: request.runId, operation: 'batch',
        sessionStatus: sessionStatus(session.status), receivedBatchCount: session._count.batches,
      }
    }
    if (session.status !== 'receiving') {
      throw new TaxonomyPersistenceError('SESSION_FINALIZED', 'No new batches may be added to a completed session.')
    }
    if (session._count.batches >= session.expectedBatchCount) {
      throw new TaxonomyPersistenceError('UNEXPECTED_BATCH', 'The manifest batch count has already been reached.')
    }
    const kindBatch = await tx.taxonomySnapshotBatch.findFirst({
      where: { sessionId: session.id, type: request.batch.kind },
      select: { batchTotal: true },
    })
    if (kindBatch && kindBatch.batchTotal !== request.batch.total) {
      throw new TaxonomyPersistenceError('BATCH_TOTAL_CONFLICT', 'Batch total conflicts with an earlier batch of this type.')
    }
    await tx.taxonomySnapshotBatch.create({
      data: {
        sessionId: session.id,
        batchId: request.batch.batchId,
        type: request.batch.kind,
        batchIndex: request.batch.index,
        batchTotal: request.batch.total,
        checksum: request.batch.payloadSha256,
        itemCount: request.batch.items.length,
        payload: request.batch,
      },
    })
    return {
      status: 'accepted', sessionId: session.id, runId: request.runId, operation: 'batch',
      sessionStatus: 'receiving', receivedBatchCount: session._count.batches + 1,
    }
  }, { maxWait: 10_000, timeout: 30_000 })
}

function assertUnique(values: string[], code: string, label: string): void {
  if (new Set(values).size !== values.length) throw new TaxonomyPersistenceError(code, `Snapshot contains duplicate ${label}.`)
}

export function validateTaxonomyHierarchy(data: TaxonomySnapshotData): void {
  assertUnique(data.categories.map(row => row.categoryId), 'DUPLICATE_CATEGORY', 'category IDs')
  assertUnique(data.manufacturers.map(row => row.manufacturerId), 'DUPLICATE_MANUFACTURER', 'manufacturer IDs')
  assertUnique(data.productCategories.map(row => `${row.productId}\u0000${row.categoryId}`), 'DUPLICATE_PRODUCT_CATEGORY', 'product-category mappings')
  assertUnique(data.productManufacturers.map(row => `${row.productId}\u0000${row.manufacturerId}`), 'DUPLICATE_PRODUCT_MANUFACTURER', 'product-manufacturer mappings')

  const parents = new Map(data.categories.map(row => [row.categoryId, row.parentCategoryId]))
  for (const [categoryId, parentId] of parents) {
    if (parentId !== null && !parents.has(parentId)) {
      throw new TaxonomyPersistenceError('MISSING_CATEGORY_PARENT', `Category ${categoryId} references a missing parent.`)
    }
  }
  // Iterative walk: a hostile deep chain must not overflow the stack.
  const state = new Map<string, 'visiting' | 'visited'>()
  for (const start of parents.keys()) {
    const path: string[] = []
    let current: string | null = start
    while (current !== null && state.get(current) !== 'visited') {
      if (state.get(current) === 'visiting') throw new TaxonomyPersistenceError('CATEGORY_CYCLE', 'Category hierarchy contains a cycle.')
      state.set(current, 'visiting')
      path.push(current)
      current = parents.get(current) ?? null
    }
    for (const categoryId of path) state.set(categoryId, 'visited')
  }

  const categoryIds = new Set(parents.keys())
  const manufacturerIds = new Set(data.manufacturers.map(row => row.manufacturerId))
  if (data.productCategories.some(row => !categoryIds.has(row.categoryId))) {
    throw new TaxonomyPersistenceError('MISSING_MAPPING_CATEGORY', 'A product-category mapping references a missing category.')
  }
  if (data.productManufacturers.some(row => !manufacturerIds.has(row.manufacturerId))) {
    throw new TaxonomyPersistenceError('MISSING_MAPPING_MANUFACTURER', 'A product-manufacturer mapping references a missing manufacturer.')
  }
}

// Upserts every row of the verified snapshot and soft-marks rows the snapshot no
// longer contains. Nothing is ever deleted from the mirror.
async function upsertMirror(
  tx: ExtendedTransactionClient,
  sessionId: string,
  data: TaxonomySnapshotData,
): Promise<void> {
  const categories = JSON.stringify(data.categories)
  const manufacturers = JSON.stringify(data.manufacturers)
  const productCategories = JSON.stringify(data.productCategories)
  const productManufacturers = JSON.stringify(data.productManufacturers)
  const present = Prisma.sql`"isPresent" = true, "missingSnapshotCount" = 0, "lastSeenAt" = ${NOW_UTC},
    "lastSeenSnapshotId" = ${sessionId}, "missingSinceAt" = NULL, "missingSinceSnapshotId" = NULL, "updatedAt" = ${NOW_UTC}`

  await tx.$executeRaw`
    INSERT INTO "CatalogSourceCategory" (
      "source", "sourceCategoryId", "parentSourceCategoryId", "names", "slugs", "published",
      "sourceCreatedAt", "sourceUpdatedAt", "firstSeenAt", "lastSeenAt", "lastSeenSnapshotId", "createdAt", "updatedAt"
    )
    SELECT ${SOURCE}, r."categoryId", r."parentCategoryId", r."names", r."slugs", r."published",
      (r."createdOnUtc"::timestamptz AT TIME ZONE 'UTC'), (r."updatedOnUtc"::timestamptz AT TIME ZONE 'UTC'),
      ${NOW_UTC}, ${NOW_UTC}, ${sessionId}, ${NOW_UTC}, ${NOW_UTC}
    FROM jsonb_to_recordset(${categories}::jsonb) AS r(
      "categoryId" text, "parentCategoryId" text, "names" jsonb, "slugs" jsonb, "published" boolean,
      "createdOnUtc" text, "updatedOnUtc" text
    )
    ON CONFLICT ("source", "sourceCategoryId") DO UPDATE SET
      "parentSourceCategoryId" = EXCLUDED."parentSourceCategoryId", "names" = EXCLUDED."names",
      "slugs" = EXCLUDED."slugs", "published" = EXCLUDED."published",
      "sourceCreatedAt" = EXCLUDED."sourceCreatedAt", "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt", ${present}
  `

  await tx.$executeRaw`
    INSERT INTO "CatalogSourceManufacturer" (
      "source", "sourceManufacturerId", "names", "slugs", "published", "sourceCreatedAt", "sourceUpdatedAt",
      "firstSeenAt", "lastSeenAt", "lastSeenSnapshotId", "createdAt", "updatedAt"
    )
    SELECT ${SOURCE}, r."manufacturerId", r."names", r."slugs", r."published",
      (r."createdOnUtc"::timestamptz AT TIME ZONE 'UTC'), (r."updatedOnUtc"::timestamptz AT TIME ZONE 'UTC'),
      ${NOW_UTC}, ${NOW_UTC}, ${sessionId}, ${NOW_UTC}, ${NOW_UTC}
    FROM jsonb_to_recordset(${manufacturers}::jsonb) AS r(
      "manufacturerId" text, "names" jsonb, "slugs" jsonb, "published" boolean,
      "createdOnUtc" text, "updatedOnUtc" text
    )
    ON CONFLICT ("source", "sourceManufacturerId") DO UPDATE SET
      "names" = EXCLUDED."names", "slugs" = EXCLUDED."slugs", "published" = EXCLUDED."published",
      "sourceCreatedAt" = EXCLUDED."sourceCreatedAt", "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt", ${present}
  `

  await tx.$executeRaw`
    INSERT INTO "CatalogSourceProductCategory" (
      "source", "legacyProductId", "sourceCategoryId", "displayOrder", "isFeaturedProduct",
      "firstSeenAt", "lastSeenAt", "lastSeenSnapshotId", "createdAt", "updatedAt"
    )
    SELECT ${SOURCE}, r."productId", r."categoryId", r."displayOrder", r."isFeaturedProduct",
      ${NOW_UTC}, ${NOW_UTC}, ${sessionId}, ${NOW_UTC}, ${NOW_UTC}
    FROM jsonb_to_recordset(${productCategories}::jsonb) AS r(
      "productId" text, "categoryId" text, "displayOrder" integer, "isFeaturedProduct" boolean
    )
    ON CONFLICT ("source", "legacyProductId", "sourceCategoryId") DO UPDATE SET
      "displayOrder" = EXCLUDED."displayOrder", "isFeaturedProduct" = EXCLUDED."isFeaturedProduct", ${present}
  `

  await tx.$executeRaw`
    INSERT INTO "CatalogSourceProductManufacturer" (
      "source", "legacyProductId", "sourceManufacturerId", "displayOrder", "isFeaturedProduct",
      "firstSeenAt", "lastSeenAt", "lastSeenSnapshotId", "createdAt", "updatedAt"
    )
    SELECT ${SOURCE}, r."productId", r."manufacturerId", r."displayOrder", r."isFeaturedProduct",
      ${NOW_UTC}, ${NOW_UTC}, ${sessionId}, ${NOW_UTC}, ${NOW_UTC}
    FROM jsonb_to_recordset(${productManufacturers}::jsonb) AS r(
      "productId" text, "manufacturerId" text, "displayOrder" integer, "isFeaturedProduct" boolean
    )
    ON CONFLICT ("source", "legacyProductId", "sourceManufacturerId") DO UPDATE SET
      "displayOrder" = EXCLUDED."displayOrder", "isFeaturedProduct" = EXCLUDED."isFeaturedProduct", ${present}
  `

  // Rows absent from this snapshot: keep data, count consecutive misses.
  const missing = Prisma.sql`"isPresent" = false, "missingSnapshotCount" = "missingSnapshotCount" + 1,
    "missingSinceAt" = COALESCE("missingSinceAt", ${NOW_UTC}),
    "missingSinceSnapshotId" = COALESCE("missingSinceSnapshotId", ${sessionId}), "updatedAt" = ${NOW_UTC}`
  const notSeen = Prisma.sql`"source" = ${SOURCE} AND "lastSeenSnapshotId" <> ${sessionId}`
  await tx.$executeRaw`UPDATE "CatalogSourceProductCategory" SET ${missing} WHERE ${notSeen}`
  await tx.$executeRaw`UPDATE "CatalogSourceProductManufacturer" SET ${missing} WHERE ${notSeen}`
  await tx.$executeRaw`UPDATE "CatalogSourceCategory" SET ${missing} WHERE ${notSeen}`
  await tx.$executeRaw`UPDATE "CatalogSourceManufacturer" SET ${missing} WHERE ${notSeen}`
}

function reconstructProtocolSession(session: {
  runId: string
  mode: string
  manifest: unknown
  batches: Array<{ payload: unknown }>
}): ProtocolSession {
  const manifest = parsedManifest(session.manifest)
  const batches = new Map<string, TaxonomyBatchRequest['batch']>()
  for (const row of session.batches) {
    const batch = taxonomyBatchRequestSchema.shape.batch.parse(row.payload)
    batches.set(batch.batchId, batch)
  }
  return { runId: session.runId, mode: z.enum(['dry-run', 'apply']).parse(session.mode), manifest, batches }
}

async function recordFinalizeFailure(db: ExtendedPrismaClient, error: TaxonomyPersistenceError): Promise<void> {
  if (!error.sessionId) return
  const now = new Date()
  const terminal = TERMINAL_FINALIZE_CODES.has(error.code)
  // Only a still-receiving session is touched: a concurrent finalize that has
  // meanwhile completed the session must not be overwritten.
  await db.taxonomySnapshotSession.updateMany({
    where: { id: error.sessionId, status: 'receiving' },
    data: {
      lastErrorCode: error.code,
      lastErrorAt: now,
      errorCount: { increment: 1 },
      ...(terminal ? { status: 'rejected', rejectedAt: now } : {}),
    },
  })
}

export async function persistTaxonomyFinalize(
  input: unknown,
  db: ExtendedPrismaClient = prisma,
): Promise<TaxonomyOperationResult> {
  const request = taxonomyFinalizeRequestSchema.parse(input)
  assertManifestLimits(request.manifest)
  try {
    return await db.$transaction(async tx => {
      await lockTaxonomySource(tx)
      await lockRun(tx, request.runId)
      const session = await tx.taxonomySnapshotSession.findUnique({
        where: { source_runId: { source: SOURCE, runId: request.runId } },
        include: { batches: { orderBy: [{ type: 'asc' }, { batchIndex: 'asc' }] } },
      })
      if (!session) throw new TaxonomyPersistenceError('SESSION_NOT_FOUND', 'Begin must be accepted before finalize.')
      const manifest = parsedManifest(session.manifest)
      assertSessionMatches(session, request, request.manifest.snapshotSha256)
      if (!jsonEqual(manifest, request.manifest)) {
        throw new TaxonomyPersistenceError('MANIFEST_MISMATCH', 'Finalize manifest differs from begin manifest.')
      }
      assertSessionOpenForRetry(session)
      const counts = {
        categories: manifest.categories,
        manufacturers: manifest.manufacturers,
        productCategoryMappings: manifest.productCategoryMappings,
        productManufacturerMappings: manifest.productManufacturerMappings,
      }
      if (session.status === 'completed') {
        return {
          status: 'duplicate', sessionId: session.id, runId: request.runId, operation: 'finalize',
          sessionStatus: 'completed', receivedBatchCount: session.batches.length,
          mirrorApplied: session.appliedAt !== null, counts,
        }
      }

      let data: TaxonomySnapshotData
      try {
        data = finalizeTaxonomySnapshot(reconstructProtocolSession(session), request).data
        validateTaxonomyHierarchy(data)
        if (request.mode === 'apply') {
          const newer = await tx.taxonomySnapshotSession.findFirst({
            where: { source: SOURCE, appliedAt: { not: null }, generatedAtUtc: { gt: session.generatedAtUtc } },
            select: { id: true },
          })
          if (newer) {
            throw new TaxonomyPersistenceError('STALE_SNAPSHOT', 'A newer source snapshot is already active.')
          }
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          throw new TaxonomyPersistenceError(String((error as { code: unknown }).code), error.message, session.id)
        }
        throw error
      }

      const now = new Date()
      if (request.mode === 'apply') await upsertMirror(tx, session.id, data)
      await tx.taxonomySnapshotSession.update({
        where: { id: session.id },
        data: { status: 'completed', finalizedAt: now, appliedAt: request.mode === 'apply' ? now : null },
      })
      return {
        status: 'completed', sessionId: session.id, runId: request.runId, operation: 'finalize',
        sessionStatus: 'completed', receivedBatchCount: session.batches.length,
        mirrorApplied: request.mode === 'apply', counts,
      }
    }, { maxWait: 30_000, timeout: 180_000 })
  } catch (error) {
    if (error instanceof TaxonomyPersistenceError) await recordFinalizeFailure(db, error)
    throw error
  }
}

export async function persistTaxonomyOperation(input: unknown): Promise<TaxonomyOperationResult> {
  const operation = z.object({ operation: z.enum(['begin', 'batch', 'finalize']) }).passthrough().parse(input).operation
  if (operation === 'begin') return persistTaxonomyBegin(input)
  if (operation === 'batch') return persistTaxonomyBatch(input)
  return persistTaxonomyFinalize(input)
}

// Expires abandoned receiving sessions and drops staged payloads of closed
// sessions older than the retention window. Session rows and the mirror stay.
export async function pruneTaxonomyStaging(
  db: ExtendedPrismaClient = prisma,
  now: Date = new Date(),
): Promise<{ expiredSessions: number; deletedBatches: number }> {
  const cutoff = new Date(now.getTime() - TAXONOMY_STAGING_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  return db.$transaction(async tx => {
    await lockTaxonomySource(tx)
    const expired = await tx.taxonomySnapshotSession.updateMany({
      where: { source: SOURCE, status: 'receiving', createdAt: { lt: cutoff } },
      data: { status: 'expired', lastErrorCode: 'SESSION_EXPIRED', lastErrorAt: now },
    })
    const deleted = await tx.taxonomySnapshotBatch.deleteMany({
      where: { session: { source: SOURCE, status: { in: ['completed', 'rejected', 'expired'] }, createdAt: { lt: cutoff } } },
    })
    return { expiredSessions: expired.count, deletedBatches: deleted.count }
  }, { maxWait: 30_000, timeout: 60_000 })
}

export { TAXONOMY_BATCH_KINDS }
