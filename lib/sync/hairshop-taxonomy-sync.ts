import { createHash } from 'node:crypto'
import { z } from 'zod'

const sourceIdSchema = z.string().regex(/^\d+$/u).max(32)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const runIdSchema = z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/u)
const utcDateSchema = z.string().datetime({ offset: true })

const localizedValueSchema = z.object({
  default: z.string().max(2_000),
  ru: z.string().max(2_000).optional(),
  lv: z.string().max(2_000).optional(),
  en: z.string().max(2_000).optional(),
}).strict()

const localizedSlugSchema = z.object({
  default: z.string().max(1_000).optional(),
  ru: z.string().max(1_000).optional(),
  lv: z.string().max(1_000).optional(),
  en: z.string().max(1_000).optional(),
}).strict()

export const taxonomyCategorySchema = z.object({
  categoryId: sourceIdSchema,
  parentCategoryId: sourceIdSchema.nullable(),
  names: localizedValueSchema,
  slugs: localizedSlugSchema,
  published: z.boolean(),
  createdOnUtc: utcDateSchema,
  updatedOnUtc: utcDateSchema,
}).strict()

export const taxonomyManufacturerSchema = z.object({
  manufacturerId: sourceIdSchema,
  names: localizedValueSchema,
  slugs: localizedSlugSchema,
  published: z.boolean(),
  createdOnUtc: utcDateSchema,
  updatedOnUtc: utcDateSchema,
}).strict()

export const taxonomyProductCategorySchema = z.object({
  productId: sourceIdSchema,
  categoryId: sourceIdSchema,
  displayOrder: z.number().int(),
  isFeaturedProduct: z.boolean(),
}).strict()

export const taxonomyProductManufacturerSchema = z.object({
  productId: sourceIdSchema,
  manufacturerId: sourceIdSchema,
  displayOrder: z.number().int(),
  isFeaturedProduct: z.boolean(),
}).strict()

export const taxonomySnapshotDataSchema = z.object({
  categories: z.array(taxonomyCategorySchema),
  manufacturers: z.array(taxonomyManufacturerSchema),
  productCategories: z.array(taxonomyProductCategorySchema),
  productManufacturers: z.array(taxonomyProductManufacturerSchema),
}).strict()

export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>
export type TaxonomyManufacturer = z.infer<typeof taxonomyManufacturerSchema>
export type TaxonomyProductCategory = z.infer<typeof taxonomyProductCategorySchema>
export type TaxonomyProductManufacturer = z.infer<typeof taxonomyProductManufacturerSchema>
export type TaxonomySnapshotData = z.infer<typeof taxonomySnapshotDataSchema>

export const taxonomyManifestSchema = z.object({
  source: z.literal('nop390'),
  generatedAtUtc: utcDateSchema,
  categories: z.number().int().nonnegative(),
  manufacturers: z.number().int().nonnegative(),
  productCategoryMappings: z.number().int().nonnegative(),
  productManufacturerMappings: z.number().int().nonnegative(),
  expectedBatchCount: z.number().int().nonnegative(),
  snapshotSha256: sha256Schema,
}).strict()

export type TaxonomyManifest = z.infer<typeof taxonomyManifestSchema>
export const TAXONOMY_BATCH_KINDS = ['categories', 'manufacturers', 'productCategories', 'productManufacturers'] as const
export type TaxonomyBatchKind = (typeof TAXONOMY_BATCH_KINDS)[number]

const requestBase = {
  schemaVersion: z.literal(2),
  runId: runIdSchema,
  mode: z.enum(['dry-run', 'apply']),
}

export const taxonomyBeginRequestSchema = z.object({
  ...requestBase,
  operation: z.literal('begin'),
  manifest: taxonomyManifestSchema,
}).strict()

const taxonomyBatchSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('categories'), batchId: z.string().min(1).max(200), index: z.number().int().nonnegative(), total: z.number().int().positive(), payloadSha256: sha256Schema, items: z.array(taxonomyCategorySchema).min(1) }).strict(),
  z.object({ kind: z.literal('manufacturers'), batchId: z.string().min(1).max(200), index: z.number().int().nonnegative(), total: z.number().int().positive(), payloadSha256: sha256Schema, items: z.array(taxonomyManufacturerSchema).min(1) }).strict(),
  z.object({ kind: z.literal('productCategories'), batchId: z.string().min(1).max(200), index: z.number().int().nonnegative(), total: z.number().int().positive(), payloadSha256: sha256Schema, items: z.array(taxonomyProductCategorySchema).min(1) }).strict(),
  z.object({ kind: z.literal('productManufacturers'), batchId: z.string().min(1).max(200), index: z.number().int().nonnegative(), total: z.number().int().positive(), payloadSha256: sha256Schema, items: z.array(taxonomyProductManufacturerSchema).min(1) }).strict(),
])

