import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

/** Every storefront cache that can carry product prices or product availability. */
const PRODUCT_STOREFRONT_TAGS = [
  'storefront-bestsellers',
  'storefront-sale-products',
  'storefront-categories',
  'storefront-brands',
] as const

/**
 * Drops cached storefront product data immediately. Needed after data changes made
 * outside the Next.js process (ERP FULL sync script, one-off backfills), which cannot
 * call revalidateTag themselves.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    for (const tag of PRODUCT_STOREFRONT_TAGS) revalidateTag(tag, { expire: 0 })
    // ISR pages under /[lang] (catalog, brand, blog) re-render on their next request.
    revalidatePath('/[lang]', 'layout')
    await prisma.$transaction((tx) => appendServerAudit(tx, request, actor, {
      action: 'storefront.cache_revalidated',
      entityType: 'storefront',
      entityId: 'product-caches',
      details: `Revalidated ${PRODUCT_STOREFRONT_TAGS.join(', ')} and /[lang] layout`,
    }))
    return successResponse({ revalidated: [...PRODUCT_STOREFRONT_TAGS, '/[lang] layout'] })
  } catch (error) {
    logApiError('[admin/storefront-cache/revalidate POST]', error)
    return errorResponse('Internal server error', 500)
  }
}
