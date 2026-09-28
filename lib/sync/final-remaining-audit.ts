export const ALLOWED_WAREHOUSES = ['10000', '10001', '10002', '10005'] as const

export type PriceReviewClass =
  | 'PRICE_VALID_BUT_STATISTICAL_OUTLIER'
  | 'PRICE_FORMAT_REQUIRES_REVIEW'
  | 'PRICE_SEMANTIC_ANOMALY'
  | 'OTHER_REVIEW'

export function clean(value: unknown): string {
  return String(value ?? '').trim()
}

export function numeric(value: unknown): number {
  const number = Number(clean(value) || 0)
  return Number.isFinite(number) ? number : 0
}

export function allowedStock(warehouses: Record<string, number>): number {
  return ALLOWED_WAREHOUSES.reduce((sum, id) => sum + Math.max(0, warehouses[id] ?? 0), 0)
}

export function excludedStock(warehouses: Record<string, number>): number {
  return Object.entries(warehouses).reduce(
    (sum, [id, value]) => sum + (ALLOWED_WAREHOUSES.includes(id as never) ? 0 : Math.max(0, value)),
    0,
  )
}

export function priceStockCell(price2: number, stock: number): 'A' | 'B' | 'C' | 'D' {
  if (price2 > 0) return stock > 0 ? 'A' : 'B'
  return stock > 0 ? 'C' : 'D'
}

export function classifyPriceReview(input: {
  price2Raw: string
  price1: number
  price2: number
  price3: number
  price4: number
  outlierLow: number
  outlierHigh: number
}): { classification: PriceReviewClass; reason: string; technicallyExactImportable: boolean } {
  const { price2Raw, price1, price2, price3, price4, outlierLow, outlierHigh } = input
  if (!/^\d+(?:\.\d{1,2})?$/u.test(price2Raw) || !Number.isFinite(price2)) {
    return { classification: 'PRICE_FORMAT_REQUIRES_REVIEW', reason: `price2 representation ${price2Raw}`, technicallyExactImportable: false }
  }
  if (price2 <= 0 || [price1, price3, price4].some(value => !Number.isFinite(value) || value < 0)) {
    return { classification: 'PRICE_SEMANTIC_ANOMALY', reason: 'non-positive price2 or negative/non-finite price tier', technicallyExactImportable: false }
  }
  if (price2 < outlierLow || price2 > outlierHigh) {
    return { classification: 'PRICE_VALID_BUT_STATISTICAL_OUTLIER', reason: `exact numeric price2 outside ${outlierLow.toFixed(2)}..${outlierHigh.toFixed(2)}`, technicallyExactImportable: true }
  }
  return { classification: 'OTHER_REVIEW', reason: 'previous review position no longer triggers price gates', technicallyExactImportable: true }
}

export function normalizedSku(value: unknown): string {
  return clean(value).normalize('NFKC').toLocaleUpperCase('en-US').replace(/[\s.\-_]+/gu, '')
}

export function normalizedName(value: unknown): string {
  return clean(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ')
}

export function csv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap(Object.keys))]
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return '\ufeff' + (columns.length ? [columns.map(quote).join(','), ...rows.map(row => columns.map(column => quote(row[column])).join(','))].join('\n') + '\n' : '')
}
