import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  companyActivityLog: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}))

vi.mock('@/lib/prisma', () => ({ prisma: client }))

import { recordCompanyActivity, getCompanyActivity, getCompanyActivityForAdmin, purgeCompanyActivityOlderThan } from './company-activity-log'

describe('company-activity-log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.companyActivityLog.create.mockResolvedValue({})
    client.companyActivityLog.deleteMany.mockResolvedValue({ count: 0 })
    client.companyActivityLog.findMany.mockResolvedValue([])
  })

  it('records an activity entry and purges entries older than 90 days for that company in the same transaction', async () => {
    await recordCompanyActivity({
      companyId: 'company-a',
      userId: 'user-a',
      userEmail: 'a@example.com',
      action: 'rfq_created',
      details: { rfqId: 'rfq-1' },
    })

    expect(client.$transaction).toHaveBeenCalledTimes(1)
    expect(client.companyActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company-a', userId: 'user-a', action: 'rfq_created' }),
      })
    )
    const purgeArgs = client.companyActivityLog.deleteMany.mock.calls[0][0]
    expect(purgeArgs.where.companyId).toBe('company-a')
    expect(purgeArgs.where.createdAt.lt).toBeInstanceOf(Date)
    const daysAgo = (Date.now() - purgeArgs.where.createdAt.lt.getTime()) / 86_400_000
    expect(daysAgo).toBeGreaterThan(89.9)
    expect(daysAgo).toBeLessThan(90.1)
  })

  it('getCompanyActivity scopes to the given company and caps take at 200', async () => {
    await getCompanyActivity('company-a', 9999)
    expect(client.companyActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company-a' }, take: 200 })
    )
  })

  it('getCompanyActivityForAdmin with no userId returns a global (unfiltered) query', async () => {
    await getCompanyActivityForAdmin({})
    expect(client.companyActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })

  it('getCompanyActivityForAdmin with a userId scopes to that user only', async () => {
    await getCompanyActivityForAdmin({ userId: 'user-a' })
    expect(client.companyActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-a' } })
    )
  })

  it('purgeCompanyActivityOlderThan deletes rows older than the given day count and returns the count', async () => {
    client.companyActivityLog.deleteMany.mockResolvedValueOnce({ count: 7 })
    const count = await purgeCompanyActivityOlderThan(30)
    expect(count).toBe(7)
    const args = client.companyActivityLog.deleteMany.mock.calls[0][0]
    const daysAgo = (Date.now() - args.where.createdAt.lt.getTime()) / 86_400_000
    expect(daysAgo).toBeGreaterThan(29.9)
    expect(daysAgo).toBeLessThan(30.1)
  })
})
