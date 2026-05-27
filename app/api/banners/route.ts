import { NextResponse } from 'next/server'
import { readBannersData } from '@/lib/banners-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const data = await readBannersData()
  return NextResponse.json({
    banners: data.banners.filter((b) => b.active).sort((a, b) => a.order - b.order),
    blocks: data.blocks.filter((b) => b.active).sort((a, b) => a.order - b.order)
  })
}
