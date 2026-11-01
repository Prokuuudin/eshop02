import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { findMany, create, executeRaw, transaction } = vi.hoisted(() => {
  const findMany = vi.fn()
  const create = vi.fn()
  const executeRaw = vi.fn()
  // The transaction client deliberately has no $queryRaw: the lock must be taken
  // with $executeRaw because pg_advisory_xact_lock returns void (P2010 on Neon).
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
    product: { findMany, create },
    $executeRaw: executeRaw,
  }))
  return { findMany, create, executeRaw, transaction }
})

vi.mock('@/lib/prisma', () => ({
  prisma: { product: { findMany, create }, $transaction: transaction },
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { POST } from './route'

const SECRET = 'x'.repeat(40)
const body = (mode: 'dry-run' | 'apply' = 'dry-run') => ({
  schemaVersion: 1,
  runId: 'test-run-12345678',
  mode,
  products: [{
    legacyProductId: 9001,
    sku: 'NEW-9001',
    ean: '4750000009001',
    published: true,
    titles: { ru: 'Название', lv: 'Nosaukums', en: 'Name' },
    descriptions: { ru: 'Описание' },
    categoryNames: ['Šampūni'],
    manufacturerName: 'Brand',
    images: ['https://hairshop.lv/content/images/thumbs/0000123_product.jpeg'],
    createdOnUtc: '2026-10-28T10:00:00.000Z',
    updatedOnUtc: '2026-10-28T11:00:00.000Z',
  }],
})

function request(payload: unknown, key = SECRET): NextRequest {
  return new NextRequest('http://localhost/api/internal/hairshop-catalog-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hairshop-catalog-sync-key': key },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HAIRSHOP_CATALOG_SYNC_SECRET = SECRET
  delete process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED
  findMany.mockResolvedValue([])
  create.mockResolvedValue({ id: 'nop390-9001' })
  executeRaw.mockResolvedValue(1)
})

describe('POST /api/internal/hairshop-catalog-sync', () => {
  it('rejects an invalid secret before reading or querying products', async () => {
    const response = await POST(request(body(), 'wrong-secret'.padEnd(40, 'x')))
    expect(response.status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('keeps dry-run read-only and reports a would-create product', async () => {
    const response = await POST(request(body()))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.metrics).toMatchObject({ wouldCreate: 1, created: 0, databaseWrites: 0, priceUpdates: 0, stockUpdates: 0 })
    expect(json.results[0]).toMatchObject({ status: 'would_create', targetProductId: 'nop390-9001' })
    expect(create).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('blocks apply unless the independent server write gate is enabled', async () => {
    const response = await POST(request(body('apply')))
    expect(response.status).toBe(403)
    expect(findMany).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
    expect(executeRaw).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects price or stock fields supplied by the source', async () => {
    const payload = body() as ReturnType<typeof body> & { products: Array<Record<string, unknown>> }
    payload.products[0].price = 99
    payload.products[0].stock = 10
    const response = await POST(request(payload))
    expect(response.status).toBe(400)
    expect(findMany).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('creates an absent product once when both write gates are enabled', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    const response = await POST(request(body('apply')))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.metrics).toMatchObject({ created: 1, databaseWrites: 1, productUpdates: 0, priceUpdates: 0, stockUpdates: 0 })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0].data).toMatchObject({ price: 0, stock: 0, erpPriceMissing: true })
  })

  it('does not create on a repeated exact synchronization', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    findMany.mockResolvedValue([{ id: 'nop390-9001', externalId: 'NEW-9001', sku: 'NEW-9001', barcode: '4750000009001', isDeleted: false }])
    const response = await POST(request(body('apply')))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.metrics).toMatchObject({ created: 0, alreadyExists: 1, databaseWrites: 0 })
    expect(create).not.toHaveBeenCalled()
  })

  it('takes the new-product advisory lock inside the serializable transaction before reading or creating', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    const response = await POST(request(body('apply')))
    expect(response.status).toBe(200)
    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect((executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?'))
      .toBe("SELECT pg_advisory_xact_lock(hashtext('hairshop-catalog-new-products'))")
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0])
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0])
    expect((transaction.mock.calls[0] as unknown[])[1]).toMatchObject({ isolationLevel: 'Serializable' })
  })

  it('propagates a failure inside the locked transaction without reporting a created product', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    create.mockRejectedValueOnce(new Error('insert failed'))
    await expect(POST(request(body('apply')))).rejects.toThrow('insert failed')
    expect(executeRaw).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the lock cannot be taken', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    executeRaw.mockRejectedValueOnce(new Error('lock timeout'))
    await expect(POST(request(body('apply')))).rejects.toThrow('lock timeout')
    expect(findMany).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('re-runs the whole transaction after a serialization conflict and then reports the existing product', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    create.mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'nop390-9001', externalId: 'NEW-9001', sku: 'NEW-9001', barcode: '4750000009001', isDeleted: false }])
    const response = await POST(request(body('apply')))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json.results[0]).toMatchObject({ status: 'already_exists' })
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(executeRaw).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('gives up after three serialization conflicts instead of retrying forever', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    create.mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' }))
    await expect(POST(request(body('apply')))).rejects.toMatchObject({ code: 'P2034' })
    expect(transaction).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-serialization failures', async () => {
    process.env.HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED = 'true'
    create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    await expect(POST(request(body('apply')))).rejects.toMatchObject({ code: 'P2002' })
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
