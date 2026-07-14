import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { GET, DELETE } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/media', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('GET /api/admin/media', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('lists assets in the legacy shape without fetching bytes', async () => {
    const created = new Date('2026-07-01T10:00:00Z')
    const updated = new Date('2026-07-02T10:00:00Z')
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([
      { name: '111-pic.png', size: 4, createdAt: created, updatedAt: updated },
    ])

    const res = await GET()
    const body = await res.json()

    expect(body.files).toEqual([
      {
        name: '111-pic.png',
        path: '/api/media/111-pic.png',
        size: 4,
        isImage: true,
        ext: 'png',
        createdAt: created.toISOString(),
        modifiedAt: updated.toISOString(),
      },
    ])

    const arg = vi.mocked(prisma.mediaAsset.findMany as any).mock.calls[0][0]
    expect(arg.select).not.toHaveProperty('data')
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' })
  })
})

describe('DELETE /api/admin/media', () => {
  it('requires at least one name', async () => {
    const res = await DELETE(makeDeleteRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('name_required')
  })

  it('deletes existing names, reports invalid and missing ones as errors', async () => {
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([{ name: 'a.png' }])
    vi.mocked(prisma.mediaAsset.deleteMany as any).mockResolvedValue({ count: 1 })

    const res = await DELETE(
      makeDeleteRequest({ names: ['a.png', '../evil.png', 'missing.png'] })
    )
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual(expect.arrayContaining(['../evil.png', 'missing.png']))
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { name: { in: ['a.png'] } },
    })
  })

  it('supports single-name form', async () => {
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([{ name: 'a.png' }])
    vi.mocked(prisma.mediaAsset.deleteMany as any).mockResolvedValue({ count: 1 })

    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    const body = await res.json()

    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual([])
  })
})
