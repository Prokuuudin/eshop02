import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mediaFindManyMock, deleteMediaAssetsMock, requireAdminMock } = vi.hoisted(() => ({
  mediaFindManyMock: vi.fn(),
  deleteMediaAssetsMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findMany: mediaFindManyMock },
  },
}))
vi.mock('@/lib/media-asset-store', () => ({ deleteMediaAssets: deleteMediaAssetsMock }))
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

  it('rejects non-admins before touching the store', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    expect(res.status).toBe(403)
    expect(deleteMediaAssetsMock).not.toHaveBeenCalled()
  })

  it('deletes existing names, reports invalid and missing ones as errors', async () => {
    deleteMediaAssetsMock.mockResolvedValue(['a.png'])

    const res = await DELETE(
      makeDeleteRequest({ names: ['a.png', '../evil.png', 'missing.png'] })
    )
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual(expect.arrayContaining(['../evil.png', 'missing.png']))
    expect(body.errors).toEqual(['../evil.png', 'missing.png'])
    const [names, auditContext] = deleteMediaAssetsMock.mock.calls[0] as [string[], { actor: unknown; request: unknown }]
    expect(names).toEqual(['a.png', 'missing.png'])
    expect(auditContext.actor).toBe(ADMIN_USER)
    expect(auditContext.request).toBeInstanceOf(NextRequest)
  })

  it('reports an already deleted file as an error with deleted: 0', async () => {
    deleteMediaAssetsMock.mockResolvedValue([])
    const body = await (await DELETE(makeDeleteRequest({ name: 'a.png' }))).json()
    expect(body).toEqual({ ok: true, deleted: 0, errors: ['a.png'] })
  })

  it('does not call the store when every name is invalid', async () => {
    const body = await (await DELETE(makeDeleteRequest({ names: ['../x.png'] }))).json()
    expect(body).toEqual({ ok: true, deleted: 0, errors: ['../x.png'] })
    expect(deleteMediaAssetsMock).not.toHaveBeenCalled()
  })

  it('returns the existing 500 contract when the delete or its audit fails', async () => {
    deleteMediaAssetsMock.mockRejectedValue(new Error('audit unavailable'))
    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('failed_to_delete')
  })

  it('supports single-name form', async () => {
    deleteMediaAssetsMock.mockResolvedValue(['a.png'])

    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    const body = await res.json()

    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual([])
  })
})
