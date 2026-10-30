import { describe, expect, it } from 'vitest'
import {
  MAX_LINE_DEPTH,
  effectiveProducts,
  planBrandLines,
  type BrandLinePlan,
  type ExistingLine,
  type ExistingLink,
  type LineSeed,
  type PlanInput,
  type SourceCategory,
} from './brand-line-plan'

function cat(id: string, parentId: string | null, name: string): SourceCategory {
  return { id, parentId, names: { default: name, lv: name }, published: true, isPresent: true }
}

// BRANDS(1) > ACME(10) > PRIME(20) > ROUGE(30), JADE(31)
//                      > SHAMPOOS(25)          (product type, also under OTHER)
//                      > STRANGE(26)           (unknown root line)
//         > OTHER(11) > SHAMPOOS(27)
//         > MYSTERY(12)                         (unknown brand category)
// plus ten more brand categories so the brands root is detected.
function baseInput(): PlanInput {
  const fillerBrands = Array.from({ length: 10 }, (_, index) => ({ key: `filler-${index}`, name: `FILLER ${index}` }))
  return {
    categories: [
      cat('1', null, 'BRANDS'), cat('10', '1', 'ACME'), cat('11', '1', 'OTHER BRAND'), cat('12', '1', 'MYSTERY'),
      ...fillerBrands.map((brand, index) => cat(String(100 + index), '1', brand.name)),
      cat('20', '10', 'PRIME LINE'), cat('30', '20', 'ROUGE'), cat('31', '20', 'JADE'),
      cat('25', '10', 'SHAMPOOS'), cat('27', '11', 'SHAMPOOS'), cat('26', '10', 'STRANGE'),
    ],
    manufacturers: [{ id: '500', names: { default: 'ACME' }, isPresent: true }, { id: '501', names: { default: 'Nobody Inc' }, isPresent: true }],
    categoryEdges: [
      { productId: '1001', categoryId: '30', isPresent: true },
      { productId: '1001', categoryId: '20', isPresent: true },
      { productId: '1002', categoryId: '31', isPresent: true },
      { productId: '1003', categoryId: '31', isPresent: true },
      { productId: '1004', categoryId: '25', isPresent: true },
      { productId: '1005', categoryId: '26', isPresent: true },
    ],
    manufacturerEdges: [{ productId: '1003', manufacturerId: '500', isPresent: true }],
    brands: [{ key: 'acme', name: 'ACME' }, { key: 'other-brand', name: 'OTHER BRAND' }, ...fillerBrands],
    aliases: [],
    products: [
      { id: '1001', brand: 'ACME', isDeleted: false },
      { id: '1002', brand: 'ACME', isDeleted: false },
      { id: '1003', brand: 'Unknown', isDeleted: false },
      { id: '1004', brand: 'ACME', isDeleted: false },
      { id: '1005', brand: 'ACME', isDeleted: false },
    ],
    seeds: [
      { key: 'acme/prime-line', brandKey: 'acme', kind: 'line', parentKey: null, categoryNames: [] },
      { key: 'acme/prime-line/rouge', brandKey: 'acme', kind: 'series', parentKey: 'acme/prime-line', categoryNames: ['ROUGE'] },
      { key: 'acme/prime-line/jade', brandKey: 'acme', kind: 'series', parentKey: 'acme/prime-line', categoryNames: ['JADE'] },
    ],
    existing: { lines: [], categoryMappings: [], manufacturerMappings: [], links: [] },
  }
}

const reasons = (plan: BrandLinePlan): string[] => plan.reviews.map(item => `${item.reason}:${item.subjectKey}`)

