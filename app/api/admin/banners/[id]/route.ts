import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner } from '@/lib/banners-server-store'
import { removeBannerGroupAssignment } from '@/lib/banner-group-assignment-store'
import { getBannerGroups, DEFAULT_GROUP_ID } from '@/lib/banner-groups-store'
import { prisma } from '@/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as { item: Partial<Banner> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    const idx = data.banners.findIndex((b) => b.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const merged = { ...data.banners[idx], ...body.item, id, updatedAt: now }
    if (body.item.groupId && body.item.groupId !== data.banners[idx].groupId) {
      const groups = await getBannerGroups()
      const group = groups.find((g) => g.id === merged.groupId) ?? groups.find((g) => g.id === DEFAULT_GROUP_ID)!
      merged.placement = group.displayType
      merged.zone = group.zone
      merged.scrollMode = group.scrollMode
    }
    data.banners[idx] = merged
    await writeBannersData({ banners: [merged] })
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json(data.banners[idx])
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    // writeBannersData() only upserts banners present in the array it's given -
    // it never deletes. Deleting the row directly is the only way this
    // actually removes it from Postgres instead of having it reappear on the
    // next reload while staying live on the storefront.
    await prisma.banner.delete({ where: { id } })
    await removeBannerGroupAssignment(id)
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