export const taxonomyBatchRequestSchema = z.object({
  ...requestBase,
  operation: z.literal('batch'),
  snapshotSha256: sha256Schema,
  batch: taxonomyBatchSchema,
}).strict()

export const taxonomyFinalizeRequestSchema = z.object({
  ...requestBase,
  operation: z.literal('finalize'),
  manifest: taxonomyManifestSchema,
}).strict()

export const hairshopTaxonomySyncV2RequestSchema = z.discriminatedUnion('operation', [
  taxonomyBeginRequestSchema,
  taxonomyBatchRequestSchema,
  taxonomyFinalizeRequestSchema,
])

export type TaxonomyBeginRequest = z.infer<typeof taxonomyBeginRequestSchema>
export type TaxonomyBatchRequest = z.infer<typeof taxonomyBatchRequestSchema>
export type TaxonomyFinalizeRequest = z.infer<typeof taxonomyFinalizeRequestSchema>
export type HairshopTaxonomySyncV2Request = z.infer<typeof hairshopTaxonomySyncV2RequestSchema>

function compareSourceIds(left: string, right: string): number {
  const a = BigInt(left)
  const b = BigInt(right)
  return a < b ? -1 : a > b ? 1 : 0
}

export function canonicalizeTaxonomySnapshot(input: TaxonomySnapshotData): TaxonomySnapshotData {
  const parsed = taxonomySnapshotDataSchema.parse(input)
  return {
    categories: [...parsed.categories].sort((a, b) => compareSourceIds(a.categoryId, b.categoryId)),
    manufacturers: [...parsed.manufacturers].sort((a, b) => compareSourceIds(a.manufacturerId, b.manufacturerId)),
    productCategories: [...parsed.productCategories].sort((a, b) => compareSourceIds(a.productId, b.productId)
      || compareSourceIds(a.categoryId, b.categoryId)
      || a.displayOrder - b.displayOrder),
    productManufacturers: [...parsed.productManufacturers].sort((a, b) => compareSourceIds(a.productId, b.productId)
      || compareSourceIds(a.manufacturerId, b.manufacturerId)
      || a.displayOrder - b.displayOrder),
  }
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

export function taxonomySnapshotSha256(data: TaxonomySnapshotData): string {
  return sha256Json(canonicalizeTaxonomySnapshot(data))
}

function canonicalBatchPayload(batch: TaxonomyBatchRequest['batch']): { kind: TaxonomyBatchKind; items: unknown[] } {
  const data: TaxonomySnapshotData = { categories: [], manufacturers: [], productCategories: [], productManufacturers: [] }
  if (batch.kind === 'categories') data.categories = batch.items
  else if (batch.kind === 'manufacturers') data.manufacturers = batch.items
  else if (batch.kind === 'productCategories') data.productCategories = batch.items
  else data.productManufacturers = batch.items
  return { kind: batch.kind, items: canonicalizeTaxonomySnapshot(data)[batch.kind] }
}

export function taxonomyBatchSha256(batch: TaxonomyBatchRequest['batch']): string {
  return sha256Json(canonicalBatchPayload(batch))
}

export type TaxonomySnapshotSession = {
  runId: string
  mode: 'dry-run' | 'apply'
  manifest: TaxonomyManifest
  batches: Map<string, TaxonomyBatchRequest['batch']>
}

export class TaxonomySnapshotProtocolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'TaxonomySnapshotProtocolError'
  }
}

export function beginTaxonomySnapshot(input: unknown): TaxonomySnapshotSession {
  const request = taxonomyBeginRequestSchema.parse(input)
  return { runId: request.runId, mode: request.mode, manifest: request.manifest, batches: new Map() }
}

function assertSessionRequest(session: TaxonomySnapshotSession, request: { runId: string; mode: string }): void {
  if (request.runId !== session.runId) throw new TaxonomySnapshotProtocolError('RUN_ID_MISMATCH', 'Request runId does not match the open snapshot.')
  if (request.mode !== session.mode) throw new TaxonomySnapshotProtocolError('MODE_MISMATCH', 'Request mode does not match the open snapshot.')
}

