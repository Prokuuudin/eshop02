import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const txProductFindUnique = vi.hoisted(() => vi.fn())
const txProductUpdateMany = vi.hoisted(() => vi.fn())
const txProductFindUniqueOrThrow = vi.hoisted(() => vi.fn())
const txKeyValueFindUnique = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
const notifyPriceChangeMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const notifyRestockMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const deleteProductAnyMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ success: true, products: [] })))
const deleteProductsAnyMock = vi.hoisted(() => vi.fn((ids: string[]) => Promise.resolve({ success: true, deletedCount: ids.length })))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({
      product: {
        findUnique: txProductFindUnique,
        updateMany: txProductUpdateMany,
        findUniqueOrThrow: txProductFindUniqueOrThrow,
      },
      keyValueSetting: { findUnique: txKeyValueFindUnique },
    }),
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({
  applyProductOverride: (base: unknown) => base,
  getAdminProducts: vi.fn().mockResolvedValue([]),
  deleteProductAny: deleteProductAnyMock,
  deleteProductsAny: deleteProductsAnyMock,
}))
vi.mock('@/lib/product-overrides-mapping', () => ({
  mapDbToProduct: (p: { id: string; title: string; price: number; stock: number }) => p,
  mapProductToDbCreate: (p: { id: string; title: string; price: number; stock: number }) => ({
    id: p.id, isCustom: true, isDeleted: false, title: p.title, price: p.price, stock: p.stock,
  }),
}))
vi.mock('@/lib/product-news-notify', () => ({
  notifyPriceChange: notifyPriceChangeMock,
  notifyRestock: notifyRestockMock,
}))

import { requireAdminPermission } from '@/lib/server-auth'
import { DELETE, PUT } from './route'

function putRequest(changes: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/products', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'p1', revision: 1, changes }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
  txKeyValueFindUnique.mockResolvedValue(null)
  txProductUpdateMany.mockResolvedValue({ count: 1 })
})

it('fires notifyPriceChange when price actually changes', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 8, stock: 5 })

  const res = await PUT(putRequest({ price: 8 }))

  expect(res.status).toBe(200)
  expect(notifyPriceChangeMock).toHaveBeenCalledWith('p1', 'Shampoo', 10, 8)
  expect(notifyRestockMock).not.toHaveBeenCalled()
})

it('fires notifyRestock when stock goes from 0 to positive', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 0, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 20 })

  const res = await PUT(putRequest({ stock: 20 }))

  expect(res.status).toBe(200)
  expect(notifyRestockMock).toHaveBeenCalledWith('p1', 'Shampoo')
  expect(notifyPriceChangeMock).not.toHaveBeenCalled()
})

it('fires neither when price and stock are unchanged', async () => {
  txProductFindUnique.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5, revision: 1, isDeleted: false, isCustom: true, externalId: null })
  txProductFindUniqueOrThrow.mockResolvedValue({ id: 'p1', title: 'Shampoo', price: 10, stock: 5 })

  const res = await PUT(putRequest({ title: 'Shampoo Deluxe' }))

  expect(res.status).toBe(200)
  expect(notifyPriceChangeMock).not.toHaveBeenCalled()
  expect(notifyRestockMock).not.toHaveBeenCalled()
})

it('bulk deletes unique selected product ids', async () => {
  const req = new NextRequest('http://localhost/api/admin/products', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['p1', ' p2 ', 'p1'], permanently: true }),
  })

  const res = await DELETE(req)

  expect(res.status).toBe(200)
  expect(deleteProductsAnyMock).toHaveBeenCalledTimes(1)
  expect(deleteProductsAnyMock).toHaveBeenCalledWith(['p1', 'p2'])
  await expect(res.json()).resolves.toMatchObject({ data: { deletedCount: 2 } })
})
