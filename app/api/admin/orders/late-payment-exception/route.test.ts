import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, transactionMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))

import { POST } from './route'

const ORIGIN = 'https://shop.test'
const REASON = 'GrinS snapshot restored 2 units; customer confirmed delivery'
const post = (body: unknown, origin: string | null = ORIGIN) => POST(new NextRequest(`${ORIGIN}/api/admin/orders/late-payment-exception`, {
  method: 'POST', body: JSON.stringify(body), headers: origin ? { origin } : {},
}))

type Row = { paymentStatus: string; stockReservationStatus: string; stockReleasedAt: Date | null }

function txFor(options: { order?: Partial<Row> | null; exception?: 'open' | 'resolved' | null; stock?: number } = {}) {
  const row = options.order === null ? null : {
    id: 'o1', firstName: 'Late', lastName: 'Buyer', items: [{ id: 'p1', quantity: 2 }],
    paymentStatus: 'paid', stockReservationStatus: 'released', stockReleasedAt: new Date() as Date | null, ...options.order,
  }
  const exception = options.exception === null ? null : { id: 'ex1', status: options.exception ?? 'open' } as Record<string, unknown>
  const stock = options.stock ?? 5
  return {
    row, exception,
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async () => row),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Record<string, unknown> }) => {
        if (!row || row.paymentStatus !== where.paymentStatus || row.stockReservationStatus !== where.stockReservationStatus) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      }),
    },
    orderOperationalException: {
      findUnique: vi.fn(async () => exception),
      updateMany: vi.fn(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
        if (!exception || exception.status !== where.status) return { count: 0 }
        Object.assign(exception, data)
        return { count: 1 }
      }),
    },
    product: {
      findMany: vi.fn(async () => [{ id: 'p1', stock, externalId: 'S1', grinsStock: stock }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    stockAllocation: { create: vi.fn() },
  }
}

describe.each([['ON', 'true'], ['OFF', 'false']])('POST /api/admin/orders/late-payment-exception (Stock Ledger %s)', (mode, flag) => {
  let row: ReturnType<typeof txFor>['row']
  let tx: ReturnType<typeof txFor>
  const use = (options: Parameters<typeof txFor>[0] = {}) => {
    tx = txFor(options)
    row = tx.row
    transactionMock.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GRINS_STOCK_LEDGER_ENABLED', flag)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
    permissionMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' })
    use()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('requires the admin-only orders.refund permission before reading the body', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post({ orderId: 'o1', reason: REASON })).status).toBe(403)
    expect(permissionMock).toHaveBeenCalledWith('orders.refund')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('rejects a cross-origin request', async () => {
    expect((await post({ orderId: 'o1', reason: REASON }, 'https://evil.test')).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ orderId: 'o1' }],
    [{ orderId: 'o1', reason: '   short  ' }],
    [{ orderId: 'o1', reason: REASON, resolution: 'ship_anyway' }],
  ])('requires a meaningful reason and accepts no override fields: %j', async (body) => {
    expect((await post(body)).status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('re-holds the stock, closes the exception with actor and time, and audits the reason', async () => {
    const response = await post({ orderId: 'o1', reason: REASON })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, resolution: 'stock_reheld' })
    expect(tx.$executeRaw).toHaveBeenCalledBefore(tx.$queryRaw)
    expect(row).toMatchObject({ stockReservationStatus: 'committed', stockReleasedAt: null })
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { decrement: 2 } } }))
    if (mode === 'ON') expect(tx.stockAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o1', status: 'committed', quantity: 2 }) })
    else expect(tx.stockAllocation.create).not.toHaveBeenCalled()
    expect(tx.exception).toMatchObject({ status: 'resolved', resolvedBy: 'admin-1', resolvedAt: expect.any(Date) })
    expect(auditMock).toHaveBeenCalledOnce()
    expect(auditMock).toHaveBeenCalledWith(tx, expect.anything(), expect.objectContaining({ id: 'admin-1' }), expect.objectContaining({
      action: 'order.late_payment_exception_resolved', entityId: 'o1', reason: REASON,
      after: expect.objectContaining({ resolution: 'stock_reheld', resolvedBy: 'admin-1', exceptionId: 'ex1' }),
    }))
  })

  it('changes nothing while the stock is still short', async () => {
    use({ stock: 1 })
    const response = await post({ orderId: 'o1', reason: REASON })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'insufficient_stock', productIds: ['p1'] })
    expect(tx.product.updateMany).not.toHaveBeenCalled()
    expect(tx.stockAllocation.create).not.toHaveBeenCalled()
    expect(row).toMatchObject({ stockReservationStatus: 'released' })
    expect(tx.exception).toMatchObject({ status: 'open' })
    expect(auditMock).not.toHaveBeenCalled()
  })

  it.each([
    ['missing order', { order: null }, 404, 'order_not_found'],
    ['no exception', { exception: null }, 409, 'no_open_exception'],
    ['already resolved', { exception: 'resolved' as const }, 409, 'no_open_exception'],
    ['unpaid order', { order: { paymentStatus: 'unpaid' } }, 409, 'order_not_paid'],
    ['stock already held', { order: { stockReservationStatus: 'committed' } }, 409, 'order_stock_not_released'],
  ])('refuses %s without touching stock or audit', async (_name, options, status, error) => {
    use(options as Parameters<typeof txFor>[0])
    const response = await post({ orderId: 'o1', reason: REASON })

    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ error })
    expect(tx.product.findMany).not.toHaveBeenCalled()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })
})
