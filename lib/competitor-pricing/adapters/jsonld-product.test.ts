import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  jsonLdProductAdapter,
  MAX_JSON_LD_BLOCK_BYTES,
  MAX_JSON_LD_BLOCKS,
  MAX_JSON_LD_NODES,
  MAX_JSON_LD_TOTAL_BYTES,
  normalizeJsonLdPrice,
} from './jsonld-product'

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

function script(value: unknown, attributes = 'type="application/ld+json"'): string {
  return `<script ${attributes}>${typeof value === 'string' ? value : JSON.stringify(value)}</script>`
}

describe('normalizeJsonLdPrice', () => {
  it.each([
    ['12', '12.00'],
    ['12.3', '12.30'],
    ['12,34', '12.34'],
    ['1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ["1'234.56", '1234.56'],
    ['1\u202f234,56 €', '1234.56'],
    ['EUR 12,34', '12.34'],
    [12.5, '12.50'],
    [-1, '-1.00'],
  ])('normalizes %j without using a locale-dependent number parser', (input, expected) => {
    expect(normalizeJsonLdPrice(input)).toEqual({ kind: 'value', value: expected })
  })

  it.each(['1,234', '1.234', '12.3456', '1,23,4', '12 EUR x', 'NaN', {}, Number.POSITIVE_INFINITY])('rejects malformed or ambiguous value %j', (input) => {
    expect(normalizeJsonLdPrice(input)).toEqual({ kind: 'invalid' })
  })

  it.each([null, undefined, '', '   '])('distinguishes a missing price %j', (input) => {
    expect(normalizeJsonLdPrice(input)).toEqual({ kind: 'missing' })
  })
})

describe('jsonLdProductAdapter', () => {
  it('parses a synthetic Product/Offer fixture and normalizes it through the observation boundary', () => {
    expect(jsonLdProductAdapter.parse(fixture('basic-product.html'), 'https://fixture.invalid/products/shampoo')).toEqual({
      ok: true,
      url: 'https://fixture.invalid/products/shampoo',
      sourceProductId: 'synthetic-product-1',
      title: 'Synthetic Hydrating Shampoo',
      brand: 'Fixture Labs',
      ean: '4750000000001',
      manufacturerSku: 'FIX-SHAMPOO-250',
      sizeText: '250 ml',
      observation: { regularCents: 1890, saleCents: null, currency: 'EUR', availability: 'in_stock' },
    })
  })

  it('resolves @graph references and uses the low price of AggregateOffer', () => {
    expect(jsonLdProductAdapter.parse(fixture('graph-aggregate.html'), 'https://fixture.invalid/set')).toMatchObject({
      ok: true,
      sourceProductId: 'fixture-aggregate-1',
      ean: '04750000000018',
      manufacturerSku: 'FIX-SET',
      observation: { regularCents: 123450, currency: 'EUR', availability: 'out_of_stock' },
    })
  })

  it('walks root arrays, skips an unsupported-currency offer and reads UnitPriceSpecification', () => {
    expect(jsonLdProductAdapter.parse(fixture('array-products.html'), 'https://fixture.invalid/dryer')).toMatchObject({
      ok: true,
      title: 'Synthetic Preorder Dryer',
      ean: '4750000000002',
      observation: { regularCents: 6995, currency: 'EUR', availability: 'preorder' },
    })
  })

  it.each([
    ['12.34', 1234],
    ['12,34', 1234],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    [' 1\u00a0234,56 € ', 123456],
  ])('passes unambiguous machine-readable price %j through observation normalization', (price, regularCents) => {
    const html = script({ '@type': 'Product', offers: { '@type': 'Offer', price, priceCurrency: 'EUR' } })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toMatchObject({ ok: true, observation: { regularCents } })
  })

  it.each(['1,234', '1.234'])('fails closed for locale-ambiguous price %j on the full adapter path', (price) => {
    const html = script({ '@type': 'Product', offers: { '@type': 'Offer', price, priceCurrency: 'EUR' } })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'invalid_price' })
  })

  it('accepts schema.org type URLs and @type arrays but not unrelated JSON-LD', () => {
    const html = script([
      { '@type': 'WebPage' },
      { '@type': ['Thing', 'https://schema.org/Product'], offers: { '@type': 'https://schema.org/Offer', price: '10', priceCurrency: 'EUR' } },
    ])
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toMatchObject({ ok: true, observation: { regularCents: 1000 } })
    expect(jsonLdProductAdapter.parse(script({ '@type': 'WebPage' }), 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'no_product' })
  })

  it('uses product availability as a fallback and maps known schema availability values', () => {
    const html = script({
      '@type': 'Product',
      availability: 'https://schema.org/BackOrder',
      offers: { '@type': 'Offer', price: '9.99', priceCurrency: 'EUR' },
    })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toMatchObject({
      ok: true,
      observation: { availability: 'preorder' },
    })
  })

  it('does not execute ordinary scripts or JSON-LD string contents', () => {
    delete (globalThis as { competitorAdapterExecuted?: boolean }).competitorAdapterExecuted
    const html = [
      '<script>globalThis.competitorAdapterExecuted = true</script>',
      script({
        '@type': 'Product',
        name: '<img src=x onerror="globalThis.competitorAdapterExecuted=true">',
        offers: { '@type': 'Offer', price: '5.00', priceCurrency: 'EUR' },
      }),
    ].join('')
    const result = jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')
    expect((globalThis as { competitorAdapterExecuted?: boolean }).competitorAdapterExecuted).toBeUndefined()
    expect(result).toMatchObject({ ok: true, title: '<img src=x onerror="globalThis.competitorAdapterExecuted=true">' })
  })

  it.each([
    ['no scripts', '<html></html>', 'no_jsonld'],
    ['malformed JSON', script('{"@type":'), 'invalid_jsonld'],
    ['product without offers', script({ '@type': 'Product', name: 'Fixture' }), 'no_offer'],
    ['offer without price', script({ '@type': 'Product', offers: { '@type': 'Offer', priceCurrency: 'EUR' } }), 'no_price'],
    ['invalid price', script({ '@type': 'Product', offers: { '@type': 'Offer', price: 'abc', priceCurrency: 'EUR' } }), 'invalid_price'],
    ['zero price', script({ '@type': 'Product', offers: { '@type': 'Offer', price: '0,00', priceCurrency: 'EUR' } }), 'non_positive_price'],
    ['negative price', script({ '@type': 'Product', offers: { '@type': 'Offer', price: '-1', priceCurrency: 'EUR' } }), 'non_positive_price'],
    ['missing currency', script({ '@type': 'Product', offers: { '@type': 'Offer', price: '10' } }), 'unsupported_currency'],
    ['unsupported currency', script({ '@type': 'Product', offers: { '@type': 'Offer', price: '10', priceCurrency: 'USD' } }), 'unsupported_currency'],
  ])('returns a typed failure for %s and never invents a zero observation', (_label, html, code) => {
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code })
  })

  it('can ignore a malformed unrelated block when another block contains a valid Product', () => {
    const html = script('{broken') + script({ '@type': 'Product', offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR' } })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toMatchObject({ ok: true })
  })

  it('does not recurse forever through a cyclic AggregateOffer reference', () => {
    const html = script({
      '@graph': [
        { '@id': '#product', '@type': 'Product', offers: { '@id': '#offer' } },
        { '@id': '#offer', '@type': 'AggregateOffer', offers: { '@id': '#offer' } },
      ],
    })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'no_price' })
  })

  it('does not truncate an oversized identifier into a possible match value', () => {
    const html = script({
      '@type': 'Product',
      gtin: '1'.repeat(201),
      offers: { '@type': 'Offer', price: '10', priceCurrency: 'EUR' },
    })
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toMatchObject({ ok: true, ean: null })
  })

  it('enforces the JSON-LD block count limit', () => {
    const html = Array.from({ length: MAX_JSON_LD_BLOCKS + 1 }, () => script({ '@type': 'Thing' })).join('')
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'too_many_jsonld_blocks' })
  })

  it('enforces the per-block byte limit before JSON.parse', () => {
    const html = script(`"${'x'.repeat(MAX_JSON_LD_BLOCK_BYTES)}"`)
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'jsonld_block_too_large' })
  })

  it('counts leading and trailing whitespace toward the per-block byte limit', () => {
    const html = script(`${' '.repeat(MAX_JSON_LD_BLOCK_BYTES)}{}`)
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'jsonld_block_too_large' })
  })

  it('enforces the cumulative JSON-LD byte limit', () => {
    const payload = JSON.stringify({ value: 'x'.repeat(Math.floor(MAX_JSON_LD_TOTAL_BYTES / 3)) })
    const html = script(payload) + script(payload) + script(payload) + script(payload)
    expect(jsonLdProductAdapter.parse(html, 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'jsonld_total_too_large' })
  })

  it('caps the number of traversed JSON-LD graph nodes', () => {
    const nodes = Array.from({ length: MAX_JSON_LD_NODES + 1 }, () => ({ '@type': 'Thing' }))
    expect(jsonLdProductAdapter.parse(script(nodes), 'https://fixture.invalid/item')).toEqual({ ok: false, code: 'jsonld_too_complex' })
  })
})
