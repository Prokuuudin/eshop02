import { describe, expect, it } from 'vitest'
import { compareWithAudit, parseAuditInventory, seedsFromAuditInventory } from './audit-seed'

const inventory = parseAuditInventory({
  lines: [
    { line_key: 'loreal/kids', canonical_brand: 'L`OREAL PROFESSIONNEL', kind: 'line', parent_line_key: null, legacy_categories: ['KIDS'], membership_mode: 'direct', confidence: 'high', direct_products: [{ product_id: '1' }, { product_id: '2' }] },
    { line_key: 'acme/prime', canonical_brand: 'ACME', kind: 'line', parent_line_key: null, legacy_categories: [], membership_mode: 'derived_from_descendants', confidence: 'high' },
    { line_key: 'acme/prime/jade', canonical_brand: 'ACME', kind: 'series', parent_line_key: 'acme/prime', legacy_categories: ['JADE'], membership_mode: 'direct', confidence: 'high', direct_products: [{ product_id: '3' }] },
    { line_key: 'acme/urban', canonical_brand: 'ACME', kind: 'subbrand', legacy_categories: ['URBAN'], membership_mode: 'direct', confidence: 'medium' },
    { line_key: 'ghost/line', canonical_brand: 'GHOST', kind: 'line', legacy_categories: ['X'], membership_mode: 'direct', confidence: 'high' },
  ],
  naming_aliases_to_normalize: [
    { source_name: 'ACME PROFESSIONAL', canonical_brand: 'ACME' },
    { source_name: 'BONOCURE', canonical_line: 'BONACURE' },
  ],
})
const brands = [{ key: 'acme', name: 'ACME' }, { key: 'l-oreal-professionnel', name: 'L`OREAL PROFESSIONNEL' }]

describe('audit inventory seeds', () => {
  it('keeps only high-confidence nodes of known brands and keys them by the brands-config id', () => {
    const { seeds, aliases, excluded, keyByAuditKey } = seedsFromAuditInventory(inventory, brands)
    expect(seeds.map(seed => [seed.key, seed.brandKey, seed.parentKey, seed.categoryNames])).toEqual([
      ['l-oreal-professionnel/kids', 'l-oreal-professionnel', null, ['KIDS']],
      ['acme/prime', 'acme', null, []],
      ['acme/prime/jade', 'acme', 'acme/prime', ['JADE']],
    ])
    expect(excluded).toEqual([{ key: 'acme/urban', reason: 'confidence medium' }, { key: 'ghost/line', reason: 'unknown brand' }])
    expect(aliases).toEqual([{ sourceName: 'ACME PROFESSIONAL', brandKey: 'acme' }])
    expect(keyByAuditKey['loreal/kids']).toBe('l-oreal-professionnel/kids')
  })

  it('compares planned direct memberships with the confirmed audit memberships', () => {
    const { keyByAuditKey } = seedsFromAuditInventory(inventory, brands)
    const result = compareWithAudit(inventory, { 'l-oreal-professionnel/kids': ['1', '9'], 'acme/prime/jade': ['3'] }, keyByAuditKey)
    expect(result.find(row => row.key === 'loreal/kids')).toEqual({ key: 'loreal/kids', expected: 2, planned: 2, missing: ['2'], extra: ['9'] })
    expect(result.find(row => row.key === 'acme/prime/jade')).toMatchObject({ missing: [], extra: [] })
  })
})
