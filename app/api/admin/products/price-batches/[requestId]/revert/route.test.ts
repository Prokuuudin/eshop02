import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auditLogFindMany = vi.hoisted(() => vi.fn())
const txProductFindUnique = vi.hoisted(() => vi.fn())
const applyProductChangesMock = vi.hoisted(() => vi.fn())
const appendServerAuditMock = vi.hoisted(() => vi.fn())
const notifyPriceChangeMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: auditLogFindMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn({ product: { findUnique: txProductFindUnique } }),
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: appendServerAuditMock }))
vi.mock('@/lib/product-overrides-mapping', () => ({ mapDbToProduct: (p: unknown) => p }))
vi.mock('@/lib/product-news-notify', () => ({ notifyPriceChange: notifyPriceChangeMock }))
vi.mock('@/lib/product-mutation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/product-mutation')>()
  return { ...actual, applyProductChanges: applyProductChangesMock }
})

import { requireAdminPermission } from '@/lib/server-auth'
import { ProductMutationError } from '@/lib/product-mutation'
import { POST } from './route'

function revertRequest(requestId: string) {
  return {
    req: new NextRequest(`http://localhost/api/admin/products/price-batches/${requestId}/revert`, { method: 'POST' }),
    params: Promise.resolve({ requestId }),
  }
}

function row(overrides: Partial<{ entityId: string; entityTitle: string; before: { price: number; oldPrice: number | null }; after: { price: number; oldPrice: number | null } }> = {}) {
  return {
    entityId: 'p1', entityTitle: 'Shampoo',
    before: { price: 10, oldPrice: null }, after: { price: 8, oldPrice: 10 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' } as never)
  applyProductChangesMock.mockImplementation(async (_tx: unknown, id: string, _revision: number, changes: { price: number; oldPrice: number | null }) => ({
    before: { price: 8, oldPrice: 10 },
    next: { id, title: 'Shampoo', price: changes.price, oldPrice: changes.oldPrice },
  }))
})

it('returns 404 when the batch has no price-changing rows', async () => {
  auditLogFindMany.mockResolvedValue([])
  const { req, params } = revertRequest('batch-1')

  const res = await POST(req, { params })

  expect(res.status).toBe(404)
})

it('reverts a matching item and reports it ok', async () => {
  auditLogFindMany.mockResolvedValue([row()])
  txProductFindUnique.mockResolvedValue({ id: 'p1', isDeleted: false, revision: 2, price: 8, oldPrice: 10 })
  const { req, params } = revertRequest('batch-1')

  const res = await POST(req, { params })
  const json = await res.json()

  expect(json.data.ok).toBe(1)
  expect(json.data.err).toBe(0)
  expect(applyProductChangesMock).toHaveBeenCalledWith(expect.anything(), 'p1', 2, { price: 10, oldPrice: null })
  expect(notifyPriceChangeMock).toHaveBeenCalledWith('p1', 'Shampoo', 8, 10)
})

it('skips an item that changed since the original batch, without touching it', async () => {
  auditLogFindMany.mockResolvedValue([row()])
  txProductFindUnique.mockResolvedValue({ id: 'p1', isDeleted: false, revision: 3, price: 5, oldPrice: null })
  const { req, params } = revertRequest('batch-1')

  const res = await POST(req, { params })
  const json = await res.json()

  expect(json.data.ok).toBe(0)
  expect(json.data.err).toBe(1)
  expect(json.data.items[0].error).toMatch(/changed since/i)
  expect(applyProductChangesMock).not.toHaveBeenCalled()
})

it('groups all items of one revert under a single new requestId, distinct from the original batch', async () => {
  auditLogFindMany.mockResolvedValue([row({ entityId: 'p1' }), row({ entityId: 'p2' })])
  txProductFindUnique.mockResolvedValue({ id: 'p1', isDeleted: false, revision: 2, price: 8, oldPrice: 10 })
  const { req, params } = revertRequest('original-batch')

  await POST(req, { params })

  expect(appendServerAuditMock).toHaveBeenCalledTimes(2)
  const requestIds = appendServerAuditMock.mock.calls.map((call) => call[3].requestId)
  expect(requestIds[0]).toBe(requestIds[1])
  expect(requestIds[0]).not.toBe('original-batch')
})

it('continues reverting remaining items when one fails', async () => {
  auditLogFindMany.mockResolvedValue([row({ entityId: 'p1' }), row({ entityId: 'p2' })])
  txProductFindUnique.mockImplementation(async ({ where: { id } }: { where: { id: string } }) =>
    id === 'p1' ? { id: 'p1', isDeleted: false, revision: 2, price: 8, oldPrice: 10 } : null)
  const { req, params } = revertRequest('batch-1')

  const res = await POST(req, { params })
  const json = await res.json()

  expect(json.data.ok).toBe(1)
  expect(json.data.err).toBe(1)
})

it('surfaces ProductMutationError messages per item instead of failing the whole batch', async () => {
  auditLogFindMany.mockResolvedValue([row()])
  txProductFindUnique.mockResolvedValue({ id: 'p1', isDeleted: false, revision: 2, price: 8, oldPrice: 10 })
  applyProductChangesMock.mockRejectedValue(new ProductMutationError('SKU already belongs to another product', 409))
  const { req, params } = revertRequest('batch-1')

  const res = await POST(req, { params })
  const json = await res.json()

  expect(json.data.err).toBe(1)
  expect(json.data.items[0].error).toBe('SKU already belongs to another product')
})
