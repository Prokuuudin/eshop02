import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  updateServerOrderByAdmin: vi.fn(),
  AdminOrderUpdateError: class AdminOrderUpdateError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
  createServerOrder: vi.fn(),
  InsufficientStockError: class InsufficientStockError extends Error {
    items: string[]
    constructor(items: string[] = []) {
      super('insufficient stock')
      this.items = items
    }
  },
  PromoCodeUsageLimitError: class PromoCodeUsageLimitError extends Error {},
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn(), count: vi.fn() },
    product: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: txMock,
  },
}))

import { requireAdminPermission } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { createServerOrder, InsufficientStockError, PromoCodeUsageLimitError } from '@/lib/orders-data-store'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

const VALID_BODY = {
  email: 'customer@example.com',
  firstName: 'Ivan',
  lastName: 'Petrov',
  phone: '+37126000000',
  items: [{ id: 'p1', quantity: 2, unitPrice: 25 }],
  deliveryMethod: 'courier' as const,
  address: 'Riga st 1',
  city: 'Riga',
  paymentMethod: 'Наличные',
  paymentStatus: 'unpaid' as const,
}

const CATALOG_PRODUCT = {
  id: 'p1', title: 'Shampoo Pro', brand: 'Brand', image: '/img.jpg', category: 'hair',
  rating: 4.5, stock: 10, isDeleted: false,
}

function makeRequest(body: Record<string, unknown> = VALID_BODY): NextRequest {
  return new NextRequest('http://localhost/api/admin/orders', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  txMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
    orderStatusRecord: { create: vi.fn() },
    orderNote: { create: vi.fn() },
  }))
})

describe('POST /api/admin/orders', () => {
  it('rejects non-admins before touching the database', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(prisma.product.findMany).not.toHaveBeenCalled()
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rejects a malformed body with 400 before any DB call', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)

    const res = await POST(makeRequest({ ...VALID_BODY, items: [] }))

    expect(res.status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rejects an order referencing a product that does not exist (or is archived)', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never) // p1 not found

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_items')
    expect(body.items).toEqual(['p1'])
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('rejects a soft-deleted product the same as a missing one', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ ...CATALOG_PRODUCT, isDeleted: true }] as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect(createServerOrder).not.toHaveBeenCalled()
  })

  it('creates the order under an admin-set unit price, recomputing totals server-side', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never) // no existing customer account
    vi.mocked(createServerOrder).mockResolvedValue({
      id: '1042', firstName: 'Ivan', lastName: 'Petrov', total: 55, items: [{}],
      paymentMethod: 'Наличные',
    } as never)

    const res = await POST(makeRequest({ ...VALID_BODY, discount: 5 }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.order.id).toBe('1042')

    const orderArg = vi.mocked(createServerOrder).mock.calls[0][0]
    // 2 x €25 = €50 subtotal, minus €5 discount, plus €5 courier delivery = €50 total.
    // None of these figures come from a client-sent subtotal/total field - VALID_BODY
    // doesn't even include one - proving they're computed server-side from the items.
    expect(orderArg.subtotal).toBe(50)
    expect(orderArg.discount).toBe(5)
    expect(orderArg.delivery).toBe(5)
    expect(orderArg.total).toBe(50)
    expect(orderArg.paymentProvider).toBe('manual')
    expect(orderArg.userId).toBeUndefined()

    // Status starts 'confirmed' (staff already processed this sale) and it's
    // written in the same transaction as the audit entry.
    expect(txMock).toHaveBeenCalledTimes(1)
  })

  it('clamps a discount larger than the subtotal instead of producing a negative total', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(createServerOrder).mockResolvedValue({ id: '1043', firstName: 'Ivan', lastName: 'Petrov', total: 5, items: [{}], paymentMethod: 'Наличные' } as never)

    await POST(makeRequest({ ...VALID_BODY, discount: 9999 }))

    const orderArg = vi.mocked(createServerOrder).mock.calls[0][0]
    expect(orderArg.discount).toBe(50) // clamped to subtotal, not 9999
    expect(orderArg.total).toBe(5) // 50 - 50 + 5 delivery
  })

  it('attaches the existing customer account by email instead of creating an orphan order', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u-9', companyId: 'company-1' } as never)
    vi.mocked(createServerOrder).mockResolvedValue({ id: '1044', firstName: 'Ivan', lastName: 'Petrov', total: 55, items: [{}], paymentMethod: 'Наличные' } as never)

    await POST(makeRequest())

    const orderArg = vi.mocked(createServerOrder).mock.calls[0][0]
    expect(orderArg.userId).toBe('u-9')
    expect(orderArg.companyId).toBe('company-1')
  })

  it('maps InsufficientStockError to 409 with the offending item ids', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(createServerOrder).mockRejectedValue(new InsufficientStockError(['p1']))

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe('insufficient_stock')
    expect(body.items).toEqual(['p1'])
  })

  it('maps PromoCodeUsageLimitError to 409', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(createServerOrder).mockRejectedValue(new PromoCodeUsageLimitError())

    const res = await POST(makeRequest({ ...VALID_BODY, promoCode: 'WELCOME10' }))

    expect(res.status).toBe(409)
  })

  it('still returns 201 with a warning if the order was created but the status/note write failed', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([CATALOG_PRODUCT] as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never)
    vi.mocked(createServerOrder).mockResolvedValue({ id: '1045', firstName: 'Ivan', lastName: 'Petrov', total: 55, items: [{}], paymentMethod: 'Наличные' } as never)
    txMock.mockRejectedValueOnce(new Error('db hiccup'))

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.order.id).toBe('1045')
    expect(body.warning).toBe('order_saved_status_note_failed')
  })
})
