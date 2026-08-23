import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'

export const runtime = 'nodejs'

function uniqueOptions(values: string[]): { value: string; label: string }[] {
  const unique = new Map<string, string>()
  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue
    const key = value.toLocaleLowerCase('ru-RU')
    if (!unique.has(key)) unique.set(key, value)
  }
  return [...unique.values()]
    .sort((a, b) => a.localeCompare(b, 'ru-RU'))
    .map((value) => ({ value, label: value }))
}

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor
  const [brandRows, config] = await Promise.all([
    prisma.product.findMany({ where: { isDeleted: false }, distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
    getCategoriesConfigFromStore(),
  ])
  return NextResponse.json({
    brands: uniqueOptions(brandRows.map((row) => row.brand)),
    categories: config.categories.map((category) => ({ value: category.id, label: category.labels.ru || category.id })),
    subcategories: config.categories.flatMap((category) => category.subcategories.map((subcategory) => ({
      value: subcategory.slug,
      label: `${category.labels.ru || category.id} → ${subcategory.labels.ru || subcategory.slug}`,
    }))),
  })
}
