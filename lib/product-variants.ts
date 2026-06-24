import type { VariantGroup, SelectedVariant } from '@/data/products'

export function getMissingRequiredGroups(
  groups: VariantGroup[] | undefined,
  selected: SelectedVariant[]
): VariantGroup[] {
  if (!groups) return []
  return groups.filter(
    (group) => group.required && !selected.some((s) => s.groupName === group.name)
  )
}

export function sumPriceAdjustment(selected: SelectedVariant[]): number {
  return selected.reduce((sum, v) => sum + (v.priceAdjustment ?? 0), 0)
}
