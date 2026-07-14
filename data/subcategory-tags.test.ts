import { describe, expect, it } from 'vitest'

import { SUBCATEGORIES_BY_ID } from './categories'
import { TAG_TO_SUBCATEGORY, resolveSubcategorySlug } from './subcategory-tags'

describe('resolveSubcategorySlug', () => {
  it('resolves a functional tag to its slug within the right category', () => {
    expect(resolveSubcategorySlug(['ŠAMPŪNI', 'CHILDS FARM'], 'hair')).toBe('shampoos')
    expect(resolveSubcategorySlug(['KONDICIONIERI'], 'hair')).toBe('conditioners')
    expect(resolveSubcategorySlug(['NAGU LAKAS'], 'nails')).toBe('nail-polishes')
    expect(resolveSubcategorySlug(['MĒBELES'], 'equipment')).toBe('furniture')
  })

  it('ignores slugs that belong to another category', () => {
    // GEHWOL nail softener: tagged both nails + feet, lives in nails —
    // leg-care (body slug) must not leak in
    expect(resolveSubcategorySlug(['NAGU ĀRSTĒŠANA', 'KĀJĀM'], 'nails')).toBe('treatment-recovery')
    expect(resolveSubcategorySlug(['NAGU ĀRSTĒŠANA', 'KĀJĀM'], 'body')).toBe('leg-care')
  })

  it('prefers the specific slug over the generic one', () => {
    expect(resolveSubcategorySlug(['SEJAI', 'SKROPSTU UN UZACU KOPŠANA'], 'face')).toBe('lashes-brows-care')
    expect(resolveSubcategorySlug(['ĶERMENIM', 'VAKSĀCIJA'], 'body')).toBe('waxing')
  })

  it('is case- and whitespace-insensitive on tag names', () => {
    expect(resolveSubcategorySlug([' šampūni '], 'hair')).toBe('shampoos')
  })

  it('returns undefined when nothing maps', () => {
    expect(resolveSubcategorySlug(['CHILDS FARM'], 'face')).toBeUndefined()
    expect(resolveSubcategorySlug([], 'hair')).toBeUndefined()
    expect(resolveSubcategorySlug(['Profesionāļiem'], 'equipment')).toBeUndefined()
  })

  it('maps every tag to a slug that exists in SUBCATEGORIES_BY_ID', () => {
    const knownSlugs = new Set(
      Object.values(SUBCATEGORIES_BY_ID).flat().map((s) => s.slug)
    )
    for (const slug of TAG_TO_SUBCATEGORY.values()) {
      expect(knownSlugs).toContain(slug)
    }
  })
})
