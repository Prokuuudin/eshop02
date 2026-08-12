import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from "@/lib/server-auth"
import { revalidatePath, revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'
import type { BrandsConfigPayload } from '@/lib/brands-config'
import { getBrandsConfigFromStore, saveBrandsConfigToStore } from '@/lib/brands-server-store'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getBrandsConfigFromStore()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const payload = (await request.json()) as Partial<BrandsConfigPayload>
    const saved = await prisma.$transaction(async (tx) => {
      const before = await getBrandsConfigFromStore(tx)
      const after = await saveBrandsConfigToStore(payload, tx)
      await appendServerAudit(tx, request, actor, { action: 'catalog.brands_updated', entityType: 'setting', entityId: 'brands-config', before, after })
      return after
    })

    revalidatePath('/')
    revalidatePath('/catalog')
    revalidatePath('/brand')
    revalidatePath('/admin/brands')
    revalidateTag(STOREFRONT_CACHE_TAGS.brands, 'max')

    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_brands' }, { status: 400 })
  }
}