export function acceptTaxonomyBatch(
  session: TaxonomySnapshotSession,
  input: unknown,
): { status: 'accepted' | 'duplicate'; session: TaxonomySnapshotSession } {
  const request = taxonomyBatchRequestSchema.parse(input)
  assertSessionRequest(session, request)
  if (request.snapshotSha256 !== session.manifest.snapshotSha256) {
    throw new TaxonomySnapshotProtocolError('SNAPSHOT_HASH_MISMATCH', 'Batch references a different snapshot hash.')
  }
  if (request.batch.index >= request.batch.total) {
    throw new TaxonomySnapshotProtocolError('INVALID_BATCH_INDEX', 'Batch index must be smaller than batch total.')
  }
  if (taxonomyBatchSha256(request.batch) !== request.batch.payloadSha256) {
    throw new TaxonomySnapshotProtocolError('BATCH_HASH_MISMATCH', 'Batch payload checksum does not match its contents.')
  }
  const expectedId = `${request.batch.kind}:${request.batch.index}`
  if (request.batch.batchId !== expectedId) {
    throw new TaxonomySnapshotProtocolError('INVALID_BATCH_ID', `Expected deterministic batchId ${expectedId}.`)
  }
  const current = session.batches.get(request.batch.batchId)
  if (current) {
    if (current.payloadSha256 !== request.batch.payloadSha256 || current.total !== request.batch.total || current.kind !== request.batch.kind) {
      throw new TaxonomySnapshotProtocolError('BATCH_CONFLICT', 'The same batchId was already accepted with different contents.')
    }
    return { status: 'duplicate', session }
  }
  const next = new Map(session.batches)
  next.set(request.batch.batchId, request.batch)
  return { status: 'accepted', session: { ...session, batches: next } }
}

function sameManifest(left: TaxonomyManifest, right: TaxonomyManifest): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assembledData(session: TaxonomySnapshotSession): TaxonomySnapshotData {
  const data: TaxonomySnapshotData = { categories: [], manufacturers: [], productCategories: [], productManufacturers: [] }
  for (const batch of session.batches.values()) {
    if (batch.kind === 'categories') data.categories.push(...batch.items)
    else if (batch.kind === 'manufacturers') data.manufacturers.push(...batch.items)
    else if (batch.kind === 'productCategories') data.productCategories.push(...batch.items)
    else data.productManufacturers.push(...batch.items)
  }
  return canonicalizeTaxonomySnapshot(data)
}

function assertCompleteBatchIndexes(session: TaxonomySnapshotSession): void {
  for (const kind of TAXONOMY_BATCH_KINDS) {
    const batches = [...session.batches.values()].filter(batch => batch.kind === kind)
    if (batches.length === 0) continue
    const totals = new Set(batches.map(batch => batch.total))
    if (totals.size !== 1) throw new TaxonomySnapshotProtocolError('BATCH_TOTAL_CONFLICT', `Conflicting totals for ${kind}.`)
    const total = batches[0].total
    if (batches.length !== total || batches.some((batch, index) => batch.index !== index)) {
      const indexes = new Set(batches.map(batch => batch.index))
      if (indexes.size !== total || [...Array(total).keys()].some(index => !indexes.has(index))) {
        throw new TaxonomySnapshotProtocolError('SNAPSHOT_INCOMPLETE', `Missing ${kind} batch.`)
      }
    }
  }
}

export function finalizeTaxonomySnapshot(
  session: TaxonomySnapshotSession,
  input: unknown,
): { manifest: TaxonomyManifest; data: TaxonomySnapshotData } {
  const request = taxonomyFinalizeRequestSchema.parse(input)
  assertSessionRequest(session, request)
  if (!sameManifest(request.manifest, session.manifest)) {
    throw new TaxonomySnapshotProtocolError('MANIFEST_MISMATCH', 'Finalize manifest differs from begin manifest.')
  }
  if (session.batches.size !== session.manifest.expectedBatchCount) {
    throw new TaxonomySnapshotProtocolError('SNAPSHOT_INCOMPLETE', 'Not all expected batches were received.')
  }
  assertCompleteBatchIndexes(session)
  const data = assembledData(session)
  const counts = {
    categories: data.categories.length,
    manufacturers: data.manufacturers.length,
    productCategoryMappings: data.productCategories.length,
    productManufacturerMappings: data.productManufacturers.length,
  }
  for (const [name, count] of Object.entries(counts)) {
    if (count !== session.manifest[name as keyof typeof counts]) {
      throw new TaxonomySnapshotProtocolError('MANIFEST_COUNT_MISMATCH', `${name} count does not match the manifest.`)
    }
  }
  if (taxonomySnapshotSha256(data) !== session.manifest.snapshotSha256) {
    throw new TaxonomySnapshotProtocolError('SNAPSHOT_HASH_MISMATCH', 'Assembled snapshot checksum does not match the manifest.')
  }
  return { manifest: session.manifest, data }
}
