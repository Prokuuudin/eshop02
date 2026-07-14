import { NextResponse } from 'next/server'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'
import { filterEmptySubcategories } from '@/lib/filter-empty-subcategories'
import { getMergedProducts } from '@/lib/product-overrides-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getCategoriesConfigFromStore()
  const products = await getMergedProducts()
  return NextResponse.json({
    ...config,
    categories: filterEmptySubcategories(config.categories, products)
  })
}
