import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { persistTaxonomyOperation, pruneTaxonomyStaging } = vi.hoisted(() => ({
  persistTaxonomyOperation: vi.fn(),
  pruneTaxonomyStaging: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/sync/hairshop-taxonomy-persistence', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/sync/hairshop-taxonomy-persistence')>()
  return { ...actual, persistTaxonomyOperation, pruneTaxonomyStaging }
})
vi.mock('@/lib/observability', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/observability')>()
  return { ...actual, logOperationalEvent: vi.fn() }
})

import { POST } from './route'

const SECRET = 'x'.repeat(40)
const payload = {
  schemaVersion: 2,
  runId: 'taxonomy-route-test-0001',
  mode: 'apply',
  operation: 'begin',
  manifest: {
    source: 'nop390', generatedAtUtc: '2026-10-30T15:00:00.000Z', categories: 1, manufacturers: 1,
    productCategoryMappings: 1, productManufacturerMappings: 1, expectedBatchCount: 4,
    snapshotSha256: 'a'.repeat(64),
  },
} as const

function request(body: unknown, key = SECRET, contentLength?: number): NextRequest {
  return new NextRequest('http://localhost/api/internal/hairshop-catalog-sync/taxonomy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hairshop-catalog-sync-key': key,
      ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) }),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HAIRSHOP_CATALOG_SYNC_SECRET = SECRET
  process.env.HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED = 'true'
  persistTaxonomyOperation.mockResolvedValue({
    status: 'accepted', sessionId: 'session-1', runId: payload.runId, operation: 'begin',
    sessionStatus: 'receiving', receivedBatchCount: 0,
  })
  pruneTaxonomyStaging.mockResolvedValue({ expiredSessions: 0, deletedBatches: 0 })
})

describe('POST /api/internal/hairshop-catalog-sync/taxonomy', () => {
  it('reuses catalog-sync authentication and rejects before database access', async () => {
    const response = await POST(request(payload, 'wrong-secret'.padEnd(40, 'x')))
    expect(response.status).toBe(401)
    expect(persistTaxonomyOperation).not.toHaveBeenCalled()
  })

  it('has an independent write gate because even begin persists state', async () => {
    delete process.env.HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED
    const response = await POST(request(payload))
    expect(response.status).toBe(403)
    expect(persistTaxonomyOperation).not.toHaveBeenCalled()
  })

  it('rejects an oversized request before parsing or persistence', async () => {
    const response = await POST(request(payload, SECRET, 4 * 1024 * 1024 + 1))
    expect(response.status).toBe(413)
    expect(persistTaxonomyOperation).not.toHaveBeenCalled()
  })

  it('validates the v2 contract and persists an accepted operation', async () => {
    const response = await POST(request(payload))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json).toMatchObject({ schemaVersion: 2, status: 'accepted', operation: 'begin', runId: payload.runId })
    expect(persistTaxonomyOperation).toHaveBeenCalledWith(payload)
  })

  it('returns a bounded validation response without echoing source payload', async () => {
    const response = await POST(request({ ...payload, manifest: { ...payload.manifest, categories: -1 } }))
    const json = await response.json()
    expect(response.status).toBe(400)
    expect(json.error).toBe('invalid_request')
    expect(JSON.stringify(json)).not.toContain('x-hairshop-catalog-sync-key')
    expect(persistTaxonomyOperation).not.toHaveBeenCalled()
  })

  it('prunes staging only after a completed finalize and survives a prune failure', async () => {
    await POST(request(payload))
    expect(pruneTaxonomyStaging).not.toHaveBeenCalled()

    persistTaxonomyOperation.mockResolvedValue({
      status: 'completed', sessionId: 'session-1', runId: payload.runId, operation: 'finalize',
      sessionStatus: 'completed', receivedBatchCount: 4, mirrorApplied: true,
    })
    pruneTaxonomyStaging.mockRejectedValue(new Error('prune unavailable'))
    const response = await POST(request({ ...payload, operation: 'finalize' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'completed', mirrorApplied: true })
    expect(pruneTaxonomyStaging).toHaveBeenCalledTimes(1)
  })

  it('maps persistence rejections to stable status codes', async () => {
    const { TaxonomyPersistenceError } = await import('@/lib/sync/hairshop-taxonomy-persistence')
    for (const [code, status] of [
      ['SESSION_NOT_FOUND', 404], ['BATCH_CONFLICT', 409], ['STALE_SNAPSHOT', 409],
      ['SESSION_CLOSED', 409], ['SNAPSHOT_INCOMPLETE', 422], ['CATEGORY_CYCLE', 422],
    ] as const) {
      persistTaxonomyOperation.mockRejectedValueOnce(new TaxonomyPersistenceError(code, 'rejected'))
      const response = await POST(request(payload))
      expect(response.status).toBe(status)
      expect((await response.json()).error).toBe(code.toLowerCase())
    }
  })
})
