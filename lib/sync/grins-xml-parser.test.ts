import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { auditGrinsXml, parseGrinsXml } from './grins-xml-parser'

const sampleXml = readFileSync(join(__dirname, '..', '..', 'export_sample.xml'), 'utf-8')

describe('parseGrinsXml', () => {
  it('parses all 23 items from the real sample file', () => {
    const products = parseGrinsXml(sampleXml)
    expect(products).toHaveLength(23)
  })

  it('uses sku as externalId, opaque and untouched (leading dash, slash, percent preserved)', () => {
    const products = parseGrinsXml(sampleXml)
    const skus = products.map(p => p.externalId)
    expect(skus).toContain('SF0301/GL')
    expect(skus).toContain('F12%')
    expect(skus).toContain('-310-051OSTER')
  })

  it('seeds title with the sku placeholder, never the feed title text', () => {
    const products = parseGrinsXml(sampleXml)
    const glue = products.find(p => p.externalId === 'SF0301/GL')
    expect(glue?.title).toBe('SF0301/GL')
  })

  it('maps Product.price from price2 (hairshoppro.lv public price), not price1', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    // price1=9, price2=7 in the sample file for this item
    expect(remover?.price).toBe(7)
    expect(remover?.prices).toEqual({ price1: 9, price2: 7, price3: 2.44, price4: 5 })
  })

  it('sets stock from only the four Hairshoppro warehouses', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    expect(remover?.stock).toBe(36)
  })

  it('does not use excluded warehouses in Product.stock', () => {
    const xml = '<root><item><sku>X</sku><price1>9</price1><price2>0</price2><price3>3</price3><price4>4</price4><quantity>99</quantity><warehouses><warehouse id="4">8</warehouse><warehouse id="5">7</warehouse><warehouse id="7">6</warehouse><warehouse id="8">5</warehouse><warehouse id="9">4</warehouse></warehouses></item></root>'
    const [product] = parseGrinsXml(xml)
    expect(product.price).toBe(0)
    expect(product.stock).toBe(0)
    expect(product.prices).toEqual({ price1: 9, price2: 0, price3: 3, price4: 4 })
    expect(product.warehouseQuantities).toMatchObject({ '10003': 8, '10004': 7, '10006': 6, '10007': 5, '10010': 4 })
  })

  it('maps the 9 warehouse slots to real ids and preserves the known quantity-vs-sum discrepancy', () => {
    const products = parseGrinsXml(sampleXml)
    const remover = products.find(p => p.externalId === '6580075')
    expect(remover?.warehouseQuantities).toEqual({
      '10000': 22, '10001': 4, '10002': 7, '10003': 2, '10004': 3,
      '10005': 3, '10006': 5, '10007': 5, '10010': 0,
    })
    // 22+4+7+2+3+3+5+5+0 = 51, vs stock (quantity) = 53 — the known +2 delta from wholesale (10008), untouched here.
    const sum = Object.values(remover!.warehouseQuantities!).reduce((a, b) => a + b, 0)
    expect(sum).toBe(51)
  })

  it('preserves a leading-zero, decimal-looking sku unmangled by XML number auto-coercion (regression)', () => {
    const products = parseGrinsXml(sampleXml)
    const nipper = products.find(p => p.externalId === '0680.11')
    // fast-xml-parser's default strnum coercion would silently turn "0680.11" into the
    // number 680.11 (destroying the leading zero) unless parseTagValue: false is set.
    expect(nipper).toBeDefined()
    expect(nipper?.externalId).toBe('0680.11')
    expect(nipper?.sku).toBe('0680.11')
    expect(nipper?.title).toBe('0680.11')
  })

  it('does not read capacity into the result at all', () => {
    const products = parseGrinsXml(sampleXml)
    for (const p of products) {
      expect(p).not.toHaveProperty('capacity')
    }
  })
})

describe('auditGrinsXml', () => {
  it('reports duplicate and empty SKUs without normalizing leading zeroes', () => {
    const xml = '<root><item><sku>00123</sku><price1>1</price1><price2>1</price2><price3>1</price3><price4>1</price4><quantity>1</quantity></item><item><sku>00123</sku><price1>1</price1><price2>1</price2><price3>1</price3><price4>1</price4><quantity>1</quantity></item><item><sku> </sku><price1>x</price1><price2>1</price2><price3>1</price3><price4>1</price4><quantity>-1</quantity></item></root>'
    const audit = auditGrinsXml(xml)
    expect(audit.duplicateSkus).toEqual(['00123'])
    expect(audit.emptySkus).toBe(1)
    expect(audit.leadingZeroSkus).toEqual(['00123'])
    expect(audit.invalidPrices).toHaveLength(1)
    expect(audit.negativeStocks).toHaveLength(1)
  })

  it('rejects malformed XML', () => {
    expect(auditGrinsXml('<root><item></root>').validXml).toBe(false)
  })
})
