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

const MAX_SELECTED_VARIANTS = 20
const MAX_VARIANT_TEXT_LENGTH = 200

/** Shape check for an untrusted `selectedVariants` request value (no DB lookup). */
export function isSelectedVariantsInput(value: unknown): boolean {
  if (value === undefined || value === null) return true
  return Array.isArray(value) && value.length <= MAX_SELECTED_VARIANTS && value.every((entry) =>
    !!entry && typeof entry === 'object'
    && typeof (entry as SelectedVariant).groupName === 'string' && (entry as SelectedVariant).groupName.length <= MAX_VARIANT_TEXT_LENGTH
    && typeof (entry as SelectedVariant).value === 'string' && (entry as SelectedVariant).value.length <= MAX_VARIANT_TEXT_LENGTH)
}

/**
 * Re-derives a client's variant selection from the product's own variant groups (DB data).
 * Only group/value names are read from the request; priceAdjustment comes from the product.
 * Returns null when any selection does not exist on the product (or a group repeats).
 */
export function resolveSelectedVariants(technicalSpecs: unknown, requested: unknown): SelectedVariant[] | null {
  if (requested === undefined || requested === null) return []
  if (!isSelectedVariantsInput(requested)) return null
  const specs = technicalSpecs && typeof technicalSpecs === 'object' && !Array.isArray(technicalSpecs)
    ? technicalSpecs as Record<string, string>
    : null
  const groups = getVariantGroups({ technicalSpecs: specs }) ?? []
  const seenGroups = new Set<string>()
  const resolved: SelectedVariant[] = []
  for (const entry of requested as SelectedVariant[]) {
    if (seenGroups.has(entry.groupName)) return null
    seenGroups.add(entry.groupName)
    const option = groups.find((group) => group.name === entry.groupName)?.options.find((candidate) => candidate.value === entry.value)
    if (!option) return null
    resolved.push({
      groupName: entry.groupName,
      value: option.value,
      ...(typeof option.priceAdjustment === 'number' ? { priceAdjustment: option.priceAdjustment } : {}),
    })
  }
  return resolved
}

/**
 * The variant choice a line is sold with: resolved from the product's own groups, with every
 * required group chosen. Null when the request names an unknown option or leaves a required
 * group open, so a configuration nobody chose is never sold at the base price.
 */
export function resolveVariantSelectionForSale(technicalSpecs: unknown, requested: unknown): SelectedVariant[] | null {
  const resolved = resolveSelectedVariants(technicalSpecs, requested)
  if (!resolved) return null
  const specs = technicalSpecs && typeof technicalSpecs === 'object' && !Array.isArray(technicalSpecs)
    ? technicalSpecs as Record<string, string>
    : null
  return getMissingRequiredGroups(getVariantGroups({ technicalSpecs: specs }), resolved).length > 0 ? null : resolved
}

/** Unit price of a configuration, in exact cents: base (or tier) price plus the chosen options. */
export function variantUnitPrice(basePrice: number, selected: SelectedVariant[]): number {
  const cents = Math.round(basePrice * 100)
    + selected.reduce((sum, variant) => sum + Math.round((Number.isFinite(variant.priceAdjustment) ? variant.priceAdjustment ?? 0 : 0) * 100), 0)
  return cents / 100
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
