import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ permission: vi.fn(), transaction: vi.fn(), audit: vi.fn(), reconcile: vi.fn(), lockUser: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: mocks.permission }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.audit }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/order-bonus', () => ({ reconcileOrderBonus: mocks.reconcile, lockOrderBonusUser: mocks.lockUser }))

import { POST } from './route'

const ORIGIN = 'https://shop.test'
const body = { orderId: '1094', confirmMoneyReturned: true, reason: 'Paysera refund 24.95 EUR done 23.11' }
const post = (payload: unknown, origin: string | null = ORIGIN) => POST(new NextRequest(`${ORIGIN}/api/admin/orders/full-refund`, {
  method: 'POST', body: JSON.stringify(payload), headers: origin ? { origin } : {},
}))

let order: Record<string, unknown> | null
const tx = {
  $queryRaw: vi.fn(),
  order: { findUnique: vi.fn(async () => order), update: vi.fn(async ({ data }: { data: object }) => Object.assign(order!, data)) },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN
  order = { id: '1094', userId: 'u1', firstName: 'A', lastName: 'R', paymentStatus: 'paid', paymentProvider: 'paysera', total: 24.95 }
  mocks.permission.mockResolvedValue({ id: 'admin-1', email: 'admin@test' })
  mocks.transaction.mockImplementation(async (run: (t: unknown) => unknown) => run(tx))
  mocks.reconcile.mockResolvedValue({ applied: { spendRefund: 500, spendRedebit: 0, earn: 0, earnRevoke: 11 }, shortfallPoints: 0 })
})

describe('POST /api/admin/orders/full-refund', () => {
  it('requires orders.refund', async () => {
    mocks.permission.mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post(body)).status).toBe(403)
    expect(mocks.permission).toHaveBeenCalledWith('orders.refund')
  })

  it('requires explicit confirmation that the money was returned and a reason', async () => {
    expect((await post({ ...body, confirmMoneyReturned: false })).status).toBe(400)
    expect((await post({ orderId: '1094', reason: body.reason })).status).toBe(400)
    expect((await post({ ...body, reason: 'short' })).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('marks a paid order refunded, reconciles bonuses and audits in one transaction', async () => {
    const response = await post(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, paymentStatus: 'refunded', bonus: { spendRefund: 500, spendRedebit: 0, earn: 0, earnRevoke: 11, shortfallPoints: 0 } })
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: '1094' }, data: { paymentStatus: 'refunded' } })
    expect(mocks.lockUser).toHaveBeenCalledWith(tx, 'u1')
    expect(mocks.reconcile).toHaveBeenCalledWith(tx, '1094', { trigger: 'full_refund', actorUserId: 'admin-1' })
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.anything(), expect.anything(), expect.objectContaining({
      action: 'order.payment_refunded', before: expect.objectContaining({ paymentStatus: 'paid' }), reason: body.reason,
    }))
  })

  it('refuses unpaid, already refunded and missing orders without changes', async () => {
    order!.paymentStatus = 'unpaid'
    expect(await (await post(body)).json()).toEqual({ error: 'order_not_paid' })
    order!.paymentStatus = 'refunded'
    expect(await (await post(body)).json()).toEqual({ error: 'already_refunded' })
    order = null
    expect((await post(body)).status).toBe(404)
    expect(tx.order.update).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('rejects cross-origin requests', async () => {
    expect((await post(body, 'https://evil.test')).status).toBe(403)
  })
})
