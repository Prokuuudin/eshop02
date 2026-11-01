import { describe, expect, it, vi } from 'vitest'
import { effectiveLinesFromLinks, productIdsInBrandLines, selectionMatches } from './brand-line-membership'

const lines = [
  { id: 'brand/parent', parentId: null },
  { id: 'brand/parent/child', parentId: 'brand/parent' },
  { id: 'brand/parent/child/series', parentId: 'brand/parent/child' },
]

describe('BrandLine promotion membership', () => {
  it('makes a descendant product eligible for its series and every active ancestor', () => {
    const effective = effectiveLinesFromLinks(lines, [
      { productId: 'p1', brandLineId: 'brand/parent/child/series', status: 'active' },
    ])
    expect([...effective.get('p1') ?? []]).toEqual([
      'brand/parent/child/series', 'brand/parent/child', 'brand/parent',
    ])
    expect(selectionMatches(['brand/parent'], effective.get('p1'))).toBe(true)
  })

  it('lets an explicit exclusion override inherited parent membership without erasing the child series', () => {
    const effective = effectiveLinesFromLinks(lines, [
      { productId: 'p1', brandLineId: 'brand/parent/child/series', status: 'active' },
      { productId: 'p1', brandLineId: 'brand/parent', status: 'excluded' },
    ])
    expect(selectionMatches(['brand/parent'], effective.get('p1'))).toBe(false)
    expect(selectionMatches(['brand/parent/child/series'], effective.get('p1'))).toBe(true)
  })

  it('ignores links to archived or unknown lines', () => {
    const effective = effectiveLinesFromLinks(lines.slice(0, 2), [
      { productId: 'p1', brandLineId: 'brand/parent/child/series', status: 'active' },
    ])
    expect(effective.get('p1')).toBeUndefined()
  })

  it('returns products in a selected subtree while respecting manual exclusions', async () => {
    const db = {
      brandLine: { findMany: vi.fn().mockResolvedValue(lines) },
      productBrandLine: { findMany: vi.fn().mockResolvedValue([
        { productId: 'included', brandLineId: 'brand/parent/child', status: 'active' },
        { productId: 'excluded', brandLineId: 'brand/parent/child', status: 'active' },
        { productId: 'excluded', brandLineId: 'brand/parent', status: 'excluded' },
      ]) },
    }
    await expect(productIdsInBrandLines(db as never, ['brand/parent'])).resolves.toEqual(['included'])
  })
})
