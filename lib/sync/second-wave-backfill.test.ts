import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { SECOND_WAVE_TOTAL, sha256, validateSecondWave } from './second-wave-backfill'

describe('second-wave case-only backfill', () => {
  const allowContent = readFileSync('second-wave-case-only-allowlist.json')
  const allow = JSON.parse(allowContent.toString()) as { entries: Array<{ productId: string; productSku: string }> }
  const fullAllow = JSON.parse(allowContent.toString()) as { entries: Array<{ xmlSku: string }> }
  const xml = `<root>${fullAllow.entries.map(x => `<item><sku>${x.xmlSku}</sku></item>`).join('')}</root>`
  const xmlSha = sha256(xml)
  const products = allow.entries.map(x => ({ id: x.productId, sku: x.productSku, externalId: null, isDeleted: false }))

  it('validates exactly 30 immutable case-only entries', () => {
    expect(validateSecondWave(allowContent, xml, products, xmlSha).entries).toHaveLength(SECOND_WAVE_TOTAL)
  })
  it('rejects tampered allowlist/XML and changed identity/scope', () => {
    expect(() => validateSecondWave(Buffer.concat([allowContent, Buffer.from(' ')]), xml, products, xmlSha)).toThrow('allowlist SHA')
    expect(() => validateSecondWave(allowContent, `${xml} `, products, xmlSha)).toThrow('XML SHA')
    expect(() => validateSecondWave(allowContent, xml, products.slice(1), xmlSha)).toThrow('missing Product')
    expect(() => validateSecondWave(allowContent, xml, products.map((p, i) => i ? p : { ...p, externalId: 'taken' }), xmlSha)).toThrow('externalId already set')
  })
  it('never includes the two CASE_REVIEW SKUs', () => {
    expect(allow.entries.map(x => x.productSku)).not.toEqual(expect.arrayContaining(['k18', 'k86']))
  })
})
