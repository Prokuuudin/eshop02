import { z } from 'zod'
import { normalizeName, type BrandAlias, type LineKind, type LineSeed, type ProBrand } from './brand-line-plan'

// Reviewed brand-line inventory (read-only audit output). Only its approved,
// high-confidence nodes become seeds; everything else is left to the planner,
// which routes unknown cases to manual review.
const auditInventorySchema = z.object({
  lines: z.array(z.object({
    line_key: z.string().min(3),
    canonical_brand: z.string().optional(),
    kind: z.enum(['line', 'series', 'subbrand']),
    parent_line_key: z.string().nullable().optional(),
    legacy_categories: z.array(z.string()),
    membership_mode: z.string(),
    confidence: z.string(),
    direct_products: z.array(z.object({ product_id: z.string() })).optional(),
  }).passthrough()),
  naming_aliases_to_normalize: z.array(z.object({
    source_name: z.string(),
    canonical_brand: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough()

export type AuditInventory = z.infer<typeof auditInventorySchema>

export function parseAuditInventory(value: unknown): AuditInventory {
  return auditInventorySchema.parse(value)
}

// The audit keys lines by its own brand slug; Hairshop Pro keys start with the
// brands-config id, resolved from the audit canonical brand name.
export function seedsFromAuditInventory(inventory: AuditInventory, brands: ProBrand[]): {
  seeds: LineSeed[]
  aliases: BrandAlias[]
  excluded: Array<{ key: string; reason: string }>
  keyByAuditKey: Record<string, string>
} {
  const brandKeys = new Set(brands.map(brand => brand.key))
  const byName = new Map(brands.map(brand => [normalizeName(brand.name), brand.key]))
  const brandKeyOf = (line: AuditInventory['lines'][number]): string | null => {
    const prefix = line.line_key.slice(0, line.line_key.indexOf('/'))
    return (line.canonical_brand ? byName.get(normalizeName(line.canonical_brand)) : undefined) ?? (brandKeys.has(prefix) ? prefix : null)
  }
  const keyByAuditKey: Record<string, string> = {}
  for (const line of inventory.lines) {
    const brandKey = brandKeyOf(line)
    if (brandKey) keyByAuditKey[line.line_key] = brandKey + line.line_key.slice(line.line_key.indexOf('/'))
  }
  const seeds: LineSeed[] = []
  const excluded: Array<{ key: string; reason: string }> = []
  for (const line of inventory.lines) {
    const brandKey = brandKeyOf(line)
    if (line.confidence !== 'high' || !brandKey) {
      excluded.push({ key: line.line_key, reason: brandKey ? `confidence ${line.confidence}` : 'unknown brand' })
      continue
    }
    const parent = line.parent_line_key ?? null
    seeds.push({
      key: keyByAuditKey[line.line_key],
      brandKey,
      kind: line.kind as LineKind,
      parentKey: parent ? keyByAuditKey[parent] ?? parent : null,
      categoryNames: line.membership_mode === 'derived_from_descendants' ? [] : line.legacy_categories,
    })
  }
  const aliases: BrandAlias[] = []
  for (const alias of inventory.naming_aliases_to_normalize ?? []) {
    const brandKey = alias.canonical_brand ? byName.get(normalizeName(alias.canonical_brand)) : undefined
    if (brandKey) aliases.push({ sourceName: alias.source_name, brandKey })
  }
  return { seeds, aliases, excluded, keyByAuditKey }
}

// Shadow comparison of a plan with the inventory's confirmed direct memberships.
export function compareWithAudit(
  inventory: AuditInventory,
  plannedDirect: Record<string, string[]>,
  keyByAuditKey: Record<string, string> = {},
): Array<{ key: string; expected: number; planned: number; missing: string[]; extra: string[] }> {
  return inventory.lines.filter(line => line.confidence === 'high').map(line => {
    const expected = new Set((line.direct_products ?? []).map(product => product.product_id))
    const planned = new Set(plannedDirect[keyByAuditKey[line.line_key] ?? line.line_key] ?? [])
    return {
      key: line.line_key,
      expected: expected.size,
      planned: planned.size,
      missing: [...expected].filter(id => !planned.has(id)).sort(),
      extra: [...planned].filter(id => !expected.has(id)).sort(),
    }
  })
}
