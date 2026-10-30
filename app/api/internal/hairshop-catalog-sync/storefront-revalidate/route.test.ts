import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { revalidateTag, auditCount, appendServerAudit } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  auditCount: vi.fn(),
  appendServerAudit: vi.fn(async () => undefined),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { count: auditCount }, $transaction: async (run: (tx: unknown) => unknown) => run({}) },
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit }))
vi.mock('@/lib/observability', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/observability')>()), logOperationalEvent: vi.fn() }))

import { POST } from './route'

const SECRET = 'k'.repeat(48)
const body = { reason: 'brand_line_bootstrap', snapshotId: 'snap_1', planSha256: 'a'.repeat(64) }
const call = (payload: unknown, key: string | null = SECRET) => POST(new NextRequest('http://localhost/api/internal/hairshop-catalog-sync/storefront-revalidate', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key ? { 'x-hairshop-catalog-sync-key': key } : {}) },
  body: JSON.stringify(payload),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HAIRSHOP_CATALOG_SYNC_SECRET = SECRET
  auditCount.mockResolvedValue(1)
})

describe('POST /api/internal/hairshop-catalog-sync/storefront-revalidate', () => {
  it('refuses missing or wrong keys and malformed bodies without touching caches', async () => {
    expect((await call(body, null)).status).toBe(401)
    expect((await call(body, 'x'.repeat(48))).status).toBe(401)
    expect((await call({ reason: 'other' })).status).toBe(400)
    expect((await call({ ...body, planSha256: 'nothex' })).status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(auditCount).not.toHaveBeenCalled()
  })

  it('refuses a bootstrap that was never applied (no audit row for the plan)', async () => {
    auditCount.mockResolvedValue(0)
    expect((await call(body)).status).toBe(404)
    expect(auditCount).toHaveBeenCalledWith({ where: { action: 'catalog.brand_line_bootstrap_applied', entityId: 'snap_1', requestId: 'a'.repeat(64) } })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('revalidates sale and bestseller caches and audits each call; repeating is safe', async () => {
    for (let run = 1; run <= 2; run++) {
      const response = await call(body)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ revalidated: ['storefront-sale-products', 'storefront-bestsellers'] })
    }
    expect(revalidateTag).toHaveBeenCalledTimes(4)
    expect(appendServerAudit).toHaveBeenCalledTimes(2)
    expect((appendServerAudit.mock.calls[0] as unknown[])[3]).toMatchObject({ action: 'storefront.cache_revalidated', entityId: 'brand-line-bootstrap' })
  })

  it('is unavailable when the catalog sync key is not configured', async () => {
    delete process.env.HAIRSHOP_CATALOG_SYNC_SECRET
    expect((await call(body)).status).toBe(503)
  })
})
