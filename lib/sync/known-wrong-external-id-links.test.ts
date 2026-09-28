import { describe, expect, it } from 'vitest'
import { assertNoKnownWrongExternalIdLinks, isKnownWrongExternalIdLink } from './known-wrong-external-id-links'

describe('known-wrong externalId links', () => {
  it('flags only the exact audited pair', () => {
    expect(isKnownWrongExternalIdLink('19073', 'BLK')).toBe(true)
    expect(isKnownWrongExternalIdLink('19073', 'BLK200016')).toBe(false)
    expect(isKnownWrongExternalIdLink('17228', 'BLK')).toBe(false)
  })

  it('blocks the pair, not the ERP SKU: another Product may still be linked to BLK', () => {
    expect(isKnownWrongExternalIdLink('99999', 'BLK')).toBe(false)
    expect(() => assertNoKnownWrongExternalIdLinks([{ productId: '99999', externalId: 'BLK' }])).not.toThrow()
  })

  it('refuses a batch containing 19073→BLK and allows everything else', () => {
    expect(() => assertNoKnownWrongExternalIdLinks([{ productId: '12528', externalId: 'OXI3' }, { productId: '19073', externalId: 'BLK' }]))
      .toThrow('19073→BLK')
    expect(() => assertNoKnownWrongExternalIdLinks([{ productId: '12528', externalId: 'OXI3' }])).not.toThrow()
  })
})
