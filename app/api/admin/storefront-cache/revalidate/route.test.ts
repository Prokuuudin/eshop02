import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
vi.mock('server-only', () => ({}))

const appendServerAuditMock = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({}) } }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: appendServerAuditMock }))

import { revalidatePath, revalidateTag } from 'next/cache'
import { requireAdminPermission } from '@/lib/server-auth'
import { POST } from './route'

const call = () => POST(new NextRequest('http://localhost/api/admin/storefront-cache/revalidate', { method: 'POST' }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' } as never)
})

describe('POST /api/admin/storefront-cache/revalidate', () => {
  it('requires catalog.update and does nothing otherwise', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await call()).status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('catalog.update')
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('expires every product storefront cache immediately and the /[lang] pages, with an audit entry', async () => {
    expect((await call()).status).toBe(200)
    for (const tag of ['storefront-bestsellers', 'storefront-sale-products', 'storefront-categories', 'storefront-brands']) {
      expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
    }
    expect(revalidatePath).toHaveBeenCalledWith('/[lang]', 'layout')
    expect(appendServerAuditMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ action: 'storefront.cache_revalidated' }))
  })
})
