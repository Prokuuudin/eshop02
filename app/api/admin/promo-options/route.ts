import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor
  const [brandRows, config] = await Promise.all([
    prisma.product.findMany({ where: { isDeleted: false }, distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
    getCategoriesConfigFromStore(),
  ])
  return NextResponse.json({
    brands: brandRows.map((row) => ({ value: row.brand, label: row.brand })),
    categories: config.categories.map((category) => ({ value: category.id, label: category.labels.ru || category.id })),
    subcategories: config.categories.flatMap((category) => category.subcategories.map((subcategory) => ({
      value: subcategory.slug,
      label: `${category.labels.ru || category.id} → ${subcategory.labels.ru || subcategory.slug}`,
    }))),
  })
}
