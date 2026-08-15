import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/company-activity-log', () => ({ getCompanyActivityForAdmin: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/prisma', () => {
  const client = {
    companyActivityLog: { deleteMany: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  }
  return { prisma: client }
})

import { requireAdminPermission } from '@/lib/server-auth'
import { getCompanyActivityForAdmin } from '@/lib/company-activity-log'
import { appendServerAudit } from '@/lib/server-audit'
import { prisma } from '@/lib/prisma'
import { GET, DELETE } from './route'

const get = (url = 'https://shop.test/api/admin/company-activity-log') => GET(new NextRequest(url))
const del = (url: string) => DELETE(new NextRequest(url, { method: 'DELETE' }))

describe('GET /api/admin/company-activity-log', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is gated on audit.read', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(getCompanyActivityForAdmin).mockResolvedValue([])
    await get()
    expect(requireAdminPermission).toHaveBeenCalledWith('audit.read')
  })

  it('returns the permission-check response as-is when unauthorized', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 })
    vi.mocked(requireAdminPermission).mockResolvedValue(denied)
    const res = await get()
    expect(res.status).toBe(403)
    expect(getCompanyActivityForAdmin).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/company-activity-log', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects a non-positive olderThanDays without touching the database', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    const res = await del('https://shop.test/api/admin/company-activity-log?olderThanDays=0')
    expect(res.status).toBe(400)
    expect(prisma.companyActivityLog.deleteMany).not.toHaveBeenCalled()
  })

  it('purges old rows and records the action in the real platform audit log', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(prisma.companyActivityLog.deleteMany).mockResolvedValue({ count: 12 })

    const res = await del('https://shop.test/api/admin/company-activity-log?olderThanDays=90')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deletedCount).toBe(12)
    expect(appendServerAudit).toHaveBeenCalledWith(
      prisma, expect.anything(), expect.objectContaining({ id: 'admin-1' }),
      expect.objectContaining({ action: 'company_activity_log.purge' })
    )
  })
})
