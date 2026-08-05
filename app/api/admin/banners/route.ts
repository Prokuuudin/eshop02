import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner, type ContentBlock } from '@/lib/banners-server-store'
import { revalidatePath } from 'next/cache'

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
    const body = (await request.json()) as { kind: 'banner' | 'block'; item: Partial<Banner | ContentBlock> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    if (body.kind === 'banner') {
      const item = body.item as Partial<Banner>
      const maxOrder = data.banners.reduce((m, b) => Math.max(m, b.order), 0)
      const banner: Banner = {
        id: `banner-${Date.now()}`,
        type: 'sale',
        title: item.title ?? '',
        subtitle: item.subtitle ?? '',
        image: item.image ?? '',
        link: item.link ?? '',
        ctaLabel: item.ctaLabel ?? '',
        ctaStyle: item.ctaStyle ?? 'primary',
        bgColor: item.bgColor ?? '#ffffff',
        textColor: item.textColor ?? 'dark',
        active: item.active ?? true,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now
      }
      data.banners.push(banner)
      await writeBannersData(data)
      revalidatePath('/')
      return NextResponse.json(banner)
    }

    const item = body.item as Partial<ContentBlock>
    const maxOrder = data.blocks.reduce((m, b) => Math.max(m, b.order), 0)
    const block: ContentBlock = {
      id: `block-${Date.now()}`,
      type: item.type ?? 'feature',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      content: item.content ?? '',
      icon: item.icon ?? '',
      link: item.link ?? '',
      linkLabel: item.linkLabel ?? '',
      bgColor: item.bgColor ?? '#ffffff',
      active: item.active ?? true,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    }
    data.blocks.push(block)
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json(block)
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
