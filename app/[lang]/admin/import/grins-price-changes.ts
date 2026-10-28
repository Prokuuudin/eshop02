import type { ManualPriceChange } from '@/lib/sync/manual-import'

export const COLLAPSED_PRICE_CHANGES = 10
export const PRICE_CHANGES_PAGE_SIZE = 100

export function filterPriceChanges(changes: ManualPriceChange[], query: string): ManualPriceChange[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return changes
  return changes.filter(change =>
    change.externalId.toLocaleLowerCase().includes(needle)
    || (change.localSku?.toLocaleLowerCase().includes(needle) ?? false),
  )
}

export function paginatePriceChanges(changes: ManualPriceChange[], requestedPage: number): {
  items: ManualPriceChange[]
  page: number
  totalPages: number
} {
  const totalPages = Math.max(1, Math.ceil(changes.length / PRICE_CHANGES_PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * PRICE_CHANGES_PAGE_SIZE
  return { items: changes.slice(start, start + PRICE_CHANGES_PAGE_SIZE), page, totalPages }
}
