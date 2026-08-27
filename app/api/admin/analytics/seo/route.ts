import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { getProductOverrides, type ProductOverride } from '@/lib/product-overrides-store'

type SeoRow = {
  id: string
  title: string
  brand: string
  category: string
  hasMetaTitle: boolean
  hasMetaDesc: boolean
  hasImage: boolean
}

// Same reasoning as /api/admin/analytics/abc and /cohorts: this only needs a
// handful of fields per product to compute completeness flags, so it selects
// those columns directly instead of routing through the full admin product
// list (which carries description/pricing/images payloads irrelevant here).
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('catalog.read')
    if (user instanceof NextResponse) return user

    const [rows, overrides] = await Promise.all([
      prisma.product.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          title: true,
          brand: true,
          category: true,
          metaTitle: true,
          metaDescription: true,
          image: true,
          images: true,
        },
      }),
      getProductOverrides().catch((): Record<string, ProductOverride> => ({})),
    ])

    const products: SeoRow[] = rows.map((p) => {
      const o = overrides[p.id]
      const title = o?.title ?? p.title
      const brand = o?.brand ?? p.brand
      const category = o?.category ?? p.category
      const metaTitle = o?.metaTitle ?? p.metaTitle
      const metaDescription = o?.metaDescription ?? p.metaDescription
      const image = o?.image ?? p.image
      const images = o?.images ?? p.images
      return {
        id: p.id,
        title,
        brand,
        category,
        hasMetaTitle: Boolean(metaTitle?.trim()),
        hasMetaDesc: Boolean(metaDescription?.trim()),
        hasImage: Boolean(image?.trim() || (images?.length ?? 0) > 0),
      }
    })

    return NextResponse.json({ products })
  } catch (e) {
    logApiError('[admin/analytics/seo GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
