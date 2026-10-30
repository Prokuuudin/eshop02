import type { ExtendedTransactionClient } from '@/lib/prisma'

// Effective product-line membership for promotions. A product belongs to a line when
// it has an active ProductBrandLine link (synchronized or manual) to that line or to
// any of its descendants. Excluded links never count, archived lines are ignored, and
// nothing is inferred from titles, categories or slugs.

export type BrandLineMembershipDb = Pick<ExtendedTransactionClient, 'brandLine' | 'productBrandLine'>

type LineRow = { id: string; parentId: string | null }
type LinkRow = { productId: string; brandLineId: string; status?: string }

/** productId -> ids of every active line the product belongs to, ancestors included. */
export type EffectiveBrandLines = Map<string, ReadonlySet<string>>

export function selectionMatches(selected: readonly string[], effective: ReadonlySet<string> | undefined): boolean {
  return !!effective && selected.some(id => effective.has(id))
}

export function effectiveLinesFromLinks(lines: LineRow[], links: LinkRow[]): EffectiveBrandLines {
  const parentOf = new Map(lines.map(line => [line.id, line.parentId]))
  const out = new Map<string, Set<string>>()
  for (const link of links.filter(link => (link.status ?? 'active') === 'active')) {
    if (!parentOf.has(link.brandLineId)) continue
    const set = out.get(link.productId) ?? new Set<string>()
    let current: string | null | undefined = link.brandLineId
    for (let guard = 0; current && guard < 32 && parentOf.has(current); guard++) {
      set.add(current)
      current = parentOf.get(current)
    }
    out.set(link.productId, set)
  }
  // An explicit exclusion wins for that line and its ancestors. The product may
  // still belong to a more specific descendant selected by an administrator.
  for (const link of links.filter(link => link.status === 'excluded')) {
    const set = out.get(link.productId)
    let current: string | null | undefined = link.brandLineId
    for (let guard = 0; set && current && guard < 32 && parentOf.has(current); guard++) {
      set.delete(current)
      current = parentOf.get(current)
    }
  }
  return out
}

/** Loads effective membership for the given products; no query when nothing asks for it. */
export async function loadEffectiveBrandLines(db: BrandLineMembershipDb, productIds: readonly string[]): Promise<EffectiveBrandLines> {
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return new Map()
  const [lines, links] = await Promise.all([
    db.brandLine.findMany({ where: { status: 'active' }, select: { id: true, parentId: true } }),
    db.productBrandLine.findMany({ where: { productId: { in: ids }, status: { in: ['active', 'excluded'] } }, select: { productId: true, brandLineId: true, status: true } }),
  ])
  return effectiveLinesFromLinks(lines, links)
}

/** Every product with an active link inside the subtree of one of the selected lines. */
export async function productIdsInBrandLines(db: BrandLineMembershipDb, selected: readonly string[]): Promise<string[]> {
  if (selected.length === 0) return []
  const lines = await db.brandLine.findMany({ where: { status: 'active' }, select: { id: true, parentId: true } })
  const subtree = new Set(selected.filter(id => lines.some(line => line.id === id)))
  for (let grew = true; grew;) {
    grew = false
    for (const line of lines) if (line.parentId && subtree.has(line.parentId) && !subtree.has(line.id)) { subtree.add(line.id); grew = true }
  }
  if (subtree.size === 0) return []
  const links = await db.productBrandLine.findMany({
    where: { brandLineId: { in: [...subtree] }, status: { in: ['active', 'excluded'] } },
    select: { productId: true, brandLineId: true, status: true },
  })
  const effective = effectiveLinesFromLinks(lines, links)
  return [...effective].filter(([, memberships]) => selectionMatches(selected, memberships)).map(([productId]) => productId)
}

/** Server-side validation of submitted ids: unknown or archived lines are rejected. */
export async function invalidBrandLineIds(db: Pick<ExtendedTransactionClient, 'brandLine'>, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const found = await db.brandLine.findMany({ where: { id: { in: [...ids] }, status: 'active' }, select: { id: true } })
  const known = new Set(found.map(row => row.id))
  return ids.filter(id => !known.has(id))
}

export function brandLineIdList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map(item => item.trim()).filter(Boolean))]
    : []
}