// Turns a plan into the database state that applying it would produce.
function applied(input: PlanInput, plan: BrandLinePlan, extraLinks: ExistingLink[] = []): PlanInput {
  const lines: ExistingLine[] = [...input.existing.lines]
  for (const line of plan.lines) {
    lines.push({
      id: `id:${line.key}`, key: line.key, brandKey: line.brandKey, parentId: line.parentKey ? lines.find(row => row.key === line.parentKey)!.id : null,
      slug: line.slug, names: line.names, kind: line.kind, status: 'active', origin: 'source_sync', adminLocked: false, depth: line.depth,
    })
  }
  const idOf = (key: string): string => lines.find(row => row.key === key)!.id
  return {
    ...input,
    existing: {
      lines,
      categoryMappings: [...input.existing.categoryMappings, ...plan.categoryMappings.map(row => ({
        sourceCategoryId: row.sourceCategoryId, targetType: row.targetType, brandKey: row.brandKey,
        brandLineId: row.lineKey ? idOf(row.lineKey) : null, status: 'confirmed' as const, origin: row.origin,
      }))],
      manufacturerMappings: [...input.existing.manufacturerMappings, ...plan.manufacturerMappings.map(row => ({ ...row, status: 'confirmed' as const }))],
      links: [...input.existing.links, ...plan.links.create.map(link => ({
        productId: link.productId, brandLineId: idOf(link.lineKey), origin: 'source_sync' as const, status: 'active' as const,
        sourceCategoryId: link.sourceCategoryId, isPresentInSource: true, missingSnapshotCount: 0,
      })), ...extraLinks],
    },
  }
}

