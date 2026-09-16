import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await params

  if (!safeName(name)) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
  }

  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { name } })
    if (!asset) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const bytes = Buffer.from(asset.data)
    const headers: Record<string, string> = {
        'Content-Type': asset.mimeType,
        'Content-Length': String(bytes.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    }
    if (asset.mimeType.startsWith('video/')) {
      headers['Accept-Ranges'] = 'bytes'
      const range = request.headers.get('range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
        const size = bytes.length
        let start = 0
        let end = size - 1
        let valid = Boolean(match && (match[1] || match[2]) && size > 0)
        if (match && valid) {
          if (!match[1]) {
            const suffix = Number(match[2])
            valid = Number.isSafeInteger(suffix) && suffix > 0
            start = Math.max(0, size - suffix)
          } else {
            start = Number(match[1])
            const requestedEnd = match[2] ? Number(match[2]) : size - 1
            valid = Number.isSafeInteger(start) && Number.isSafeInteger(requestedEnd) && start < size && requestedEnd >= start
            end = Math.min(requestedEnd, size - 1)
          }
        }
        if (!valid) {
          return new NextResponse(null, { status: 416, headers: {
            'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes',
          } })
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`
        headers['Content-Length'] = String(end - start + 1)
        return new NextResponse(bytes.subarray(start, end + 1), { status: 206, headers })
      }
    }
    return new NextResponse(bytes, { status: 200, headers })
  } catch {
    return NextResponse.json({ error: 'failed_to_serve' }, { status: 500 })
  }
}
