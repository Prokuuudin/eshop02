import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner } from '@/lib/banners-server-store'
import { revalidatePath } from 'next/cache'

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
    const data = await readBannersData()

    const bannerIdx = data.banners.findIndex((b) => b.id === id)
    if (bannerIdx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    data.banners.splice(bannerIdx, 1)
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
