import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('server-only', () => ({}))

import { endpointFromDatabaseUrl, massChangeGuard, planHash, requestStorefrontRevalidation, verifyDatabaseIdentity } from './brand-line-release'
import type { BrandLinePlan } from './brand-line-plan'

const expected = { projectId: 'proj-1', branchId: 'br-test', endpointId: 'ep-test-123' }

function plan(overrides: Partial<BrandLinePlan['links']> = {}): BrandLinePlan {
  return {
    brandsRootCategoryIds: ['1'],
    manufacturerMappings: [{ sourceManufacturerId: '5', brandKey: 'acme', origin: 'exact_name' }, { sourceManufacturerId: '6', brandKey: 'beta', origin: 'alias' }],
    categoryMappings: [],
    lines: [],
    links: { create: [{ productId: '1', lineKey: 'acme/a', sourceCategoryId: '9' }, { productId: '2', lineKey: 'acme/a', sourceCategoryId: '9' }], refresh: [], markMissing: [], suppressedByAdmin: [], ...overrides },
    linesByKey: {},
    newSeries: [],
    genericCategories: { names: 0, categories: 0 },
    reviews: [{ reason: 'unknown_root_line', subjectKey: '7', details: {} }],
    stats: { skippedDeletedProducts: 0, missingProducts: 0, multiBranchProducts: 0, ancestorLinksAvoided: 0 },
  }
}

describe('BrandLine release safety', () => {
  it('reads the Neon endpoint from direct and pooled connection strings and rejects anything else', () => {
    expect(endpointFromDatabaseUrl('postgresql://u:p@ep-test-123.eu-central-1.aws.neon.tech/db')).toBe('ep-test-123')
    expect(endpointFromDatabaseUrl('postgresql://u:p@ep-test-123-pooler.eu-central-1.aws.neon.tech/db')).toBe('ep-test-123')
    expect(() => endpointFromDatabaseUrl('postgresql://u:p@localhost:5432/db')).toThrowError(expect.objectContaining({ code: 'NOT_A_NEON_ENDPOINT' }))
    expect(() => endpointFromDatabaseUrl('not a url')).toThrowError(expect.objectContaining({ code: 'INVALID_DATABASE_URL' }))
  })

  it('requires both the connection string and the Neon API to confirm the named database', async () => {
    const url = 'postgresql://u:p@ep-test-123-pooler.example.neon.tech/db'
    const lookup = vi.fn(async () => ({ projectId: 'proj-1', branchId: 'br-test' }))
    await expect(verifyDatabaseIdentity(url, expected, lookup)).resolves.toEqual(expected)
    await expect(verifyDatabaseIdentity(url, { ...expected, endpointId: 'ep-prod' }, lookup)).rejects.toMatchObject({ code: 'ENDPOINT_MISMATCH' })
    await expect(verifyDatabaseIdentity(url, expected, async () => ({ projectId: 'proj-1', branchId: 'br-production' }))).rejects.toMatchObject({ code: 'BRANCH_MISMATCH' })
    await expect(verifyDatabaseIdentity(url, expected, async () => ({ projectId: 'proj-other', branchId: 'br-test' }))).rejects.toMatchObject({ code: 'BRANCH_MISMATCH' })
  })

  it('fingerprints the plan independently of row order and changes with any planned write', () => {
    const base = plan()
    const shuffled = { ...base, manufacturerMappings: [...base.manufacturerMappings].reverse(), links: { ...base.links, create: [...base.links.create].reverse() } }
    expect(planHash('s1', shuffled)).toBe(planHash('s1', base))
    expect(planHash('s2', base)).not.toBe(planHash('s1', base))
    expect(planHash('s1', plan({ markMissing: [{ productId: '3', brandLineId: 'l1' }] }))).not.toBe(planHash('s1', base))
    expect(planHash('s1', { ...base, reviews: [] })).not.toBe(planHash('s1', base))
  })

  it('flags plans that would mark many links missing', () => {
    const many = plan({ markMissing: Array.from({ length: 6 }, (_, index) => ({ productId: String(index), brandLineId: 'l1' })) })
    expect(massChangeGuard(many, 100)).toMatchObject({ markMissing: 6, markMissingLimit: 5, exceeded: true })
    expect(massChangeGuard(many, 1000)).toMatchObject({ markMissingLimit: 20, exceeded: false })
    expect(massChangeGuard(plan(), 0)).toMatchObject({ markMissing: 0, exceeded: false })
  })
})

describe('storefront revalidation after a committed bootstrap', () => {
  const base = { baseUrl: 'https://shop.example', secret: 's'.repeat(40), snapshotId: 'snap-1', planSha256: 'a'.repeat(64), delayMs: 1 }
  const reply = (status: number) => new Response('{}', { status })

  it('succeeds on the first answer and sends the audited bootstrap identity', async () => {
    const fetchImpl = vi.fn(async () => reply(200))
    expect(await requestStorefrontRevalidation({ ...base, fetchImpl })).toEqual({ ok: true, status: 200, attempts: 1 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://shop.example/api/internal/hairshop-catalog-sync/storefront-revalidate')
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'brand_line_bootstrap', snapshotId: 'snap-1', planSha256: 'a'.repeat(64) })
  })

  it('retries network errors and 5xx answers, then reports the last status', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(reply(502)).mockResolvedValueOnce(reply(200))
    expect(await requestStorefrontRevalidation({ ...base, fetchImpl: flaky })).toEqual({ ok: true, status: 200, attempts: 3 })
    const down = vi.fn(async () => reply(503))
    expect(await requestStorefrontRevalidation({ ...base, fetchImpl: down, attempts: 3 })).toEqual({ ok: false, status: 503, attempts: 3 })
    const offline = vi.fn(async () => { throw new Error('ENOTFOUND') })
    expect(await requestStorefrontRevalidation({ ...base, fetchImpl: offline, attempts: 2 })).toEqual({ ok: false, status: null, attempts: 2 })
  })

  it('does not retry a refusal (wrong key or unknown bootstrap)', async () => {
    for (const status of [401, 404]) {
      const fetchImpl = vi.fn(async () => reply(status))
      expect(await requestStorefrontRevalidation({ ...base, fetchImpl })).toEqual({ ok: false, status, attempts: 1 })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })
})
