import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditLogFindMany = vi.hoisted(() => vi.fn())
const productFindMany = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: auditLogFindMany },
    product: { findMany: productFindMany },
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))

import { requireAdminPermission } from '@/lib/server-auth'
import { GET } from './route'

function auditRow(overrides: Partial<{
  requestId: string; entityId: string; entityTitle: string
  before: { price: number; oldPrice: number | null }
  after: { price: number; oldPrice: number | null }
  at: Date; adminEmail: string; adminName: string | null; action: string
}> = {}) {
  return {
    requestId: 'batch-1', entityId: 'p1', entityTitle: 'Shampoo',
    before: { price: 10, oldPrice: null }, after: { price: 8, oldPrice: 10 },
    at: new Date('2026-08-20T10:00:00Z'), adminEmail: 'admin@test.com', adminName: 'Admin',
    action: 'product.update',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
  productFindMany.mockResolvedValue([])
})

it('drops audit rows where price did not actually change', async () => {
  auditLogFindMany.mockResolvedValue([
    auditRow({ requestId: 'batch-1', before: { price: 10, oldPrice: null }, after: { price: 10, oldPrice: null } }),
  ])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches).toHaveLength(0)
})

it('groups rows by requestId into one batch', async () => {
  auditLogFindMany.mockResolvedValue([
    auditRow({ requestId: 'batch-1', entityId: 'p1' }),
    auditRow({ requestId: 'batch-1', entityId: 'p2' }),
    auditRow({ requestId: 'batch-2', entityId: 'p3' }),
  ])
  productFindMany.mockResolvedValue([
    { id: 'p1', price: 8, oldPrice: 10 },
    { id: 'p2', price: 8, oldPrice: 10 },
    { id: 'p3', price: 8, oldPrice: 10 },
  ])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches).toHaveLength(2)
  const batch1 = json.data.batches.find((b: { requestId: string }) => b.requestId === 'batch-1')
  expect(batch1.items).toHaveLength(2)
})

it('marks an item "available" when the current price still matches the audited after-snapshot', async () => {
  auditLogFindMany.mockResolvedValue([auditRow()])
  productFindMany.mockResolvedValue([{ id: 'p1', price: 8, oldPrice: 10 }])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches[0].items[0].state).toBe('available')
  expect(json.data.batches[0].revertState).toBe('available')
})

it('marks an item "reverted" when the current price matches the audited before-snapshot', async () => {
  auditLogFindMany.mockResolvedValue([auditRow()])
  productFindMany.mockResolvedValue([{ id: 'p1', price: 10, oldPrice: null }])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches[0].items[0].state).toBe('reverted')
  expect(json.data.batches[0].revertState).toBe('reverted')
})

it('marks an item "changed" when the current price matches neither snapshot', async () => {
  auditLogFindMany.mockResolvedValue([auditRow()])
  productFindMany.mockResolvedValue([{ id: 'p1', price: 5, oldPrice: null }])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches[0].items[0].state).toBe('changed')
  expect(json.data.batches[0].revertState).toBe('not_available')
})

it('marks the batch "partial" when only some items are still revertable', async () => {
  auditLogFindMany.mockResolvedValue([
    auditRow({ entityId: 'p1' }),
    auditRow({ entityId: 'p2' }),
  ])
  productFindMany.mockResolvedValue([
    { id: 'p1', price: 8, oldPrice: 10 }, // available
    { id: 'p2', price: 5, oldPrice: null }, // changed since
  ])

  const res = await GET()
  const json = await res.json()

  expect(json.data.batches[0].revertState).toBe('partial')
})
