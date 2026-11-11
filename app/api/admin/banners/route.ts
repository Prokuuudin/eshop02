import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { createAdminBanner, readBannersData, type Banner } from '@/lib/banners-server-store'
import { revalidatePath, revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const data = await readBannersData()
  return NextResponse.json(data)
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as { item: Partial<Banner> }
    const banner = await createAdminBanner(body.item, { actor, request })
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json(banner)
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
