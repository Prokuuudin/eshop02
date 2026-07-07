import type { VariantGroup, SelectedVariant } from '@/data/products'

const VARIANT_GROUPS_KEY = '__variantGroupsJson'

export function getVariantGroups(product: { technicalSpecs?: Record<string, string> | null }): VariantGroup[] | undefined {
  const raw = product.technicalSpecs?.[VARIANT_GROUPS_KEY]
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as VariantGroup[]) : undefined
  } catch {
    return undefined
  }
}

export function getMissingRequiredGroups(
  groups: VariantGroup[] | undefined,
  selected: SelectedVariant[]
): VariantGroup[] {
  if (!groups) return []
  return groups.filter(
    (g) => g.required && !selected.some((s) => s.groupName === g.name)
  )
}

export function sumPriceAdjustment(selected: SelectedVariant[]): number {
  return selected.reduce((sum, v) => sum + (v.priceAdjustment ?? 0), 0)
}

export function getPreselectedVariants(groups: VariantGroup[] | undefined): SelectedVariant[] {
  if (!groups) return []
  const result: SelectedVariant[] = []
  for (const group of groups) {
    const option = group.options.find((o) => o.preselected)
    if (option) {
      result.push({ groupName: group.name, value: option.value, priceAdjustment: option.priceAdjustment })
    }
  }
  return result
}
