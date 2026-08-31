import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mediaCreateMock, requireAdminMock } = vi.hoisted(() => ({
  mediaCreateMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { create: mediaCreateMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: requireAdminMock,
}))

import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(file: File | null): NextRequest {
  const fd = new FormData()
  if (file) fd.set('file', file)
  return new NextRequest('http://localhost/api/admin/content/upload', {
    method: 'POST',
    body: fd,
    // undici требует duplex при теле-стриме
    duplex: 'half',
  } as NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex: 'half' })
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/content/upload', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await POST(makeRequest(new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(403)
    expect(mediaCreateMock).not.toHaveBeenCalled()
  })

  it('requires a file', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_is_required')
  })

  it('rejects SVG (stored XSS)', async () => {
    const svg = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' })
    const res = await POST(makeRequest(svg))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_file_type')
  })

  it('rejects files over 10MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    const res = await POST(makeRequest(big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_too_large')
  })

  it('stores the file in the DB and returns /api/media path', async () => {
    mediaCreateMock.mockResolvedValue({})
    const file = new File([PNG_BYTES], 'My Photo.PNG', { type: 'image/png' })

    const res = await POST(makeRequest(file))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.path).toMatch(/^\/api\/media\/\d+-my-photo\.png$/)
    expect(body.originalName).toBe('My Photo.PNG')
    expect(body.size).toBe(PNG_BYTES.length)
    expect(body.mimeType).toBe('image/png')

    const createArg = mediaCreateMock.mock.calls[0][0] as {
      data: { name: string; mimeType: string; size: number; data: Uint8Array }
    }
    expect(createArg.data.name).toMatch(/^\d+-my-photo\.png$/)
    expect(createArg.data.mimeType).toBe('image/png')
    expect(createArg.data.size).toBe(PNG_BYTES.length)
    expect(Array.from(createArg.data.data)).toEqual(Array.from(PNG_BYTES))
  })

  it('rejects active content disguised with an allowed MIME type', async () => {
    const spoofed = new File(['<script>alert(1)</script>'], 'photo.png', { type: 'image/png' })
    const res = await POST(makeRequest(spoofed))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_file_type')
    expect(mediaCreateMock).not.toHaveBeenCalled()
  })
})
