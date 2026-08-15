import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findFirst: vi.fn() }, order: { findFirst: vi.fn() } },
}))
vi.mock('@/lib/user-erasure', () => ({ exportUserData: vi.fn() }))
vi.mock('@/lib/user-export-pdf', () => ({ createUserExportPdf: vi.fn().mockReturnValue(new ArrayBuffer(4)) }))

import { requireAdminPermission } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { exportUserData } from '@/lib/user-erasure'
import { GET } from './route'

const get = (email: string) => GET(new NextRequest(`https://shop.test/api/admin/customers/export?email=${email}`))

describe('GET /api/admin/customers/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
    vi.mocked(exportUserData).mockResolvedValue({ exportedAt: '2026-08-15T00:00:00.000Z' } as never)
  })

  it('exports a registered customer by their User row', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'user-1', email: 'a@b.com', cardNumber: '1234' } as never)
    const res = await get('a@b.com')
    expect(res.status).toBe(200)
    expect(exportUserData).toHaveBeenCalledWith({ id: 'user-1', email: 'a@b.com' })
    expect(prisma.order.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to a guest export when there is no User row but the email has real orders', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.order.findFirst).mockResolvedValue({ id: 'order-1' } as never)
    const res = await get('guest@b.com')
    expect(res.status).toBe(200)
    expect(exportUserData).toHaveBeenCalledWith({ id: null, email: 'guest@b.com' })
  })

  it('404s when neither a User row nor any order exists for the email', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null)
    const res = await get('nobody@b.com')
    expect(res.status).toBe(404)
    expect(exportUserData).not.toHaveBeenCalled()
  })
})
