import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mediaUpdateMock, requireAdminMock } = vi.hoisted(() => ({
  mediaUpdateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { update: mediaUpdateMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: requireAdminMock,
}))

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
  } as NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex: 'half' })
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7])
const PNG = () => new File([PNG_BYTES], 'new.png', { type: 'image/png' })

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/media/replace', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(
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
    mediaUpdateMock.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' })
    )
    const res = await POST(makeRequest('missing.png', PNG()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it('updates bytes in place keeping the same name and path', async () => {
    mediaUpdateMock.mockResolvedValue({})

    const res = await POST(makeRequest('123-pic.png', PNG()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, path: '/api/media/123-pic.png' })

    const arg = mediaUpdateMock.mock.calls[0][0] as {
      where: { name: string }
      data: { mimeType: string; size: number; data: Uint8Array }
    }
    expect(arg.where).toEqual({ name: '123-pic.png' })
    expect(arg.data.mimeType).toBe('image/png')
    expect(arg.data.size).toBe(PNG_BYTES.length)
    expect(Array.from(arg.data.data)).toEqual(Array.from(PNG_BYTES))
  })

  it('rejects non-image bytes declared as PNG', async () => {
    const spoofed = new File(['<svg onload=alert(1)>'], 'new.png', { type: 'image/png' })
    const res = await POST(makeRequest('123-pic.png', spoofed))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_type')
    expect(mediaUpdateMock).not.toHaveBeenCalled()
  })
})
