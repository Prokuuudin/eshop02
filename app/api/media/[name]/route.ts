import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!safeName(name)) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
  }

  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { name } })
    if (!asset) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return new NextResponse(Buffer.from(asset.data), {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_serve' }, { status: 500 })
  }
}
