import { describe, expect, it, vi } from 'vitest'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { hasSkuChanged } from './product-sku'
import { applyProductChanges } from './product-mutation'
import { updateProductRequestSchema } from './product-mutation-schema'

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

describe('applyProductChanges — partial changes from the edit form', () => {
  const current = {
    id: 'p1', title: 'Shampoo', titleEn: 'English title', description: 'Kept description', brand: 'B', category: 'hair',
    price: 10, oldPrice: null, rating: 0, stock: 2, badges: ['new'], images: ['/a.jpg'], technicalSpecs: { 'Тип': 'крем' },
    isCustom: false, isDeleted: false, isActive: true, revision: 3, externalId: null,
    erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null,
  }
  const makeTx = (fields: Record<string, unknown> = {}) => {
    const row = { ...current, ...fields }
    const updateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }))
    const tx = {
      product: {
        findUnique: vi.fn(async () => row), findUniqueOrThrow: vi.fn(async () => row),
        findFirst: vi.fn(async () => null), count: vi.fn(async () => 0), updateMany,
      },
      keyValueSetting: { findUnique: vi.fn(async () => null), update: vi.fn() },
    }
    return { tx: tx as unknown as ExtendedTransactionClient, updateMany }
  }

  it('stores explicit clears and keeps every absent field unchanged', async () => {
    const { tx, updateMany } = makeTx()
    await applyProductChanges(tx, 'p1', 3, { titleEn: '', images: [], technicalSpecs: {} })
    const { where, data } = updateMany.mock.calls[0][0]
    expect(where).toEqual({ id: 'p1', revision: 3 })
    expect(data).toMatchObject({
      titleEn: '', images: [], technicalSpecs: {},
      title: 'Shampoo', description: 'Kept description', badges: ['new'], price: 10, stock: 2,
    })
  })

  it('saves a price change together with a cleared manufacturer email', async () => {
    const { tx, updateMany } = makeTx({ manufacturerEmail: 'maker@example.com' })
    const { changes } = updateProductRequestSchema.parse({ id: 'p1', revision: 3, changes: { price: 12.5, manufacturerEmail: '' } })
    await applyProductChanges(tx, 'p1', 3, changes)
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ price: 12.5, manufacturerEmail: '', title: 'Shampoo' })
  })

  it('rejects a stale revision before writing', async () => {
    const { tx, updateMany } = makeTx()
    await expect(applyProductChanges(tx, 'p1', 2, { titleEn: '' })).rejects.toMatchObject({ status: 409 })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('keeps the fresh ERP price when an administrator saves a pre-sync form', async () => {
    const openedRevision = current.revision
    const { tx, updateMany } = makeTx({ externalId: 'ERP-1', price: 12.5, revision: openedRevision + 1 })
    await expect(applyProductChanges(tx, 'p1', openedRevision, { price: 10, title: 'Edited title' }))
      .rejects.toMatchObject({ status: 409 })
    expect(updateMany).not.toHaveBeenCalled()
    expect(await tx.product.findUnique({ where: { id: 'p1' } })).toMatchObject({ price: 12.5 })
  })

  it('rejects ERP changes committed between the row read and the conditional write', async () => {
    const { tx, updateMany } = makeTx({ externalId: 'ERP-1' })
    updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(applyProductChanges(tx, 'p1', 3, { title: 'Edited title' }))
      .rejects.toMatchObject({ status: 409 })
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', revision: 3 })
  })
})
