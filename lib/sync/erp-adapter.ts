export interface ErpProduct {
  externalId: string
  sku?: string
  title: string
  description?: string
  brand?: string
  category?: string
  price: number
  oldPrice?: number
  stock: number
  isActive?: boolean
  images?: string[]
  rawData?: Record<string, unknown>
  /** price1-4 as sent by the feed, kept for reference — never used as the displayed price. */
  prices?: { price1: number; price2: number; price3: number; price4: number }
  /** Prices-only manual import: strictly parsed price1 (2-decimal string) or null when missing/invalid. */
  retailPrice?: string | null
  /** Real warehouse id (e.g. "10001") -> quantity. Only populated by feed sources that break out stock per warehouse. */
  warehouseQuantities?: Record<string, number>
}

export interface ErpFetchResult {
  products: ErpProduct[]
  hasMore: boolean
  nextCursor?: string | number
}

export interface ErpAdapter {
  readonly name: string
  fetchPage(cursor?: string | number): Promise<ErpFetchResult>
  fetchAllIds?(): Promise<string[]>
}
