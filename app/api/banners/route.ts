import { NextRequest, NextResponse } from 'next/server'
import { readBannersData } from '@/lib/banners-server-store'
import { sanitizeStoredLink } from '@/lib/safe-link'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const data = await readBannersData()
  return NextResponse.json({
    banners: data.banners
      .filter((b) => b.active && (!type || b.type === type))
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ ...b, link: sanitizeStoredLink(b.link) })),
    blocks: data.blocks
      .filter((b) => b.active)
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ ...b, link: sanitizeStoredLink(b.link) }))
  })
}
