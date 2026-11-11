import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mediaUpdateMock, requireAdminMock } = vi.hoisted(() => ({
  mediaUpdateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/media-asset-store', () => ({
  replaceMediaAsset: mediaUpdateMock,
  mediaPath: (name: string) => `/api/media/${name}`,
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
    expect(mediaUpdateMock).not.toHaveBeenCalled()
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
    mediaUpdateMock.mockResolvedValue('not_found')
    const res = await POST(makeRequest('missing.png', PNG()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it('updates bytes in place keeping the same name and path', async () => {
    mediaUpdateMock.mockResolvedValue('replaced')

    const res = await POST(makeRequest('123-pic.png', PNG()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, path: '/api/media/123-pic.png' })

    const [name, input, auditContext] = mediaUpdateMock.mock.calls[0] as [
      string,
      { mimeType: string; size: number; bytes: Uint8Array },
      { actor: unknown; request: unknown },
    ]
    expect(name).toBe('123-pic.png')
    expect(input.mimeType).toBe('image/png')
    expect(input.size).toBe(PNG_BYTES.length)
    expect(Array.from(input.bytes)).toEqual(Array.from(PNG_BYTES))
    expect(auditContext.actor).toBe(ADMIN_USER)
    expect(auditContext.request).toBeInstanceOf(NextRequest)
  })

  it('answers an unchanged replace with the same success body', async () => {
    mediaUpdateMock.mockResolvedValue('unchanged')
    const res = await POST(makeRequest('123-pic.png', PNG()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, path: '/api/media/123-pic.png' })
  })

  it('returns the existing 500 contract when the replace or its audit fails', async () => {
    mediaUpdateMock.mockRejectedValue(new Error('audit unavailable'))
    const res = await POST(makeRequest('123-pic.png', PNG()))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('replace_failed')
  })

  it('rejects files over 10MB before touching the store', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    const res = await POST(makeRequest('123-pic.png', big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_too_large')
    expect(mediaUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects non-image bytes declared as PNG', async () => {
    const spoofed = new File(['<svg onload=alert(1)>'], 'new.png', { type: 'image/png' })
    const res = await POST(makeRequest('123-pic.png', spoofed))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_type')
    expect(mediaUpdateMock).not.toHaveBeenCalled()
  })
})
