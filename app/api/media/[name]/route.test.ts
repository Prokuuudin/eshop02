import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

function call(name: string) {
  const req = new NextRequest(`http://localhost/api/media/${encodeURIComponent(name)}`)
  return GET(req, { params: Promise.resolve({ name }) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/media/[name]', () => {
  it('rejects path-traversal names', async () => {
    const res = await call('../secret.png')
    expect(res.status).toBe(400)
    expect(prisma.mediaAsset.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing asset', async () => {
    vi.mocked(prisma.mediaAsset.findUnique as any).mockResolvedValue(null)
    const res = await call('nope.png')
    expect(res.status).toBe(404)
  })

  it('serves bytes with content-type, nosniff and cache headers', async () => {
    vi.mocked(prisma.mediaAsset.findUnique as any).mockResolvedValue({
      name: '123-pic.png',
      mimeType: 'image/png',
      size: 3,
      data: new Uint8Array([1, 2, 3]),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await call('123-pic.png')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
    )
    const body = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(body)).toEqual([1, 2, 3])
  })
})
