import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { getMergedProducts } from '@/lib/product-overrides-store'
import type { Product } from '@/data/products'

export const runtime = 'nodejs'

// Ordered columns exported to CSV
const COLUMNS: (keyof Product)[] = [
  'id', 'title', 'titleEn', 'titleLv',
  'brand', 'price', 'oldPrice', 'stock', 'category',
  'sku', 'rating', 'ratingCount', 'image',
  'badges', 'description',
  'specVolume', 'specType', 'specCountry',
  'feature1', 'feature1En', 'feature1Lv',
  'feature2', 'feature2En', 'feature2Lv',
  'feature3', 'feature3En', 'feature3Lv',
  'feature4', 'feature4En', 'feature4Lv',
  'unitOfMeasure', 'packagingSize', 'bonusRate',
  'manufacturerName', 'manufacturerAddress', 'manufacturerEmail',
  'metaTitle', 'metaDescription',
]

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = Array.isArray(value) ? value.join(';') : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const { searchParams } = new URL(req.url)
  const template = searchParams.get('template') === '1'

  const header = COLUMNS.join(',')

  let csvBody: string

  if (template) {
    const example = [
      'product-001', 'Шампунь увлажняющий', 'Moisturizing Shampoo', '',
      'Keune', '12.99', '15.99', '50', 'hair',
      'KN-001', '0', '0', '/products/shampoo.jpg',
      'new', 'Шампунь для ежедневного использования', 'Для всех типов волос',
      '250мл', 'Жидкость', 'Германия',
      'Глубокое увлажнение', 'Deep hydration', '',
      'Без сульфатов', 'Sulfate-free', '',
      '', '', '', '', '', '',
      'шт', '12', '5',
      'Keune GmbH', 'Germany, Hamburg', 'info@keune.com',
      'Шампунь | Keune', 'Увлажняющий шампунь от Keune',
    ]
    csvBody = example.map(escapeCell).join(',')
  } else {
    const products = await getMergedProducts()
    csvBody = products
      .map((p) => COLUMNS.map((col) => escapeCell(p[col])).join(','))
      .join('\n')
  }

  const csv = `${header}\n${csvBody}`
  const filename = template ? 'products-template.csv' : `products-export-${Date.now()}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
