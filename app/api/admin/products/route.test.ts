import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const txProductFindUnique = vi.hoisted(() => vi.fn())
const txProductUpdateMany = vi.hoisted(() => vi.fn())
const txProductFindUniqueOrThrow = vi.hoisted(() => vi.fn())
const txKeyValueFindUnique = vi.hoisted(() => vi.fn(() => Promise.resolve(null)))
const notifyPriceChangeMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const notifyRestockMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

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
import { PUT } from './route'

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
