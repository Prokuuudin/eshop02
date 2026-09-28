import { describe, expect, it, vi } from 'vitest'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { hasSkuChanged } from './product-sku'
import { applyProductChanges } from './product-mutation'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('hasSkuChanged', () => {
  it('treats the same SKU with casing or surrounding whitespace as unchanged', () => {
    expect(hasSkuChanged(' ABC-123 ', 'abc-123')).toBe(false)
  })

  it('detects a genuinely changed or cleared SKU', () => {
    expect(hasSkuChanged('ABC-123', 'XYZ-999')).toBe(true)
    expect(hasSkuChanged('ABC-123', undefined)).toBe(true)
  })
})

describe('applyProductChanges — manual ERP price approval', () => {
  const makeTx = (current: Record<string, unknown>) => {
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const tx = {
      product: {
        findUnique: vi.fn(async () => current),
        findUniqueOrThrow: vi.fn(async () => current),
        findFirst: vi.fn(async () => null),
        count: vi.fn(async () => 0),
        updateMany,
      },
      keyValueSetting: { findUnique: vi.fn(async () => null), update: vi.fn() },
    }
    return { tx: tx as unknown as ExtendedTransactionClient, updateMany }
  }
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: '22272', title: 'Matrix', brand: 'MATRIX', category: 'hair', price: 31.5, oldPrice: null, rating: 0,
    stock: 2, badges: [], images: [], isCustom: false, isDeleted: false, isActive: true, revision: 3,
    externalId: 'M604', erpPriceMissing: true, manualPriceApproved: false, manualApprovedPrice: null, ...overrides,
  })
  const dataOf = (updateMany: ReturnType<typeof vi.fn>) => (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data

  it('a price edit alone never approves the local price', async () => {
    const { tx, updateMany } = makeTx(row())
    await applyProductChanges(tx, '22272', 3, { price: 29 })
    expect(dataOf(updateMany)).not.toHaveProperty('manualPriceApproved')
  })

  it('a price edit revokes an existing approval — re-approval must be explicit', async () => {
    const { tx, updateMany } = makeTx(row({ manualPriceApproved: true, manualApprovedPrice: 31.5 }))
    await applyProductChanges(tx, '22272', 3, { price: 35.5 })
    expect(dataOf(updateMany)).toMatchObject({ price: 35.5, manualPriceApproved: false, manualApprovedPrice: null })
  })

  it('an edit that keeps the price keeps the approval', async () => {
    const { tx, updateMany } = makeTx(row({ manualPriceApproved: true, manualApprovedPrice: 31.5 }))
    await applyProductChanges(tx, '22272', 3, { title: 'Matrix Light Master' })
    expect(dataOf(updateMany)).not.toHaveProperty('manualPriceApproved')
  })
})
