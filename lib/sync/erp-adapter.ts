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
