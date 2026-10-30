import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'

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
  const [brandRows, config, lines, brandsConfig] = await Promise.all([
    prisma.product.findMany({ where: { isDeleted: false }, distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
    getCategoriesConfigFromStore(),
    prisma.brandLine.findMany({ where: { status: 'active' }, select: { id: true, parentId: true, brandKey: true, names: true, depth: true } }),
    getBrandsConfigFromStore(),
  ])
  return NextResponse.json({
    brands: uniqueOptions(brandRows.map((row) => row.brand)),
    categories: config.categories.map((category) => ({ value: category.id, label: category.labels.ru || category.id })),
    subcategories: config.categories.flatMap((category) => category.subcategories.map((subcategory) => ({
      value: subcategory.slug,
      label: `${category.labels.ru || category.id} → ${subcategory.labels.ru || subcategory.slug}`,
    }))),
    brandLines: brandLineOptions(lines, new Map(brandsConfig.brands.map((brand) => [brand.id, brand.name]))),
  })
}

type LineOption = { id: string; parentId: string | null; brandKey: string; names: unknown; depth: number }
type BrandLineOption = { value: string; label: string; parentId: string | null; brandKey: string; brandName: string; depth: number; names: unknown }

// Brand, then each line followed by its children, labelled with the full path so nesting
// stays visible in a flat searchable list.
function brandLineOptions(lines: LineOption[], brandNames: Map<string, string>): BrandLineOption[] {
  const name = (line: LineOption): string => {
    const names = (line.names ?? {}) as Record<string, string | undefined>
    return names.ru || names.default || names.lv || names.en || line.id
  }
  const children = new Map<string | null, LineOption[]>()
  for (const line of lines) children.set(line.parentId, [...(children.get(line.parentId) ?? []), line])
  for (const list of children.values()) list.sort((a, b) => name(a).localeCompare(name(b), 'ru-RU'))
  const out: BrandLineOption[] = []
  const walk = (line: LineOption, path: string[]): void => {
    const labelPath = [...path, name(line)]
    out.push({ value: line.id, label: labelPath.join(' › '), parentId: line.parentId, brandKey: line.brandKey, brandName: brandNames.get(line.brandKey) ?? line.brandKey, depth: line.depth, names: line.names })
    for (const child of children.get(line.id) ?? []) walk(child, labelPath)
  }
  const roots = (children.get(null) ?? []).sort((a, b) => (brandNames.get(a.brandKey) ?? a.brandKey).localeCompare(brandNames.get(b.brandKey) ?? b.brandKey, 'ru-RU') || name(a).localeCompare(name(b), 'ru-RU'))
  for (const root of roots) walk(root, [brandNames.get(root.brandKey) ?? root.brandKey])
  return out
}
