import { PRODUCTS } from '@/data/products'
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

/**
 * Get products filtered by category
 * @param category Category name or undefined for all
 * @returns Filtered products
 */
export function getCatalogItems(category?: string): CatalogItem[] {
  return PRODUCTS.filter(p => !category || p.category === category).map(p => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    sku: p.sku,
    image: p.image,
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice,
    rating: p.rating,
    stock: p.stock,
    description: p.description,
    technicalSpecs: p.technicalSpecs,
    certificates: p.certificates,
    bulkPricingTiers: p.bulkPricingTiers,
    compatibleEquipment: p.compatibleEquipment
  }))
}

/**
 * Format catalog data for display
 */
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

/**
 * Get all unique categories from products
 */
export function getCatalogCategories(): string[] {
  return Array.from(new Set(PRODUCTS.map(p => p.category)))
}

/**
 * Generate CSV catalog data (for export)
 * @param items Products to export
 * @param role Customer role for pricing
 * @returns CSV string
 */
export function generateCsvCatalog(
  items: CatalogItem[],
  locale: string
): string {
  const formatted = formatCatalogForDisplay(items, locale)
  
  // CSV headers
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

/**
 * Generate structured catalog data for PDF/JSON export
 * @param items Products to include
 * @param role Customer role
 * @returns Structured catalog object
 */
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

/**
 * Search products in catalog
 * @param query Search query
 * @param items Items to search in
 * @returns Matching items
 */
export function searchCatalog(query: string, items: CatalogItem[] = getCatalogItems()): CatalogItem[] {
  const q = query.toLowerCase()
  return items.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.brand.toLowerCase().includes(q) ||
    item.sku?.toLowerCase().includes(q) ||
    item.category.toLowerCase().includes(q)
  )
}

/**
 * Get featured products for catalog cover
 * @returns Top-rated products
 */
export function getFeaturedProducts(limit = 6): CatalogItem[] {
  return getCatalogItems()
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
}
