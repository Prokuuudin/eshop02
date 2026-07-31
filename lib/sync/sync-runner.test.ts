import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./retry', () => ({
  withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
}))

vi.mock('./upsert-products', () => ({
  upsertProducts: vi.fn().mockResolvedValue(0),
}))

vi.mock('./deactivate-missing', () => ({
  deactivateMissing: vi.fn().mockResolvedValue(0),
}))

vi.mock('./erp-extra-data-store', () => ({
  replaceErpExtraData: vi.fn().mockResolvedValue(undefined),
}))

import { runSync } from './sync-runner'
import { upsertProducts } from './upsert-products'
import { deactivateMissing } from './deactivate-missing'
import { replaceErpExtraData } from './erp-extra-data-store'
import type { ErpAdapter } from './erp-adapter'
import type { ExtendedPrismaClient } from '@/lib/prisma'

function makeMockDb(): ExtendedPrismaClient {
  return {
    syncRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ key: 'sync-run-lock' }]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as unknown as ExtendedPrismaClient
}

function makeAdapter(products: object[] = [], hasMore = false): ErpAdapter {
  return {
    name: 'test',
    fetchPage: vi.fn().mockResolvedValue({ products, hasMore, nextCursor: undefined }),
  }
}

describe('runSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates SyncRun with status "running"', async () => {
    const db = makeMockDb()
    await runSync(makeAdapter(), db)
    expect(db.syncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'running' }) }),
    )
  })

  it('returns completed status when all pages fetched successfully', async () => {
    const result = await runSync(makeAdapter(), makeMockDb())
    expect(result.status).toBe('completed')
  })

  it('throws when another sync is actively running', async () => {
    const db = makeMockDb()
    ;(db as unknown as { $queryRawUnsafe: ReturnType<typeof vi.fn> }).$queryRawUnsafe = vi
      .fn()
      .mockResolvedValue([])
    await expect(runSync(makeAdapter(), db)).rejects.toThrow('already running')
  })

  it('marks stale running syncs (> 30 min) as failed before starting', async () => {
    const db = makeMockDb()
    await runSync(makeAdapter(), db)
    expect(db.syncRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'running' }) }),
    )
  })

  it('calls upsertProducts with product batch and current runId', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
      { externalId: 'e2', title: 'P2', price: 200, stock: 2 },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    expect(upsertProducts).toHaveBeenCalledWith(expect.anything(), products, 'run-1')
  })

  it('calls deactivateMissing after all pages are fetched', async () => {
    await runSync(makeAdapter(), makeMockDb())
    expect(deactivateMissing).toHaveBeenCalledWith(expect.anything(), 'run-1')
  })

  it('skips products with empty externalId before upserting', async () => {
    const products = [
      { externalId: '', title: 'Bad', price: 100, stock: 1 },
      { externalId: 'good', title: 'Good', price: 200, stock: 2 },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    const calledWith = (upsertProducts as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledWith).toHaveLength(1)
    expect(calledWith[0].externalId).toBe('good')
  })

  it('returns failed status and finalizes SyncRun after 5 consecutive fetch errors', async () => {
    const failingAdapter: ErpAdapter = {
      name: 'failing',
      fetchPage: vi.fn().mockRejectedValue(new Error('API down')),
    }
    const db = makeMockDb()
    const result = await runSync(failingAdapter, db)
    expect(result.status).toBe('failed')
    expect(db.syncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    )
  })

  it('does not call deactivateMissing when a batch upsert failed', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
      { externalId: 'e2', title: 'P2', price: 200, stock: 2 },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    await runSync(makeAdapter(products), makeMockDb())
    expect(deactivateMissing).not.toHaveBeenCalled()
  })

  it('marks the run failed when a batch upsert failed, even though the loop completed', async () => {
    const products = [
      { externalId: 'e1', title: 'P1', price: 100, stock: 1 },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    const result = await runSync(makeAdapter(products), makeMockDb())
    expect(result.status).toBe('failed')
    expect(result.deactivated).toBe(0)
  })

  it('skips a repeated externalId and records it as an error', async () => {
    const products = [
      { externalId: 'dup', title: 'First', price: 100, stock: 1 },
      { externalId: 'dup', title: 'Second (duplicate id)', price: 150, stock: 3 },
      { externalId: 'unique', title: 'Fine', price: 200, stock: 2 },
    ]
    const result = await runSync(makeAdapter(products), makeMockDb())
    const calledWith = (upsertProducts as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledWith).toHaveLength(2)
    expect(calledWith.map((p: { externalId: string }) => p.externalId)).toEqual(['dup', 'unique'])
    expect(result.status).toBe('failed')
    expect(result.errorCount).toBeGreaterThan(0)
  })

  it('flushes accumulated price/warehouse data only when the run succeeds', async () => {
    const products = [
      {
        externalId: 'e1',
        title: 'e1',
        price: 7,
        stock: 53,
        prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 },
        warehouseQuantities: { '10000': 22 },
      },
    ]
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).toHaveBeenCalledWith(
      expect.anything(),
      { e1: { prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 }, warehouseQuantities: { '10000': 22 } } },
    )
  })

  it('does not flush price/warehouse data when the run fails', async () => {
    const products = [
      { externalId: 'e1', title: 'e1', price: 7, stock: 53, prices: { price1: 9, price2: 7, price3: 2.44, price4: 5 }, warehouseQuantities: {} },
    ]
    ;(upsertProducts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db timeout'))
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).not.toHaveBeenCalled()
  })

  it('does not flush at all when no product in the run carries extra data', async () => {
    const products = [{ externalId: 'e1', title: 'e1', price: 7, stock: 53 }]
    await runSync(makeAdapter(products), makeMockDb())
    expect(replaceErpExtraData).not.toHaveBeenCalled()
  })
})
