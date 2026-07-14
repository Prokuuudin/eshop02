import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(name: string | null, file: File | null): NextRequest {
  const fd = new FormData()
  if (name !== null) fd.set('name', name)
  if (file) fd.set('file', file)
  return new NextRequest('http://localhost/api/admin/media/replace', {
    method: 'POST',
    body: fd,
    // undici требует duplex при теле-стриме
    duplex: 'half',
  } as any)
}

const PNG = () => new File([new Uint8Array([9, 8, 7])], 'new.png', { type: 'image/png' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/media/replace', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await POST(makeRequest('a.png', PNG()))
    expect(res.status).toBe(403)
  })

  it('rejects invalid names', async () => {
    const res = await POST(makeRequest('../evil.png', PNG()))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_filename')
  })

  it('requires a file', async () => {
    const res = await POST(makeRequest('a.png', null))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_required')
  })

  it('rejects SVG', async () => {
    const svg = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' })
    const res = await POST(makeRequest('a.png', svg))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_type')
  })

  it('returns 404 when the asset does not exist', async () => {
    vi.mocked(prisma.mediaAsset.update as any).mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' })
    )
    const res = await POST(makeRequest('missing.png', PNG()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it('updates bytes in place keeping the same name and path', async () => {
    vi.mocked(prisma.mediaAsset.update as any).mockResolvedValue({})

    const res = await POST(makeRequest('123-pic.png', PNG()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, path: '/api/media/123-pic.png' })

    const arg = vi.mocked(prisma.mediaAsset.update as any).mock.calls[0][0]
    expect(arg.where).toEqual({ name: '123-pic.png' })
    expect(arg.data.mimeType).toBe('image/png')
    expect(arg.data.size).toBe(3)
    expect(Array.from(arg.data.data)).toEqual([9, 8, 7])
  })
})
