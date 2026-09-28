import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
vi.mock('server-only', () => ({}))

const findUnique = vi.hoisted(() => vi.fn())
const findUniqueOrThrow = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const appendServerAuditMock = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({ product: { findUnique, findUniqueOrThrow, updateMany } }),
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: appendServerAuditMock }))
vi.mock('@/lib/product-overrides-mapping', () => ({ mapDbToProduct: (p: unknown) => p }))

import { requireAdminPermission } from '@/lib/server-auth'
import { POST } from './route'

const product = (overrides: Record<string, unknown> = {}) => ({
  id: '22272', title: 'Matrix Light Master', price: 31.5, revision: 7, isDeleted: false,
  externalId: 'M604', erpPriceMissing: true, manualPriceApproved: false, manualApprovedPrice: null, technicalSpecs: null, ...overrides,
})

const call = (body: unknown, id = '22272') => POST(
  new NextRequest(`http://localhost/api/admin/products/${id}/manual-price-approval`, { method: 'POST', body: JSON.stringify(body) }),
  { params: Promise.resolve({ id }) },
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' } as never)
  updateMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/admin/products/[id]/manual-price-approval', () => {
  it('requires the prices.update admin permission', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await call({ approved: true, revision: 7, expectedPrice: 31.5 })
    expect(res.status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('prices.update')
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('approves the local price explicitly, bumps the revision and writes an audit entry', async () => {
    findUnique.mockResolvedValue(product())
    findUniqueOrThrow.mockResolvedValue(product({ manualPriceApproved: true, manualApprovedPrice: 31.5, revision: 8 }))
    const res = await call({ approved: true, revision: 7, expectedPrice: 31.5 })
    expect(res.status).toBe(200)
    // The approval records the exact price and only succeeds if that price is still current.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: '22272', revision: 7, price: 31.5 },
      data: { manualPriceApproved: true, manualApprovedPrice: 31.5, revision: { increment: 1 } },
    })
    expect(appendServerAuditMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({
      action: 'product.manual_price_approved',
      entityId: '22272',
      before: expect.objectContaining({ manualPriceApproved: false, erpPriceMissing: true, price: 31.5 }),
      after: expect.objectContaining({ manualPriceApproved: true }),
    }))
  })

  it('revokes an approval with its own audit action', async () => {
    findUnique.mockResolvedValue(product({ manualPriceApproved: true, manualApprovedPrice: 31.5 }))
    findUniqueOrThrow.mockResolvedValue(product({ manualPriceApproved: false, revision: 8 }))
    const res = await call({ approved: false, revision: 7 })
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { manualPriceApproved: false, manualApprovedPrice: null, revision: { increment: 1 } },
    }))
    expect(appendServerAuditMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ action: 'product.manual_price_revoked' }))
  })

  it('refuses approval for products that have an ERP price or are not ERP-linked', async () => {
    findUnique.mockResolvedValue(product({ erpPriceMissing: false }))
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(400)
    findUnique.mockResolvedValue(product({ externalId: null }))
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
    expect(appendServerAuditMock).not.toHaveBeenCalled()
  })

  it('refuses to approve a non-positive local price', async () => {
    findUnique.mockResolvedValue(product({ price: 0 }))
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('rejects a stale revision (concurrent price edit) instead of approving an unseen price', async () => {
    findUnique.mockResolvedValue(product({ revision: 8 }))
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(409)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('refuses to approve a price the admin did not see (price changed since the page loaded)', async () => {
    findUnique.mockResolvedValue(product({ price: 35.5 }))
    const res = await call({ approved: true, revision: 7, expectedPrice: 31.5 })
    expect(res.status).toBe(409)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('fails closed when the price changes between the check and the write', async () => {
    findUnique.mockResolvedValue(product())
    updateMany.mockResolvedValue({ count: 0 })
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(409)
    expect(appendServerAuditMock).not.toHaveBeenCalled()
  })

  it('requires expectedPrice to approve', async () => {
    findUnique.mockResolvedValue(product())
    expect((await call({ approved: true, revision: 7 })).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('refuses products whose variants carry price adjustments (checkout charges the base price)', async () => {
    findUnique.mockResolvedValue(product({
      technicalSpecs: { __variantGroupsJson: JSON.stringify([{ name: 'Size', required: true, options: [{ value: '1L', priceAdjustment: 5 }] }]) },
    }))
    expect((await call({ approved: true, revision: 7, expectedPrice: 31.5 })).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('rejects malformed bodies', async () => {
    expect((await call({ approved: 'yes', revision: 7 })).status).toBe(400)
    expect((await call({ approved: true, revision: 7, price: 1 })).status).toBe(400)
  })
})
