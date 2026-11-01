import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'
import {
  TaxonomyPersistenceError,
  persistTaxonomyOperation,
  pruneTaxonomyStaging,
} from '@/lib/sync/hairshop-taxonomy-persistence'
import { hairshopTaxonomySyncV2RequestSchema } from '@/lib/sync/hairshop-taxonomy-sync'

export const runtime = 'nodejs'

const MAX_REQUEST_BYTES = 4 * 1024 * 1024

function isAuthorized(request: NextRequest): boolean {
  const configured = process.env.HAIRSHOP_CATALOG_SYNC_SECRET ?? ''
  const supplied = request.headers.get('x-hairshop-catalog-sync-key') ?? ''
  if (configured.length < 32 || supplied.length < 32) return false
  const expected = Buffer.from(configured)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
    throw new TaxonomyPersistenceError('REQUEST_TOO_LARGE', 'Request body exceeds the taxonomy batch limit.')
  }
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > MAX_REQUEST_BYTES) {
    throw new TaxonomyPersistenceError('REQUEST_TOO_LARGE', 'Request body exceeds the taxonomy batch limit.')
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new TaxonomyPersistenceError('INVALID_JSON', 'Request body is not valid JSON.')
  }
}

function errorStatus(code: string): number {
  if (code === 'REQUEST_TOO_LARGE') return 413
  if (code === 'INVALID_JSON') return 400
  if (code === 'SESSION_NOT_FOUND') return 404
  if (code.includes('CONFLICT') || code.includes('MISMATCH')) return 409
  if (code === 'SESSION_FINALIZED' || code === 'SESSION_CLOSED' || code === 'STALE_SNAPSHOT') return 409
  return 422
}

// Only a syntactically valid runId is echoed into logs; the payload never is.
function loggableRunId(raw: unknown): string | undefined {
  const runId = (raw as { runId?: unknown } | null)?.runId
  return typeof runId === 'string' && /^[a-zA-Z0-9._:-]{8,128}$/u.test(runId) ? runId : undefined
}

async function pruneAfterFinalize(correlationId: string): Promise<void> {
  try {
    const pruned = await pruneTaxonomyStaging()
    if (pruned.expiredSessions > 0 || pruned.deletedBatches > 0) {
      logOperationalEvent({ event: 'hairshop_taxonomy_sync_v2_pruned', correlationId, ...pruned })
    }
  } catch (error) {
    // Pruning is housekeeping; the finalized snapshot is already committed.
    logOperationalEvent({ event: 'hairshop_taxonomy_sync_v2_prune_failed', level: 'warn', correlationId }, error)
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId = getCorrelationId(request)
  if (!process.env.HAIRSHOP_CATALOG_SYNC_SECRET) {
    return NextResponse.json({ error: 'catalog_sync_not_configured', correlationId }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized', correlationId }, { status: 401 })
  }
  if (process.env.HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'taxonomy_sync_write_disabled', correlationId }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await readBoundedJson(request)
    raw = hairshopTaxonomySyncV2RequestSchema.parse(raw)
    const result = await persistTaxonomyOperation(raw)
    logOperationalEvent({
      event: 'hairshop_taxonomy_sync_v2',
      correlationId,
      runId: result.runId,
      operation: result.operation,
      status: result.status,
      receivedBatchCount: result.receivedBatchCount,
      mirrorApplied: result.mirrorApplied,
      counts: result.counts,
    })
    if (result.operation === 'finalize' && result.status === 'completed') await pruneAfterFinalize(correlationId)
    return NextResponse.json({ schemaVersion: 2, correlationId, ...result })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_request', correlationId, issues: error.flatten() }, { status: 400 })
    }
    if (error instanceof TaxonomyPersistenceError) {
      logOperationalEvent({
        event: 'hairshop_taxonomy_sync_v2_rejected',
        level: 'warn',
        correlationId,
        runId: loggableRunId(raw),
        code: error.code,
      })
      return NextResponse.json({ error: error.code.toLowerCase(), correlationId }, { status: errorStatus(error.code) })
    }
    logOperationalEvent({ event: 'hairshop_taxonomy_sync_v2_failed', level: 'error', correlationId, runId: loggableRunId(raw) }, error)
    return NextResponse.json({ error: 'internal_error', correlationId }, { status: 500 })
  }
}
