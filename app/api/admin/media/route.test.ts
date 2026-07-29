import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mediaFindManyMock, mediaDeleteManyMock, requireAdminMock } = vi.hoisted(() => ({
  mediaFindManyMock: vi.fn(),
  mediaDeleteManyMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findMany: mediaFindManyMock, deleteMany: mediaDeleteManyMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: requireAdminMock,
}))

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
  requireAdminMock.mockResolvedValue(ADMIN_USER)
})

describe('GET /api/admin/media', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('lists assets in the legacy shape without fetching bytes', async () => {
    const created = new Date('2026-07-01T10:00:00Z')
    const updated = new Date('2026-07-02T10:00:00Z')
    mediaFindManyMock.mockResolvedValue([
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

    const arg = mediaFindManyMock.mock.calls[0][0] as {
      select: Record<string, unknown>
      orderBy: { updatedAt: string }
    }
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
    mediaFindManyMock.mockResolvedValue([{ name: 'a.png' }])
    mediaDeleteManyMock.mockResolvedValue({ count: 1 })

    const res = await DELETE(
      makeDeleteRequest({ names: ['a.png', '../evil.png', 'missing.png'] })
    )
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual(expect.arrayContaining(['../evil.png', 'missing.png']))
    expect(mediaDeleteManyMock).toHaveBeenCalledWith({
      where: { name: { in: ['a.png'] } },
    })
  })

  it('supports single-name form', async () => {
    mediaFindManyMock.mockResolvedValue([{ name: 'a.png' }])
    mediaDeleteManyMock.mockResolvedValue({ count: 1 })

    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    const body = await res.json()

    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual([])
  })
})
