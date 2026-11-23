import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ permission: vi.fn(), transaction: vi.fn(), audit: vi.fn(), reconcile: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: mocks.permission }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.audit }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/order-bonus', () => ({ ORDER_BONUS_SHORTFALL: 'bonus_shortfall', reconcileOrderBonus: mocks.reconcile }))

import { POST } from './route'

const ORIGIN = 'https://shop.test'
const post = (payload: unknown) => POST(new NextRequest(`${ORIGIN}/api/admin/orders/bonus-shortfall`, {
  method: 'POST', body: JSON.stringify(payload), headers: { origin: ORIGIN },
}))
let exception: { status: string } | null
const tx = {
  $queryRaw: vi.fn(),
  order: { findUnique: vi.fn(async () => ({ id: '1094', firstName: 'A', lastName: 'R' })) },
  orderOperationalException: { findUnique: vi.fn(async () => exception) },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = ORIGIN
  exception = { status: 'open' }
  mocks.permission.mockResolvedValue({ id: 'admin-1' })
  mocks.transaction.mockImplementation(async (run: (t: unknown) => unknown) => run(tx))
})

describe('POST /api/admin/orders/bonus-shortfall', () => {
  it('retries the all-or-nothing debit and reports what is still missing', async () => {
    mocks.reconcile.mockResolvedValue({ applied: { spendRefund: 0, spendRedebit: 0, earn: 0, earnRevoke: 0 }, shortfallPoints: 13 })
    const response = await post({ orderId: '1094' })
    expect(await response.json()).toMatchObject({ ok: true, shortfallPoints: 13 })
    expect(mocks.reconcile).toHaveBeenCalledWith(tx, '1094', { trigger: 'shortfall_retry', actorUserId: 'admin-1' })
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.anything(), expect.anything(), expect.objectContaining({
      action: 'order.bonus_shortfall_retried', after: expect.objectContaining({ exception: 'open', shortfallPoints: 13 }),
    }))
  })

  it('does nothing without an open exception', async () => {
    exception = { status: 'resolved' }
    expect((await post({ orderId: '1094' })).status).toBe(409)
    exception = null
    expect((await post({ orderId: '1094' })).status).toBe(409)
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
