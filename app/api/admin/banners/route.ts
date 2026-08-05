import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { readBannersData, writeBannersData, type Banner } from '@/lib/banners-server-store'
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
    const body = (await request.json()) as { item: Partial<Banner> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    const item = body.item
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
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
