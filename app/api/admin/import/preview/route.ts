import { NextRequest, NextResponse } from 'next/server'
import { getMergedProducts } from '@/lib/product-overrides-store'
import type { CategoryType } from '@/data/products'

export const runtime = 'nodejs'

type ImportMode = 'create' | 'update' | 'upsert'
type ImportRow = Record<string, string>
export type RowAction = 'create' | 'update' | 'skip' | 'error'

export type PreviewRow = {
  rowNum: number
  id: string
  title: string
  brand: string
  price: string
  stock: string
  sku: string
  action: RowAction
  error?: string
}

export type PreviewResult = {
  rows: PreviewRow[]
  summary: { create: number; update: number; skip: number; error: number }
}

const VALID_CATEGORIES: CategoryType[] = ['hair', 'face', 'body', 'nails', 'equipment', 'new']

function validateRow(row: ImportRow): string | null {
  const id = row.id?.trim()
  const title = row.title?.trim()
  const brand = row.brand?.trim()
  const priceRaw = row.price?.trim()
  const stockRaw = row.stock?.trim()
  const category = row.category?.trim()

  if (!id) return 'Отсутствует id'
  if (!title) return 'Отсутствует title'
  if (!brand) return 'Отсутствует brand'
  if (!priceRaw) return 'Отсутствует price'
  if (!stockRaw) return 'Отсутствует stock'
  if (!category) return 'Отсутствует category'

  const price = parseFloat(priceRaw)
  const stock = parseInt(stockRaw, 10)

  if (!Number.isFinite(price) || price < 0) return `Некорректная цена "${priceRaw}"`
  if (!Number.isFinite(stock) || stock < 0) return `Некорректный остаток "${stockRaw}"`
  if (!VALID_CATEGORIES.includes(category as CategoryType)) {
    return `Неверная категория "${category}". Допустимые: ${VALID_CATEGORIES.join(', ')}`
  }

  return null
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

    const previewRows: PreviewRow[] = []
    const summary = { create: 0, update: 0, skip: 0, error: 0 }
    const seenIds = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2
      const id = row.id?.trim() ?? ''
      const title = row.title?.trim() ?? ''
      const brand = row.brand?.trim() ?? ''
      const price = row.price?.trim() ?? ''
      const stock = row.stock?.trim() ?? ''
      const sku = row.sku?.trim() ?? ''

      const error = validateRow(row)
      if (error) {
        previewRows.push({ rowNum, id, title, brand, price, stock, sku, action: 'error', error })
        summary.error++
        continue
      }

      const existsInCatalog = existingIds.has(id)
      const existsInBatch = seenIds.has(id)
      const exists = existsInCatalog || existsInBatch
      seenIds.add(id)

      let action: RowAction
      if (mode === 'create' && exists) {
        action = 'skip'
        summary.skip++
      } else if (mode === 'update' && !existsInCatalog) {
        action = 'skip'
        summary.skip++
      } else if (existsInCatalog && mode !== 'create') {
        action = 'update'
        summary.update++
      } else {
        action = 'create'
        summary.create++
        existingIds.add(id)
      }

      previewRows.push({ rowNum, id, title, brand, price, stock, sku, action })
    }

    return NextResponse.json({ rows: previewRows, summary } satisfies PreviewResult)
  } catch {
    return NextResponse.json({ error: 'preview_failed' }, { status: 500 })
  }
}
