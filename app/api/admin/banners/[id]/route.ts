import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { deleteAdminBanner, updateAdminBanner, type Banner } from '@/lib/banners-server-store'
import { revalidatePath, revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const body = (await request.json()) as { item: Partial<Banner> }
    const result = await updateAdminBanner(id, body.item, { actor, request })
    if (result.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json(result.banner)
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const { id } = await params
    const result = await deleteAdminBanner(id, { actor, request })
    if (result.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    revalidatePath('/[lang]', 'layout')
    revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
