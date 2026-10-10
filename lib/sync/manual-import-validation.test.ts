import { describe, expect, it } from 'vitest'
import { auditManualXml, manualDecimal } from './manual-import-validation'
import { auditGrinsXml } from './grins-xml-parser'

describe('manual decimal contract', () => {
  it.each(['0x10', '1e2', '-1', '+1', 'NaN', 'Infinity', '1,00', '1 000', '', ' ', '1x', '.5', '1.', '10000000000'])('refuses ambiguous/invalid price %s', value => {
    expect(manualDecimal(value)).toBeNull()
  })
  it.each(['0', '0.00', '001.25', ' 12.50 ', '9999999999.99'])('accepts decimal price %s', value => {
    expect(manualDecimal(value)).toBe(Number(value))
  })
  it.each(['1.5', '-1', '2147483648', '0x10', '1e2'])('refuses unsafe stock %s', value => {
    expect(manualDecimal(value, true)).toBeNull()
  })
  it('accepts integer quantities written with a decimal fraction of zero', () => {
    expect(manualDecimal('2.00', true)).toBe(2)
    expect(manualDecimal('2147483647', true)).toBe(2147483647)
    expect(manualDecimal('1.00000000000000001', true)).toBeNull()
  })
  const item = (price = '0', slots = Array.from({ length: 9 }, (_, index) => `<warehouse id="${index + 1}">1</warehouse>`).join('')) =>
    `<item><sku>001</sku><price1>1</price1><price2>${price}</price2><price3>0</price3><price4>0</price4><quantity>4</quantity><warehouses>${slots}</warehouses></item>`
  it('preserves valid zero-price policy and opaque SKU', () => {
    const audit = auditManualXml(`<root>${item()}</root>`)
    expect(audit.invalidPrices).toEqual([])
    expect(audit.invalidStocks).toEqual([])
    expect(audit.leadingZeroSkus).toEqual(['001'])
  })
  it('ignores missing unused tiers without weakening the general sync audit', () => {
    const xml = `<root>${item('10').replace(/<price[134]>[^<]*<\/price[134]>/gu, '')}</root>`
    expect(auditManualXml(xml).invalidPrices).toEqual([])
    expect(auditGrinsXml(xml).invalidPrices.map(({ field }) => field)).toEqual(['price1', 'price3', 'price4'])
  })
  it.each(['0.000105', '0.001', '', '-1', 'NaN', '10000000000'])('still rejects invalid price2=%s', value => {
    expect(auditManualXml(`<root>${item(value)}</root>`).invalidPrices).toEqual([{ sku: '001', field: 'price2', value }])
  })
  it('catches a missing slot on each item even if other rows have that slot', () => {
    const audit = auditManualXml(`<root>${item()}${item('1', '<warehouse id="1">1</warehouse>')}</root>`)
    expect(audit.invalidStocks.filter(value => value.value === 'missing')).toHaveLength(8)
  })
  it('catches duplicate slots and selected stock overflow', () => {
    const slots = Array.from({ length: 9 }, (_, index) => `<warehouse id="${index + 1}">2147483647</warehouse>`).join('')
    const audit = auditManualXml(`<root>${item('1', slots + '<warehouse id="1">1</warehouse>')}</root>`)
    expect(audit.invalidStocks.map(value => value.field)).toContain('warehouse:1')
    expect(audit.invalidStocks.map(value => value.field)).toContain('selectedStock')
  })
})
