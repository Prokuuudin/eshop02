export type OrderItemSnapshot = Record<string, unknown> & { id?: unknown; title?: unknown }

export function hasDamagedOrderText(value: unknown): boolean {
  return typeof value === 'string' && (value.includes('\uFFFD') || value.includes('???'))
}

export function repairOrderItemTitles(
  value: unknown,
  catalogTitles: ReadonlyMap<string, string>,
): unknown {
  if (!Array.isArray(value)) return value

  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
    const item = entry as OrderItemSnapshot
    if (!hasDamagedOrderText(item.title) || typeof item.id !== 'string') return item
    const title = catalogTitles.get(item.id)
    return title ? { ...item, title } : item
  })
}

export function productIdsForDamagedOrderItems(values: unknown[]): string[] {
  const ids = new Set<string>()
  for (const value of values) {
    if (!Array.isArray(value)) continue
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      const item = entry as OrderItemSnapshot
      if (hasDamagedOrderText(item.title) && typeof item.id === 'string') ids.add(item.id)
    }
  }
  return [...ids]
}
