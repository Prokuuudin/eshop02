import { beforeEach, describe, expect, it, vi } from 'vitest'

const findProduct = vi.fn()
const findSetting = vi.fn()

vi.mock('next/cache', () => ({ unstable_cache: <T>(fn: T) => fn }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: (...args: unknown[]) => findProduct(...args) },
    keyValueSetting: { findUnique: (...args: unknown[]) => findSetting(...args) },
  },
}))

import { getProductWarehouseAvailability } from './warehouse-availability'

describe('getProductWarehouseAvailability', () => {
  beforeEach(() => {
    findProduct.mockResolvedValue({ externalId: 'SKU1' })
    findSetting.mockResolvedValue({
      updatedAt: new Date('2026-10-05T17:00:00Z'),
      value: { SKU1: { warehouseQuantities: { '10000': 9, '10001': 2, '10002': 0, '10005': 1, '10010': 4 } } },
    })
  })

  it('lists the seven walk-in stores and hides the central warehouse and Jelgava (10010)', async () => {
    const result = await getProductWarehouseAvailability('p1', 'ru')
    expect(result.stores.map(store => store.id)).toEqual(['10001', '10002', '10005', '10004', '10003', '10006', '10007'])
    expect(result.stores.some(store => store.name === 'Елгава')).toBe(false)
  })

  it('still reports the quantities of the visible stores', async () => {
    const result = await getProductWarehouseAvailability('p1', 'en')
    expect(result.available).toBe(true)
    expect(result.stores.find(store => store.id === '10001')?.quantity).toBe(2)
    expect(result.stores.find(store => store.id === '10004')?.quantity).toBeNull()
  })
})
