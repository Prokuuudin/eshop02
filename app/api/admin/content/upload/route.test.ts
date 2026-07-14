import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { create: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
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
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/content/upload', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await POST(makeRequest(new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(403)
    expect(prisma.mediaAsset.create).not.toHaveBeenCalled()
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
    vi.mocked(prisma.mediaAsset.create as any).mockResolvedValue({})
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'My Photo.PNG', { type: 'image/png' })

    const res = await POST(makeRequest(file))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.path).toMatch(/^\/api\/media\/\d+-my-photo\.png$/)
    expect(body.originalName).toBe('My Photo.PNG')
    expect(body.size).toBe(4)
    expect(body.mimeType).toBe('image/png')

    const createArg = vi.mocked(prisma.mediaAsset.create as any).mock.calls[0][0]
    expect(createArg.data.name).toMatch(/^\d+-my-photo\.png$/)
    expect(createArg.data.mimeType).toBe('image/png')
    expect(createArg.data.size).toBe(4)
    expect(Array.from(createArg.data.data)).toEqual([1, 2, 3, 4])
  })
})
