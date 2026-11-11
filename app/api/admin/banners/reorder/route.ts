import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/server-auth'
import { reorderAdminBanner } from '@/lib/banners-server-store'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

const moveSchema = z.object({ id: z.string().min(1), direction: z.enum(['up', 'down']) })

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const parsed = moveSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_move' }, { status: 400 })
    const { id, direction } = parsed.data
    const result = await reorderAdminBanner(id, direction, { actor, request })
    if (result === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (result === 'moved') {
      revalidateTag(STOREFRONT_CACHE_TAGS.banners, { expire: 0 })
      revalidatePath('/[lang]', 'layout')
    }
    return NextResponse.json({ ok: true, moved: result === 'moved' })
  } catch {
    return NextResponse.json({ error: 'failed_to_reorder' }, { status: 500 })
  }
}
