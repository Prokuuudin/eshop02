import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner } from '@/lib/banners-server-store'
import { getBannerGroups, DEFAULT_GROUP_ID } from '@/lib/banner-groups-store'
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
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as { item: Partial<Banner> }
    const [data, groups] = await Promise.all([readBannersData(), getBannerGroups()])
    const now = new Date().toISOString()

    const item = body.item
    const maxOrder = data.banners.reduce((m, b) => Math.max(m, b.order), 0)
    const groupId = typeof item.groupId === 'string' && groups.some((g) => g.id === item.groupId) ? item.groupId : DEFAULT_GROUP_ID
    const group = groups.find((g) => g.id === groupId) ?? groups.find((g) => g.id === DEFAULT_GROUP_ID)!
    const banner: Banner = {
      id: `banner-${Date.now()}`,
      type: item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : 'sale',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      image: item.image ?? '',
      link: item.link ?? '',
      ctaLabel: item.ctaLabel ?? '',
      ctaStyle: item.ctaStyle ?? 'primary',
      bgColor: item.bgColor ?? '#ffffff',
      textColor: item.textColor ?? 'dark',
      active: item.active ?? true,
      groupId,
      placement: group.displayType,
      zone: group.zone,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    }
    await writeBannersData({ banners: [banner] })
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json(banner)
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
