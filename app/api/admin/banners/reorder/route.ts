import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

const moveSchema = z.object({ id: z.string().min(1), direction: z.enum(['up', 'down']) })

export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const parsed = moveSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid_move' }, { status: 400 })
    const { id, direction } = parsed.data
    const result = await prisma.$transaction(async (tx) => {
      const banners = await tx.banner.findMany({
        orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true },
      })
      const index = banners.findIndex((banner) => banner.id === id)
      if (index === -1) return 'not_found'
      const next = index + (direction === 'up' ? -1 : 1)
      if (next < 0 || next >= banners.length) return 'unchanged'
      ;[banners[index], banners[next]] = [banners[next], banners[index]]
      // Normalize legacy duplicate positions and commit the complete order together.
      for (const [position, banner] of banners.entries()) {
        await tx.banner.update({ where: { id: banner.id }, data: { order: position + 1 } })
      }
      return 'moved'
    }, { isolationLevel: 'Serializable' })
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
