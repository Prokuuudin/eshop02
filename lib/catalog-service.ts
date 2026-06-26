import { getMergedProducts } from '@/lib/product-overrides-store'
import { getDisplayPrice } from '@/lib/customer-segmentation'
import { formatEuro } from '@/lib/utils'

export interface CatalogItem {
  id: string
  title: string
  brand: string
  sku?: string
  image: string
  category: string
  price: number
  oldPrice?: number
  rating: number
  stock: number
  description?: string
  technicalSpecs?: Record<string, string>
  certificates?: string[]
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
  compatibleEquipment?: string[]
}

export async function getCatalogItems(category?: string): Promise<CatalogItem[]> {
  const products = await getMergedProducts()
  return products.filter(p => !category || p.category === category).map(p => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    sku: p.sku,
    image: p.image || '',
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice,
    rating: p.rating,
    stock: p.stock,
    description: p.description,
    technicalSpecs: p.technicalSpecs
      ? Object.fromEntries(Object.entries(p.technicalSpecs).filter(([key]) => key !== '__variantGroupsJson'))
      : p.technicalSpecs,
    certificates: p.certificates,
    bulkPricingTiers: p.bulkPricingTiers,
    compatibleEquipment: p.compatibleEquipment
  }))
}

export function formatCatalogForDisplay(
  items: CatalogItem[],
  locale: string
): Array<CatalogItem & { displayPrice: string; displayOldPrice?: string }> {
  return items.map(item => ({
    ...item,
    displayPrice: formatEuro(getDisplayPrice(item.price), locale),
    displayOldPrice: item.oldPrice
      ? formatEuro(getDisplayPrice(item.oldPrice), locale)
      : undefined
  }))
}

export async function getCatalogCategories(): Promise<string[]> {
  const products = await getMergedProducts()
  return Array.from(new Set(products.map(p => p.category)))
}

export function generateCsvCatalog(
  items: CatalogItem[],
  locale: string
): string {
  const formatted = formatCatalogForDisplay(items, locale)

  const headers = ['ID', 'Название', 'Бренд', 'SKU', 'Цена', 'Старая цена', 'Категория', 'Рейтинг', 'В наличии']

  const rows = formatted.map(item => [
    item.id,
    `"${item.title}"`,
    item.brand,
    item.sku || '—',
    item.displayPrice,
    item.displayOldPrice || '—',
    item.category,
    item.rating.toFixed(1),
    item.stock
  ])

  return [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')
}

export function generateStructuredCatalog(
  items: CatalogItem[],
  locale: string
) {
  const formatted = formatCatalogForDisplay(items, locale)
  const byCategory = new Map<string, typeof formatted>()

  formatted.forEach(item => {
    if (!byCategory.has(item.category)) {
      byCategory.set(item.category, [])
    }
    byCategory.get(item.category)!.push(item)
  })

  return {
    generatedAt: new Date().toISOString(),
    version: '1.0',
    locale,
    totalItems: formatted.length,
    categories: Object.fromEntries(byCategory)
  }
}

export async function searchCatalog(query: string, items?: CatalogItem[]): Promise<CatalogItem[]> {
  if (items) {
    const q = query.toLowerCase()
    return items.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    )
  }

  if (!query || query.trim().length < 2) return getCatalogItems()

  const { prisma } = await import('@/lib/prisma')
  type Row = { id: string; title: string; brand: string; price: number; oldPrice: number | null; image: string | null; category: string; stock: number; sku: string | null; description: string | null }
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, title, brand, price, "oldPrice", image, category, stock, sku, description
     FROM "Product"
     WHERE "isDeleted" = false
       AND "isActive" = true
       AND similarity(
             COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(sku,''),
             $1
           ) > 0.1
     ORDER BY similarity(
               COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(sku,''),
               $1
             ) DESC
     LIMIT 50`,
    query
  )

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    brand: row.brand,
    sku: row.sku ?? undefined,
    image: row.image ?? '',
    category: row.category,
    price: row.price,
    oldPrice: row.oldPrice ?? undefined,
    rating: 0,
    stock: row.stock,
    description: row.description ?? undefined,
  }))
}

export async function getFeaturedProducts(limit = 6): Promise<CatalogItem[]> {
  const items = await getCatalogItems()
  return items
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
}
