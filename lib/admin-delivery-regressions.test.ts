import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { extractVat } from './tax'
import { getDeliveryLocations } from './delivery-locations'
import { DEFAULT_COMMERCE_SETTINGS } from './commerce-settings'

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
    tx.keyValueSetting.findUnique.mockImplementation(async () => null)
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
  it('clears pickup on pickup → post', async () => {
    current.deliveryMethod = 'pickup'; current.pickupStoreId = 'riga-office'
    const result = await edit({ deliveryMethod: 'post', deliveryLocationId: getDeliveryLocations('post', 'LV')[0].id })
    expect(result.pickupStoreId).toBeUndefined()
    expect(result.deliveryLocation?.provider).toBe('omniva')
  })
  it('clears pickup on pickup → courier_riga inside the approved area', async () => {
    const settings = structuredClone(DEFAULT_COMMERCE_SETTINGS)
    settings.delivery.courier_riga.enabled = true
    settings.delivery.courier_riga.status = 'ready'
    settings.delivery.courier_riga.serviceAreaCities = ['Riga'] // test-only area
    tx.keyValueSetting.findUnique.mockResolvedValue({ value: settings } as never)
    current.deliveryMethod = 'pickup'; current.pickupStoreId = 'riga-office'
    const result = await edit({ deliveryMethod: 'courier_riga' })
    expect(result.pickupStoreId).toBeUndefined()
    expect(result.deliveryLocation).toBeUndefined()
    await expect(edit({ deliveryMethod: 'courier_riga', city: 'Jelgava' })).rejects.toThrow('delivery_unavailable')
  })
  it('never lets an admin switch an order to the Latvia-wide or legacy courier', async () => {
    current.deliveryMethod = 'pickup'; current.pickupStoreId = 'riga-office'
    for (const deliveryMethod of ['courier', 'courier_latvia'] as const) {
      await expect(edit({ deliveryMethod })).rejects.toThrow('delivery_unavailable')
    }
    expect(tx.order.update).not.toHaveBeenCalled()
  })
  it.each(['courier', 'courier_latvia'] as const)('keeps a historical %s order editable without changing its method', async deliveryMethod => {
    current.deliveryMethod = deliveryMethod
    const result = await edit({ deliveryMethod, city: 'Jelgava' })
    expect(result.deliveryMethod).toBe(deliveryMethod)
    expect(result.total).toBe(69)
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

describe('admin edits of an order with a second-item discount split', () => {
  const discounted = { ...product, brand: 'Kemon', quantity: 2, promotionDiscount: 30, promotionDiscountedUnits: 1, promotionId: 'kemon-2nd' }
  // Ended and paused: an order placed under the campaign is still recalculated with its rules.
  const campaign = {
    id: 'kemon-2nd', name: 'Kemon 2nd', description: '', type: 'second_item_discount', discountPercent: 50,
    startDate: '2020-01-01', endDate: '2020-12-31', active: false, targetCategories: [], targetSubcategories: [], targetBrands: ['Kemon'],
    minOrderAmount: 0, createdAt: '', updatedAt: '',
  }
  let campaigns: unknown[]
  let current: Record<string, unknown>
  beforeEach(() => {
    vi.clearAllMocks()
    campaigns = [campaign]
    current = { id: 'o1', createdAt: new Date(), firstName: 'Buyer', lastName: 'Name',
      items: [discounted], subtotal: 120, discount: 30, tax: extractVat(90), total: 100, delivery: 10,
      bonusSpent: null, paymentStatus: 'unpaid', paymentMethod: 'paysera', paymentSessionId: 'old',
      stockReservationStatus: 'reserved', country: 'LV', deliveryMethod: 'courier', address: 'Street 1', city: 'Riga',
    }
    tx.order.findUnique.mockImplementation(async () => current)
    tx.keyValueSetting.findUnique.mockImplementation((async ({ where }: { where: { key: string } }) =>
      (where.key === 'promo-campaigns' ? { value: campaigns } : null)) as never)
    tx.product.findMany.mockResolvedValue([{ ...product, brand: 'Kemon' }])
    tx.product.updateMany.mockResolvedValue({ count: 1 })
    tx.order.update.mockImplementation(async ({ data }) => ({ ...current, ...data, deliveryLocation: data.deliveryLocation === Prisma.DbNull ? null : data.deliveryLocation }))
  })

  it('keeps the split and the discount when the lines are unchanged', async () => {
    const result = await edit({ items: [{ id: 'p1', quantity: 2 }], city: 'Jurmala' })
    expect(result.discount).toBe(30)
    expect(result.total).toBe(100)
    expect(result.items[0]).toMatchObject({ promotionDiscount: 30, promotionDiscountedUnits: 1, promotionId: 'kemon-2nd' })
  })

  it('removes the discount when a unit of the only pair is removed instead of scaling it', async () => {
    const result = await edit({ items: [{ id: 'p1', quantity: 1 }] })
    expect(result.discount).toBe(0)
    expect(result.subtotal).toBe(60)
    expect(result.total).toBe(70)
    expect(result.items[0]).not.toHaveProperty('promotionDiscount')
    expect(result.items[0]).not.toHaveProperty('promotionId')
    expect(result.paymentSessionId).toBeUndefined()
  })

  it('recalculates pairs for added units and a changed catalog price', async () => {
    tx.product.findMany.mockResolvedValue([{ ...product, brand: 'Kemon', price: 55 }])
    const result = await edit({ items: [{ id: 'p1', quantity: 4 }] })
    expect(result.subtotal).toBe(220)
    expect(result.discount).toBe(55) // two pairs, 27.50 each
    expect(result.items[0]).toMatchObject({ promotionDiscount: 55, promotionDiscountedUnits: 2, promotionId: 'kemon-2nd' })
  })

  it('refuses the edit when the campaign no longer exists, instead of guessing a discount', async () => {
    campaigns = []
    await expect(edit({ items: [{ id: 'p1', quantity: 1 }] })).rejects.toMatchObject({ code: 'second_item_campaign_missing' })
    expect(tx.order.update).not.toHaveBeenCalled()
  })
})
