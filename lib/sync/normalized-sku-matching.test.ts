import { describe, expect, it } from 'vitest'
import { classifyNormalizedIdentity, typedNormalizedRelation } from './normalized-sku-matching'

const base = { relation: typedNormalizedRelation('00123', '123'), localNormalizedCount: 1, xmlNormalizedCount: 1, exactLocalXmlSkuCount: 0, existingExternalIdClaimants: 0, competingUnlinkedProducts: 0, deferredIntersection: false, alreadyResolved: false, localEan: '', xmlEan: '', localEanCount: 0, xmlEanCount: 0, localName: 'ORIBE SHAMPOO 250ml', xmlName: 'ORIBE SHAMPOO 250 ml' }
describe('typed normalized SKU matching', () => {
  it('accepts a leading-zero unique safe case', () => expect(classifyNormalizedIdentity(base).classification).toBe('FIFTH_WAVE_SAFE_CANDIDATE'))
  it('fails closed on a leading-zero collision', () => expect(classifyNormalizedIdentity({ ...base, localNormalizedCount: 2 }).classification).toBe('MANUAL_REVIEW'))
  it('fails closed on an exact competing SKU', () => expect(classifyNormalizedIdentity({ ...base, exactLocalXmlSkuCount: 1 }).classification).toBe('MANUAL_REVIEW'))
  it('recognizes dot normalization', () => expect(typedNormalizedRelation('DR420', 'DR4.20')?.type).toBe('DOT_NORMALIZATION'))
  it('fails closed on a dot collision', () => expect(classifyNormalizedIdentity({ ...base, relation: typedNormalizedRelation('DR420', 'DR4.20'), xmlNormalizedCount: 2 }).classification).toBe('MANUAL_REVIEW'))
  it('recognizes internal-space normalization', () => expect(typedNormalizedRelation('PAR 250011', 'PAR250011')?.type).toBe('INTERNAL_SPACE_NORMALIZATION'))
  it('rejects multiple transformations', () => expect(typedNormalizedRelation('00 123', '123')).toBeNull())
  it('uses exact unique EAN support', () => expect(classifyNormalizedIdentity({ ...base, localEan: '12345678', xmlEan: '12345678', localEanCount: 1, xmlEanCount: 1, localName: 'ORIBE SHAMPOO', xmlName: 'ORIBE SHAMPOO' }).classification).toBe('FIFTH_WAVE_SAFE_CANDIDATE'))
  it('rejects conflicting EAN', () => expect(classifyNormalizedIdentity({ ...base, localEan: '1', xmlEan: '2' }).classification).toBe('REJECTED_MATCH'))
  it('fails closed on duplicate EAN', () => expect(classifyNormalizedIdentity({ ...base, localEan: '1', xmlEan: '1', localEanCount: 2, xmlEanCount: 1 }).classification).toBe('MANUAL_REVIEW'))
  it('fails closed when XML SKU is claimed', () => expect(classifyNormalizedIdentity({ ...base, existingExternalIdClaimants: 1 }).classification).toBe('MANUAL_REVIEW'))
  it('fails closed on deferred intersection', () => expect(classifyNormalizedIdentity({ ...base, deferredIntersection: true }).classification).toBe('MANUAL_REVIEW'))
  it('rejects a volume mismatch', () => expect(classifyNormalizedIdentity({ ...base, localName: 'SHAMPOO 200ml', xmlName: 'SHAMPOO 250ml' }).classification).toBe('REJECTED_MATCH'))
  it('rejects a variant/name mismatch', () => expect(classifyNormalizedIdentity({ ...base, localName: 'DSD LUMINOX', xmlName: 'STAPIZ PEACH SHAMPOO' }).classification).toBe('REJECTED_MATCH'))
  it('marks an already resolved Product', () => expect(classifyNormalizedIdentity({ ...base, alreadyResolved: true }).classification).toBe('ALREADY_RESOLVED'))
})
