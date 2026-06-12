import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner, type ContentBlock } from '@/lib/banners-server-store'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as { kind: 'banner' | 'block'; item: Partial<Banner | ContentBlock> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    if (body.kind === 'banner') {
      const idx = data.banners.findIndex((b) => b.id === id)
      if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      data.banners[idx] = { ...data.banners[idx], ...(body.item as Partial<Banner>), id, updatedAt: now }
      await writeBannersData(data)
      revalidatePath('/')
      return NextResponse.json(data.banners[idx])
    }

    const idx = data.blocks.findIndex((b) => b.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    data.blocks[idx] = { ...data.blocks[idx], ...(body.item as Partial<ContentBlock>), id, updatedAt: now }
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json(data.blocks[idx])
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = await _request.json().catch(() => ({})) as { kind?: 'banner' | 'block' }
    const data = await readBannersData()

    const bannerIdx = data.banners.findIndex((b) => b.id === id)
    if (bannerIdx !== -1 && body.kind !== 'block') {
      data.banners.splice(bannerIdx, 1)
      await writeBannersData(data)
      revalidatePath('/')
      return NextResponse.json({ ok: true })
    }

    const blockIdx = data.blocks.findIndex((b) => b.id === id)
    if (blockIdx !== -1) {
      data.blocks.splice(blockIdx, 1)
      await writeBannersData(data)
      revalidatePath('/')
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
