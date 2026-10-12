import type { ManualStockChange } from '@/lib/sync/manual-stock-preview'

export const COLLAPSED_STOCK_CHANGES = 10
export const STOCK_CHANGES_PAGE_SIZE = 100

export function filterStockChanges(changes: ManualStockChange[], query: string): ManualStockChange[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return changes
  return changes.filter(change =>
    change.externalId.toLocaleLowerCase().includes(needle)
    || (change.localSku?.toLocaleLowerCase().includes(needle) ?? false),
  )
}

export function paginateStockChanges(changes: ManualStockChange[], requestedPage: number): {
  items: ManualStockChange[]
  page: number
  totalPages: number
} {
  const totalPages = Math.max(1, Math.ceil(changes.length / STOCK_CHANGES_PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * STOCK_CHANGES_PAGE_SIZE
  return { items: changes.slice(start, start + STOCK_CHANGES_PAGE_SIZE), page, totalPages }
}
