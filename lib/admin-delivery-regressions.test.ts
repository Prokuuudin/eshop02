import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { extractVat } from './tax'
import { getDeliveryLocations } from './delivery-locations'

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  order: { findUnique: vi.fn(), update: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() },
  keyValueSetting: { findUnique: vi.fn(async () => null) },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
import { updateServerOrderByAdmin, type AdminOrderUpdateInput } from './orders-data-store'

const product = { id: 'p1', title: 'Item', brand: 'Brand', image: '', category: 'hair', rating: 5, stock: 10, sku: 'SKU1', price: 60 }
const request = new NextRequest('https://shop.test/api/admin/orders')
const admin = { id: 'admin', platformRole: 'admin' } as never
const edit = (input: Partial<AdminOrderUpdateInput> = {}) => updateServerOrderByAdmin('o1', {
  items: [{ id: 'p1', quantity: 1 }], deliveryMethod: 'courier', country: 'LV', address: 'Street 1', city: 'Riga', postalCode: 'LV-1001', ...input,
}, admin, request)

describe('transactional admin delivery and pricing edits', () => {
  let current: Record<string, unknown>
  beforeEach(() => {
    vi.clearAllMocks()
    current = { id: 'o1', createdAt: new Date(), firstName: 'Buyer', lastName: 'Name',
      items: [{ ...product, quantity: 1 }], subtotal: 60, discount: 0, tax: extractVat(60), total: 69, delivery: 10,
      bonusSpent: 100, paymentStatus: 'unpaid', paymentMethod: 'paysera', paymentSessionId: 'old',
      stockReservationStatus: 'reserved', country: 'LV', deliveryMethod: 'courier', address: 'Street 1', city: 'Riga',
    }
    tx.order.findUnique.mockImplementation(async () => current)
    tx.product.findMany.mockResolvedValue([product])
    tx.product.updateMany.mockResolvedValue({ count: 1 })
    tx.order.update.mockImplementation(async ({ data }) => ({ ...current, ...data, deliveryLocation: data.deliveryLocation === Prisma.DbNull ? null : data.deliveryLocation }))
  })
  it('keeps €60 + €10 - 100 points at €69 after a non-economic edit and invalidates the old session', async () => {
    const result = await edit()
    expect(result.total).toBe(69)
    expect(result.paymentSessionId).toBeUndefined()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
  it.each([[0, 0, 70], [100, 10, 59], [1, 0, 69.99], [7000, 0, 0]])('preserves bonus %s and discount %s after a non-economic edit', async (bonusSpent, discount, total) => {
    Object.assign(current, { bonusSpent, discount, total, tax: extractVat(60 - discount) })
    const result = await edit()
    expect(result.discount).toBe(discount)
    expect(result.total).toBe(total)
  })
  it.each(['courier', 'post'] as const)('clears pickup on pickup → %s', async deliveryMethod => {
    current.deliveryMethod = 'pickup'; current.pickupStoreId = 'riga-office'
    const result = await edit({ deliveryMethod, deliveryLocationId: deliveryMethod === 'post' ? getDeliveryLocations('post', 'LV')[0].id : undefined })
    expect(result.pickupStoreId).toBeUndefined()
    if (deliveryMethod === 'post') expect(result.deliveryLocation?.provider).toBe('omniva')
    else expect(result.deliveryLocation).toBeUndefined()
  })
  it.each(['courier', 'post', 'pickup'] as const)('resolves %s → pickup store B and clears locker/postal fields', async previous => {
    current.deliveryMethod = previous; current.pickupStoreId = previous === 'pickup' ? 'riga-office' : undefined
    current.deliveryLocation = getDeliveryLocations('post', 'LV')[0]
    const result = await edit({ deliveryMethod: 'pickup', pickupStoreId: 'imanta', address: 'forged' })
    expect(result.pickupStoreId).toBe('imanta'); expect(result.address).not.toBe('forged')
    expect(result.deliveryLocation).toBeUndefined(); expect(result.postalCode).toBeUndefined()
  })
  it.each([undefined, 'fake'])('rejects missing/invalid store %s without persisting changes', async pickupStoreId => {
    await expect(edit({ deliveryMethod: 'pickup', pickupStoreId })).rejects.toThrow('invalid_pickup_store')
    expect(tx.order.update).not.toHaveBeenCalled()
  })
})
