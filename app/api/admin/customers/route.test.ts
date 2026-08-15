import { describe, it, expect, vi, beforeEach } from 'vitest'

const { orderFindManyMock, userFindManyMock, getServerUserMock } = vi.hoisted(() => ({
  orderFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  getServerUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: orderFindManyMock },
    user: { findMany: userFindManyMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

beforeEach(() => {
  vi.clearAllMocks()
  userFindManyMock.mockResolvedValue([])
})

describe('GET /api/admin/customers', () => {
  it('rejects non-admins', async () => {
    getServerUserMock.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(403)
    expect(orderFindManyMock).not.toHaveBeenCalled()
  })

  it('rejects authenticated non-admin users', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', platformRole: 'customer' })

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('does not cap the order history it aggregates over (no `take`)', async () => {
    getServerUserMock.mockResolvedValue(ADMIN_USER)
    orderFindManyMock.mockResolvedValue([])

    await GET()

    const callArgs = orderFindManyMock.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('take')
  })

  it('keeps a customer whose only order is old in the aggregation (feeds the "Неактивный" segment)', async () => {
    getServerUserMock.mockResolvedValue(ADMIN_USER)
    // Simulate the old bug: this order would have been pushed past a take:2000
    // cutoff by thousands of newer, unrelated orders. With the cap removed it
    // must still show up so the inactive-customer segment can find it.
    orderFindManyMock.mockResolvedValue([
      {
        email: 'dormant@example.com',
        firstName: 'Dormant',
        lastName: 'Customer',
        total: 42,
        createdAt: daysAgo(400),
      },
    ])

    const res = await GET()
    const body = (await res.json()) as { customers: Array<{ email: string; totalOrders: number; lastOrderDate: string | null }>; total: number }

    expect(body.total).toBe(1)
    const customer = body.customers.find((c) => c.email === 'dormant@example.com')
    expect(customer).toBeDefined()
    expect(customer!.totalOrders).toBe(1)
    expect(customer!.lastOrderDate).not.toBeNull()
    // Sanity check the fixture is actually old enough to land in the
    // "Неактивный" (>180 days) segment definition used by the consuming page.
    const daysSince = (Date.now() - new Date(customer!.lastOrderDate!).getTime()) / 86_400_000
    expect(daysSince).toBeGreaterThan(180)
  })

  it('collapses the same person checking out with different email casing into one row', async () => {
    getServerUserMock.mockResolvedValue(ADMIN_USER)
    orderFindManyMock.mockResolvedValue([
      {
        email: 'Foo@Bar.com',
        firstName: 'Foo',
        lastName: 'Bar',
        total: 30,
        createdAt: daysAgo(1),
      },
      {
        email: 'foo@bar.com',
        firstName: 'Foo',
        lastName: 'Bar',
        total: 20,
        createdAt: daysAgo(10),
      },
    ])

    const res = await GET()
    const body = (await res.json()) as { customers: Array<{ email: string; totalOrders: number; totalSpent: number }>; total: number }

    expect(body.total).toBe(1)
    expect(body.customers).toHaveLength(1)
    expect(body.customers[0].totalOrders).toBe(2)
    expect(body.customers[0].totalSpent).toBe(50)
    // Display casing preserved from the first-seen (most recent, since orders
    // are queried desc) occurrence rather than being silently lowercased.
    expect(body.customers[0].email).toBe('Foo@Bar.com')
  })

  it('still queries registered users case-insensitively and applies the display name to the normalized row', async () => {
    getServerUserMock.mockResolvedValue(ADMIN_USER)
    orderFindManyMock.mockResolvedValue([
      { email: 'MIXED@Case.com', firstName: 'Guest', lastName: 'Name', total: 10, createdAt: daysAgo(1) },
    ])
    userFindManyMock.mockResolvedValue([{ email: 'mixed@case.com', name: 'Real Name' }])

    const res = await GET()
    const body = (await res.json()) as { customers: Array<{ email: string; firstName: string; lastName: string }> }

    expect(userFindManyMock).toHaveBeenCalledWith({
      where: { email: { in: ['mixed@case.com'], mode: 'insensitive' } },
      select: { email: true, name: true },
    })
    expect(body.customers[0].firstName).toBe('Real')
    expect(body.customers[0].lastName).toBe('Name')
  })
})
