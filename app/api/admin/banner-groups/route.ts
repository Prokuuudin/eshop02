import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/server-auth'
import { getBannerGroups, saveBannerGroups, BANNER_ZONES } from '@/lib/banner-groups-store'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  zone: z.enum(BANNER_ZONES),
  displayType: z.enum(['list', 'carousel']),
  scrollMode: z.enum(['manual', 'auto']),
  order: z.number(),
})
const groupsSchema = z.object({ groups: z.array(groupSchema) })

export async function GET(): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const groups = await getBannerGroups()
  return NextResponse.json({ groups })
}

export async function PUT(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  const parsed = groupsSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_groups' }, { status: 400 })

  const groups = await saveBannerGroups(parsed.data.groups)
  revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
  revalidatePath('/[lang]', 'layout')
  return NextResponse.json({ groups })
}
