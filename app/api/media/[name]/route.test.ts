import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mediaFindUniqueMock = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findUnique: mediaFindUniqueMock },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

function call(name: string, range?: string) {
  const req = new NextRequest(`http://localhost/api/media/${encodeURIComponent(name)}`, { headers: range ? { Range: range } : {} })
  return GET(req, { params: Promise.resolve({ name }) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/media/[name]', () => {
  it.each([
    ['bytes=1-2', [2, 3], 'bytes 1-2/5'],
    ['bytes=3-', [4, 5], 'bytes 3-4/5'],
    ['bytes=-2', [4, 5], 'bytes 3-4/5'],
    ['bytes=0-99', [1, 2, 3, 4, 5], 'bytes 0-4/5'],
  ])('serves video range %s for seeking', async (range, expected, contentRange) => {
    mediaFindUniqueMock.mockResolvedValue({ mimeType: 'video/mp4', size: 5, data: new Uint8Array([1, 2, 3, 4, 5]) })
    const res = await call('banner.mp4', range as string)
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe(contentRange)
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe(String(expected.length))
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(expected)
  })
  it.each(['bytes=9-', 'bytes=3-1', 'bytes=-0', 'bytes=-', 'invalid'])('rejects an unavailable video range %s', async (range) => {
    mediaFindUniqueMock.mockResolvedValue({ mimeType: 'video/webm', size: 5, data: new Uint8Array(5) })
    const res = await call('banner.webm', range)
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */5')
  })
  it('rejects path-traversal names', async () => {
    const res = await call('../secret.png')
    expect(res.status).toBe(400)
    expect(prisma.mediaAsset.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing asset', async () => {
    mediaFindUniqueMock.mockResolvedValue(null)
    const res = await call('nope.png')
    expect(res.status).toBe(404)
  })

  it('serves bytes with content-type, nosniff and cache headers', async () => {
    mediaFindUniqueMock.mockResolvedValue({
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