describe('BrandLine planner', () => {
  it('resolves seeds by stable category IDs, including a node that exists only as the common parent', () => {
    const plan = planBrandLines(baseInput())
    expect(plan.brandsRootCategoryIds).toEqual(['1'])
    expect(plan.lines.map(line => [line.key, line.sourceCategoryId, line.parentKey, line.depth])).toEqual([
      ['acme/prime-line', '20', null, 1],
      ['acme/prime-line/jade', '31', 'acme/prime-line', 2],
      ['acme/prime-line/rouge', '30', 'acme/prime-line', 2],
    ])
    expect(plan.manufacturerMappings).toEqual([{ sourceManufacturerId: '500', brandKey: 'acme', origin: 'exact_name' }])
    expect(reasons(plan)).toContain('unknown_manufacturer:501')
    expect(reasons(plan)).toContain('unknown_brand_category:12')
  })

  it('links a product only to its deepest line and derives parent membership', () => {
    const plan = planBrandLines(baseInput())
    expect(plan.links.create.filter(link => link.productId === '1001')).toEqual([{ productId: '1001', lineKey: 'acme/prime-line/rouge', sourceCategoryId: '30' }])
    expect(plan.stats.ancestorLinksAvoided).toBe(1)
    expect(plan.linesByKey['acme/prime-line'].directProducts).toEqual([])
    expect(effectiveProducts(plan, 'acme/prime-line')).toEqual(['1001', '1002', '1003'])
  })

  it('links a product with an unknown Pro brand only when the source manufacturer does not contradict it, and flags it', () => {
    const plan = planBrandLines(baseInput())
    expect(plan.links.create.some(link => link.productId === '1003')).toBe(true)
    expect(reasons(plan)).toContain('product_brand_unknown:1003')

    const contradicted = baseInput()
    contradicted.manufacturers.push({ id: '502', names: { default: 'OTHER BRAND' }, isPresent: true })
    contradicted.manufacturerEdges = [{ productId: '1003', manufacturerId: '502', isPresent: true }]
    const second = planBrandLines(contradicted)
    expect(second.links.create.some(link => link.productId === '1003')).toBe(false)
    expect(reasons(second)).toContain('product_brand_mismatch:1003:acme/prime-line/jade')
  })

  it('never links a product whose Pro brand is a different brand', () => {
    const input = baseInput()
    input.products[1] = { id: '1002', brand: 'OTHER BRAND', isDeleted: false }
    const plan = planBrandLines(input)
    expect(plan.links.create.some(link => link.productId === '1002')).toBe(false)
    expect(reasons(plan)).toContain('product_brand_mismatch:1002:acme/prime-line/jade')
  })

  it('routes unknown root lines to review, ignores product-type categories and never auto-creates root lines', () => {
    const plan = planBrandLines(baseInput())
    expect(reasons(plan)).toContain('unknown_root_line:26')
    expect(reasons(plan).some(reason => reason.endsWith(':25'))).toBe(false)
    expect(plan.genericCategories).toEqual({ names: 1, categories: 2 })
    expect(plan.lines.some(line => line.sourceCategoryId === '26')).toBe(false)
  })

  it('flags a line category that carries the name of another Hairshop Pro brand', () => {
    const input = baseInput()
    input.categories.push(cat('28', '10', 'OTHER BRAND'))
    input.categoryEdges.push({ productId: '1004', categoryId: '28', isPresent: true })
    expect(reasons(planBrandLines(input))).toContain('brand_vs_line_conflict:28')
  })

  it('auto-classifies a new child series of a confirmed line only when its brand is unambiguous', () => {
    const input = baseInput()
    input.categories.push(cat('32', '20', 'NEW SERIES'), cat('33', '20', 'MIXED SERIES'), cat('34', '20', 'SHAMPOOS'), cat('35', '20', 'EMPTY'))
    input.products.push({ id: '1006', brand: 'ACME', isDeleted: false }, { id: '1007', brand: 'OTHER BRAND', isDeleted: false })
    input.categoryEdges.push(
      { productId: '1006', categoryId: '32', isPresent: true },
      { productId: '1006', categoryId: '33', isPresent: true }, { productId: '1007', categoryId: '33', isPresent: true },
      { productId: '1006', categoryId: '34', isPresent: true },
    )
    const plan = planBrandLines(input)
    expect(plan.newSeries.map(row => [row.sourceCategoryId, row.status]).sort()).toEqual([['32', 'auto'], ['33', 'review'], ['34', 'skipped_generic'], ['35', 'skipped_empty']])
    expect(plan.lines.find(line => line.sourceCategoryId === '32')).toMatchObject({ key: 'acme/prime-line/new-series', parentKey: 'acme/prime-line', depth: 2, origin: 'auto_child_series' })
    expect(reasons(plan)).toContain('ambiguous_new_series:33')
  })

  it('stops automatic series classification at the depth limit', () => {
    const input = baseInput()
    let parent = '30'
    for (let level = 3; level <= MAX_LINE_DEPTH + 1; level++) {
      const id = String(40 + level)
      input.categories.push(cat(id, parent, `LEVEL ${level}`))
      input.categoryEdges.push({ productId: '1001', categoryId: id, isPresent: true })
      parent = id
    }
    const plan = planBrandLines(input)
    expect(Math.max(...plan.lines.map(line => line.depth))).toBe(MAX_LINE_DEPTH)
    expect(reasons(plan)).toContain(`new_series_too_deep:${40 + MAX_LINE_DEPTH + 1}`)
  })

  it('reports a seed whose hierarchy differs from the source and follows the source', () => {
    const input = baseInput()
    input.seeds[2] = { ...input.seeds[2], parentKey: null }
    const plan = planBrandLines(input)
    expect(plan.lines.find(line => line.key === 'acme/prime-line/jade')?.parentKey).toBe('acme/prime-line')
    expect(reasons(plan)).toContain('hierarchy_divergence:acme/prime-line/jade')
  })

  it('does not guess when a seed name matches several categories of the brand', () => {
    const input = baseInput()
    input.categories.push(cat('36', '26', 'JADE'))
    const plan = planBrandLines(input)
    expect(reasons(plan)).toContain('seed_unresolved:acme/prime-line/jade')
    expect(plan.lines.some(line => line.key === 'acme/prime-line/jade')).toBe(false)
  })

  it('is idempotent: re-planning the applied state changes nothing', () => {
    const input = baseInput()
    const first = planBrandLines(input)
    const second = planBrandLines(applied(input, first))
    expect(second.lines).toEqual([])
    expect(second.categoryMappings).toEqual([])
    expect(second.manufacturerMappings).toEqual([])
    expect(second.links).toEqual({ create: [], refresh: [], markMissing: [], suppressedByAdmin: [] })
    expect(second.linesByKey).toEqual(first.linesByKey)
  })

  it('keeps administrator decisions: rejected categories, excluded links, admin links and locked lines', () => {
    const input = baseInput()
    const first = planBrandLines(input)
    const state = applied(input, first, [{
      productId: '1004', brandLineId: 'id:acme/prime-line', origin: 'admin', status: 'active', sourceCategoryId: null, isPresentInSource: true, missingSnapshotCount: 0,
    }])
    state.existing.links = state.existing.links.map(link => link.productId === '1002' ? { ...link, status: 'excluded' as const } : link)
    state.existing.categoryMappings.push({ sourceCategoryId: '26', targetType: 'ignore', brandKey: null, brandLineId: null, status: 'rejected', origin: 'admin' })
    const locked = state.existing.lines.find(line => line.key === 'acme/prime-line/rouge')!
    locked.adminLocked = true
    locked.parentId = null
    locked.depth = 1

    const plan = planBrandLines(state)
    // The administrator moved ROUGE out of PRIME, so PRIME membership of 1001 is no
    // longer derived through ROUGE and becomes a direct link of its own.
    expect(plan.links.create).toEqual([{ productId: '1001', lineKey: 'acme/prime-line', sourceCategoryId: '20' }])
    expect(plan.linesByKey['acme/prime-line/rouge'].parentKey).toBeNull()
    expect(plan.links.suppressedByAdmin).toEqual([{ productId: '1002', lineKey: 'acme/prime-line/jade', sourceCategoryId: '31' }])
    expect(plan.links.markMissing).toEqual([])
    expect(reasons(plan)).not.toContain('unknown_root_line:26')
    expect(reasons(plan)).toContain('line_parent_changed:acme/prime-line/rouge')
    expect(plan.lines).toEqual([])
  })

  it('marks a vanished source link as missing instead of deleting it', () => {
    const input = baseInput()
    const state = applied(input, planBrandLines(input))
    state.categoryEdges = state.categoryEdges.map(edge => edge.productId === '1002' ? { ...edge, isPresent: false } : edge)
    const plan = planBrandLines(state)
    expect(plan.links.markMissing).toEqual([{ productId: '1002', brandLineId: 'id:acme/prime-line/jade' }])
    expect(plan.links.create).toEqual([])

    // A rerun on the snapshot that already counted the miss does not count it again.
    state.snapshotId = 'snapshot-2'
    const counted = state.existing.links.map(link => link.productId === '1002' ? { ...link, lastCheckedSnapshotId: 'snapshot-2' } : link)
    expect(planBrandLines({ ...state, existing: { ...state.existing, links: counted } }).links.markMissing).toEqual([])
    expect(planBrandLines(state).links.markMissing).toHaveLength(1)

    state.categoryEdges = baseInput().categoryEdges
    state.existing.links = state.existing.links.map(link => link.productId === '1002' ? { ...link, isPresentInSource: false, missingSnapshotCount: 1 } : link)
    expect(planBrandLines(state).links.refresh).toEqual([{ productId: '1002', lineKey: 'acme/prime-line/jade', sourceCategoryId: '31' }])
  })

  it('reports ambiguous Product identities and skips deleted or absent products', () => {
    const input = baseInput()
    input.products.push({ id: 'nop390-1001', brand: 'ACME', isDeleted: false })
    input.products[1] = { ...input.products[1], isDeleted: true }
    input.categoryEdges.push({ productId: '9999', categoryId: '30', isPresent: true })
    const plan = planBrandLines(input)
    expect(reasons(plan)).toContain('product_identity_ambiguous:1001')
    expect(plan.stats).toMatchObject({ skippedDeletedProducts: 1, missingProducts: 1 })
  })

  it('accepts a seed for a brand whose keys come from brands-config, not from the seed name', () => {
    const input = baseInput()
    input.seeds = [{ key: 'acme/rouge', brandKey: 'acme', kind: 'line', parentKey: null, categoryNames: ['rouge'] } satisfies LineSeed]
    const plan = planBrandLines(input)
    expect(plan.lines.map(line => line.key)).toEqual(['acme/rouge'])
  })
})
