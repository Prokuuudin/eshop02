import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner } from '@/lib/banners-server-store'
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
    data.banners[idx] = { ...data.banners[idx], ...body.item, id, updatedAt: now }
    await writeBannersData(data)
    revalidatePath('/')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, 'max')
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
    revalidatePath('/')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, 'max')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
