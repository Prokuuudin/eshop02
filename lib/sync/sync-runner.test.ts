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

import { runSync } from './sync-runner'
import { upsertProducts } from './upsert-products'
import { deactivateMissing } from './deactivate-missing'
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
    ;(db.syncRun.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing-run' })
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
})
