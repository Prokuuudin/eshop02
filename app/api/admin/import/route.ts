import { NextRequest, NextResponse } from 'next/server'
import { createProduct, getMergedProducts, upsertProductOverride } from '@/lib/product-overrides-store'
import type { Product, CategoryType, BadgeType } from '@/data/products'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'

type ImportMode = 'create' | 'update' | 'upsert'

type ImportRow = Record<string, string>

type ImportResult = {
  created: number
  updated: number
  skipped: number
  errors: { row: number; id: string; message: string }[]
}

const VALID_CATEGORIES: CategoryType[] = ['hair', 'face', 'body', 'nails', 'equipment', 'new']
const VALID_BADGES: BadgeType[] = ['sale', 'bestseller', 'new']

function rowToProduct(row: ImportRow, rowIndex: number): { product?: Product; error?: string } {
  const id = row.id?.trim()
  const title = row.title?.trim()
  const brand = row.brand?.trim()
  const priceRaw = row.price?.trim()
  const stockRaw = row.stock?.trim()
  const category = row.category?.trim() as CategoryType

  if (!id) return { error: `Строка ${rowIndex}: отсутствует id` }
  if (!title) return { error: `Строка ${rowIndex}: отсутствует title` }
  if (!brand) return { error: `Строка ${rowIndex}: отсутствует brand` }
  if (!priceRaw) return { error: `Строка ${rowIndex}: отсутствует price` }
  if (!stockRaw) return { error: `Строка ${rowIndex}: отсутствует stock` }
  if (!category) return { error: `Строка ${rowIndex}: отсутствует category` }

  const price = parseFloat(priceRaw)
  const stock = parseInt(stockRaw, 10)

  if (!Number.isFinite(price) || price < 0) return { error: `Строка ${rowIndex}: некорректная цена "${priceRaw}"` }
  if (!Number.isFinite(stock) || stock < 0) return { error: `Строка ${rowIndex}: некорректный остаток "${stockRaw}"` }
  if (!VALID_CATEGORIES.includes(category)) {
    return { error: `Строка ${rowIndex}: неверная категория "${category}". Допустимые: ${VALID_CATEGORIES.join(', ')}` }
  }

  const badgesRaw = row.badges?.trim()
  const badges: BadgeType[] = badgesRaw
    ? badgesRaw.split(';').map((b) => b.trim() as BadgeType).filter((b) => VALID_BADGES.includes(b))
    : []

  const num = (v: string | undefined) => {
    if (!v?.trim()) return undefined
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }

  const str = (v: string | undefined) => v?.trim() || undefined

  const product: Product = {
    id,
    title,
    brand,
    price,
    stock,
    category,
    rating: num(row.rating) ?? 0,
    ratingCount: num(row.ratingCount),
    oldPrice: num(row.oldPrice),
    image: str(row.image) ?? '',
    sku: str(row.sku),
    description: str(row.description),
    titleEn: str(row.titleEn),
    titleLv: str(row.titleLv),
    purpose: str(row.purpose),
    specVolume: str(row.specVolume),
    specType: str(row.specType),
    specCountry: str(row.specCountry),
    feature1: str(row.feature1),
    feature1En: str(row.feature1En),
    feature1Lv: str(row.feature1Lv),
    feature2: str(row.feature2),
    feature2En: str(row.feature2En),
    feature2Lv: str(row.feature2Lv),
    feature3: str(row.feature3),
    feature3En: str(row.feature3En),
    feature3Lv: str(row.feature3Lv),
    feature4: str(row.feature4),
    feature4En: str(row.feature4En),
    feature4Lv: str(row.feature4Lv),
    unitOfMeasure: str(row.unitOfMeasure),
    packagingSize: num(row.packagingSize),
    bonusRate: num(row.bonusRate),
    manufacturerName: str(row.manufacturerName),
    manufacturerAddress: str(row.manufacturerAddress),
    manufacturerEmail: str(row.manufacturerEmail),
    metaTitle: str(row.metaTitle),
    metaDescription: str(row.metaDescription),
    ...(badges.length > 0 ? { badges } : {}),
  }

  return { product }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { rows?: ImportRow[]; mode?: ImportMode }
    const rows = body.rows
    const mode: ImportMode = body.mode ?? 'upsert'

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows_required' }, { status: 400 })
    }

    const existing = await getMergedProducts()
    const existingIds = new Set(existing.map((p) => p.id))

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // 1-indexed + header row

      const { product, error } = rowToProduct(row, rowNum)
      if (!product || error) {
        result.errors.push({ row: rowNum, id: row.id ?? '', message: error ?? 'unknown' })
        continue
      }

      const exists = existingIds.has(product.id)

      if (mode === 'create' && exists) { result.skipped++; continue }
      if (mode === 'update' && !exists) { result.skipped++; continue }

      if (!exists || mode === 'create') {
        const res = await createProduct(product)
        if (res.success) { result.created++; existingIds.add(product.id) }
        else result.errors.push({ row: rowNum, id: product.id, message: res.error ?? 'create_failed' })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...changes } = product
        const res = await upsertProductOverride(product.id, changes)
        if (res.success) result.updated++
        else result.errors.push({ row: rowNum, id: product.id, message: res.error ?? 'update_failed' })
      }
    }

    revalidatePath('/catalog')
    revalidatePath('/admin/products')

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'import_failed' }, { status: 500 })
  }
}
