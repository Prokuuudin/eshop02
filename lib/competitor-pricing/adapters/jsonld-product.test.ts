import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeGtin } from '../matching-normalization'
import { normalizeObservation, observationStateHash } from '../observation'
import {
  jsonLdProductAdapter,
  MAX_JSON_LD_BLOCK_BYTES,
  MAX_JSON_LD_BLOCKS,
  MAX_JSON_LD_DEPTH,
  MAX_JSON_LD_LIST_ITEMS,
  MAX_JSON_LD_NODES,
  MAX_JSON_LD_TOTAL_BYTES,
  parseJsonLdPrice,
} from './jsonld-product'
import type { AdapterParseResult } from './types'

const URL_ = 'https://fixture.invalid/item'
const GTIN_A = '4750000000017'
const GTIN_B = '4750000000031'

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

function script(value: unknown, attributes = 'type="application/ld+json"'): string {
  return `<script ${attributes}>${typeof value === 'string' ? value : JSON.stringify(value)}</script>`
}

const parse = (html: string): AdapterParseResult => jsonLdProductAdapter.parse(html, URL_)
const offer = (price: unknown, extra: Record<string, unknown> = {}) => ({ '@type': 'Offer', price, priceCurrency: 'EUR', ...extra })
const product = (offers: unknown, extra: Record<string, unknown> = {}) => ({ '@type': 'Product', name: 'Fixture', gtin13: GTIN_A, sku: 'FIX-1', offers, ...extra })
const code = (html: string) => {
  const result = parse(html)
  return result.ok ? 'ok' : result.code
}

/** All permutations of a small array (n ≤ 4). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]))
}

describe('fixtures are valid synthetic GTINs', () => {
  it.each([GTIN_A, GTIN_B, '04750000000017', '4750000000024'])('%s', (gtin) => {
    expect(normalizeGtin(gtin).kind).toBe('valid_gtin')
  })
})

describe('parseJsonLdPrice — machine-readable only', () => {
  it.each([
    ['12.34', 1234],
    ['12', 1200],
    ['12.3', 1230],
    ['0.99', 99],
    [12.34, 1234],
    [12, 1200],
  ])('accepts %j', (input, cents) => {
    expect(parseJsonLdPrice(input)).toEqual({ kind: 'value', cents })
  })

  it.each([
    '12,34', '12,34 €', '€12.34', '1.234,56', '1,234.56', "1'234.56", '1 234.56', '1 234', 'EUR 12.34', '12.34 EUR',
    '12.345', '1e3', '+12', '012.00', ' 12.34', '12.34 ', '12.', '.5', 'NaN', 'Infinity', 'twelve', '0x10',
    1e21, 12.345, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY, {}, [], true,
  ])('rejects %j (no locale guessing, no rounding)', (input) => {
    expect(parseJsonLdPrice(input)).toEqual({ kind: 'invalid' })
  })

  it.each(['0', '0.00', 0, '-1', -1, '-0.01'])('zero/negative %j is non-positive, never a price', (input) => {
    expect(parseJsonLdPrice(input)).toEqual({ kind: 'non_positive' })
  })

  it.each([null, undefined, ''])('missing %j', (input) => {
    expect(parseJsonLdPrice(input)).toEqual({ kind: 'missing' })
  })
})

describe('single Offer → observedPrice only', () => {
  it('parses the basic fixture: observed set, regular/sale null', () => {
    expect(parse(fixture('basic-product.html'))).toEqual({
      ok: true,
      url: URL_,
      sourceProductId: 'synthetic-product-1',
      title: 'Synthetic Hydrating Shampoo',
      brand: 'Fixture Labs',
      ean: GTIN_A,
      manufacturerSku: 'FIX-SHAMPOO-250',
      sizeText: '250 ml',
      observation: { observedCents: 1890, regularCents: null, saleCents: null, currency: 'EUR', availability: 'in_stock' },
      aggregate: null,
      warnings: [],
    })
  })

  it('"12.34" string and 12.34 number both become observed 12.34, never regular or sale', () => {
    for (const price of ['12.34', 12.34]) {
      expect(parse(script(product(offer(price))))).toMatchObject({
        ok: true,
        observation: { observedCents: 1234, regularCents: null, saleCents: null },
      })
    }
  })

  it.each(['12,34', '12,34 €', '€12.34', '1.234,56', '1,234.56'])('locale-formatted %j is invalid_price on the full path', (price) => {
    expect(code(script(product(offer(price))))).toBe('invalid_price')
  })

  it.each([
    ['zero', '0', 'non_positive_price'],
    ['zero number', 0, 'non_positive_price'],
    ['negative', '-1', 'non_positive_price'],
    ['text', 'call us', 'invalid_price'],
    ['exponent', '1e2', 'invalid_price'],
  ])('%s price never becomes an observation', (_label, price, expected) => {
    expect(code(script(product(offer(price))))).toBe(expected)
  })

  it('missing currency is missing_currency, USD is unsupported_currency — never assumed EUR', () => {
    expect(code(script(product({ '@type': 'Offer', price: '10.00' })))).toBe('missing_currency')
    expect(code(script(product(offer('10.00', { priceCurrency: 'USD' }))))).toBe('unsupported_currency')
    expect(code(script(product(offer('10.00', { priceCurrency: '€' }))))).toBe('unsupported_currency')
  })

  it('a GTIN with a leading zero stays a string with the zero', () => {
    const html = script(product(offer('5.00'), { gtin14: '04750000000017', gtin13: undefined }))
    expect(parse(html)).toMatchObject({ ok: true, ean: '04750000000017' })
    // GTIN-13 and its zero-padded GTIN-14 form are the same identifier, not a conflict.
    expect(parse(script(product(offer('5.00'), { gtin14: '04750000000017' })))).toMatchObject({ ok: true, ean: GTIN_A, warnings: [] })
  })
})

describe('regular / sale semantics', () => {
  it('a schema.org StrikethroughPrice above the current price yields regular + sale = observed', () => {
    expect(parse(fixture('list-price-sale.html'))).toMatchObject({
      ok: true,
      observation: { observedCents: 1520, regularCents: 1900, saleCents: 1520, currency: 'EUR' },
      warnings: [],
    })
  })

  it('ListPrice equal to the current price is regular without a sale', () => {
    const html = script(product(offer('20.00', {
      priceSpecification: { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/ListPrice', price: '20.00', priceCurrency: 'EUR' },
    })))
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 2000, regularCents: 2000, saleCents: null } })
  })

  it('two different prices without explicit priceType are ambiguous, not sale/regular by size', () => {
    const html = script(product(offer('15.00', { priceSpecification: { '@type': 'UnitPriceSpecification', price: '19.00', priceCurrency: 'EUR' } })))
    expect(code(html)).toBe('ambiguous_offers')
  })

  it('a reference price below the observed price is ignored, not turned into a sale', () => {
    const html = script(product(offer('20.00', {
      priceSpecification: { '@type': 'UnitPriceSpecification', priceType: 'StrikethroughPrice', price: '18.00', priceCurrency: 'EUR' },
    })))
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 2000, regularCents: null, saleCents: null }, warnings: ['reference_price_ignored'] })
  })

  it('MSRP/SRP/other price types are not regular prices', () => {
    const html = script(product(offer('20.00', {
      priceSpecification: { '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/MSRP', price: '25.00', priceCurrency: 'EUR' },
    })))
    expect(parse(html)).toMatchObject({ ok: true, observation: { regularCents: null, saleCents: null }, warnings: ['unsupported_price_specification_ignored'] })
  })

  it('unit / tiered / time-bound price specifications are never the product price', () => {
    for (const qualifier of [{ referenceQuantity: { value: 100, unitCode: 'MLT' } }, { eligibleQuantity: { minValue: 3 } }, { validThrough: '2026-01-01' }, { minPrice: '1.00' }]) {
      const html = script(product({ '@type': 'Offer', priceCurrency: 'EUR', priceSpecification: { '@type': 'UnitPriceSpecification', price: '3.50', priceCurrency: 'EUR', ...qualifier } }))
      expect(code(html)).toBe('no_price')
    }
  })
})

describe('multiple Offers', () => {
  it('€12 + €12 collapses deterministically with a warning', () => {
    const html = script(product([offer('12.00', { availability: 'InStock' }), offer(12, { availability: 'https://schema.org/InStock' })]))
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 1200, availability: 'in_stock' }, warnings: ['duplicate_offers_collapsed'] })
  })

  it('€12 + €13 is ambiguous_offers (never first, never minimum)', () => {
    expect(code(script(product([offer('12.00'), offer('13.00')])))).toBe('ambiguous_offers')
    expect(code(script(product([offer('13.00'), offer('12.00')])))).toBe('ambiguous_offers')
  })

  it('size variants with different prices are ambiguous', () => {
    expect(code(fixture('variant-offers.html'))).toBe('ambiguous_offers')
  })

  it('EUR + USD plausible offers are conflicting_currencies even when EUR is listed first', () => {
    expect(code(fixture('array-products.html'))).toBe('conflicting_currencies')
    expect(code(script(product([offer('10.00'), offer('11.00', { priceCurrency: 'USD' })])))).toBe('conflicting_currencies')
    expect(code(script(product([offer('10.00'), offer('10.00', { priceCurrency: 'USD' })])))).toBe('conflicting_currencies')
  })

  it('Offer.price disagreeing with its own plain priceSpecification is ambiguous', () => {
    const html = script(product(offer('10.00', { priceSpecification: { '@type': 'PriceSpecification', price: '11.00', priceCurrency: 'EUR' } })))
    expect(code(html)).toBe('ambiguous_offers')
  })

  it('one invalid offer price poisons the product (cannot prove the valid one is the right one)', () => {
    expect(code(script(product([offer('10.00'), offer('10,00')])))).toBe('invalid_price')
  })

  it('same price, different availability collapses with availability unknown and a warning', () => {
    const html = script(product([offer('10.00', { availability: 'InStock' }), offer('10.00', { availability: 'OutOfStock' })]))
    expect(parse(html)).toMatchObject({
      ok: true,
      observation: { observedCents: 1000, availability: 'unknown' },
      warnings: ['conflicting_availability', 'duplicate_offers_collapsed'],
    })
  })

  it('used/refurbished offers are excluded, not compared', () => {
    const html = script(product([offer('5.00', { itemCondition: 'https://schema.org/UsedCondition' }), offer('10.00', { itemCondition: 'NewCondition' })]))
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 1000 }, warnings: ['non_new_condition_offer_ignored'] })
    expect(code(script(product(offer('5.00', { itemCondition: 'RefurbishedCondition' }))))).toBe('no_offer')
  })

  it('an offer without any price is ignored with a warning; alone it is no_price', () => {
    const html = script(product([{ '@type': 'Offer', priceCurrency: 'EUR' }, offer('10.00')]))
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 1000 }, warnings: ['offer_without_price_ignored'] })
    expect(code(script(product({ '@type': 'Offer', priceCurrency: 'EUR' })))).toBe('no_price')
  })
})

describe('AggregateOffer', () => {
  it('lowPrice/highPrice only → aggregate_offer_only with diagnostics, no observed price', () => {
    expect(parse(fixture('graph-aggregate.html'))).toEqual({
      ok: false,
      code: 'aggregate_offer_only',
      aggregate: { lowCents: 123450, highCents: 140000, currency: 'EUR', offerCount: 3 },
    })
  })

  it('lowPrice never becomes observed or regular price even when low == high', () => {
    const html = script(product({ '@type': 'AggregateOffer', lowPrice: '9.00', highPrice: '9.00', priceCurrency: 'EUR' }))
    const result = parse(html)
    expect(result).toMatchObject({ ok: false, code: 'aggregate_offer_only' })
  })

  it('a separate Offer inside the aggregate range is used; the aggregate stays diagnostic', () => {
    const html = script(product([offer('15.00'), { '@type': 'AggregateOffer', lowPrice: '12.00', highPrice: '20.00', priceCurrency: 'EUR', offerCount: 4 }]))
    expect(parse(html)).toMatchObject({
      ok: true,
      observation: { observedCents: 1500, regularCents: null, saleCents: null },
      aggregate: { lowCents: 1200, highCents: 2000, currency: 'EUR', offerCount: 4 },
      warnings: ['aggregate_offer_ignored'],
    })
  })

  it('an Offer outside the aggregate range or in another currency conflicts', () => {
    expect(code(script(product([offer('25.00'), { '@type': 'AggregateOffer', lowPrice: '12.00', highPrice: '20.00', priceCurrency: 'EUR' }])))).toBe('ambiguous_offers')
    expect(code(script(product([offer('15.00'), { '@type': 'AggregateOffer', lowPrice: '12.00', highPrice: '20.00', priceCurrency: 'USD' }])))).toBe('conflicting_currencies')
  })

  it('nested offers of an AggregateOffer are real offers and follow the multi-offer rules', () => {
    const agg = (prices: string[]) => script(product({ '@type': 'AggregateOffer', lowPrice: '10.00', highPrice: '12.00', priceCurrency: 'EUR', offers: prices.map((p) => offer(p)) }))
    expect(code(agg(['10.00', '12.00']))).toBe('ambiguous_offers')
    expect(parse(agg(['10.00', '10.00']))).toMatchObject({ ok: true, observation: { observedCents: 1000 } })
  })
})

describe('multiple Products', () => {
  it('two different Products with usable prices are ambiguous_product in every order', () => {
    expect(code(fixture('two-products.html'))).toBe('ambiguous_product')
    const a = product(offer('10.00'), { gtin13: GTIN_A })
    const b = product(offer('14.00'), { gtin13: GTIN_B })
    for (const order of permutations([a, b])) expect(code(script(order))).toBe('ambiguous_product')
  })

  it('a usable Product plus a plausible-but-unusable one is ambiguous_product (strict policy)', () => {
    const usable = product(offer('10.00'), { gtin13: GTIN_A })
    const unusable = product(offer('10,00'), { gtin13: GTIN_B })
    for (const order of permutations([usable, unusable])) expect(code(script(order))).toBe('ambiguous_product')
  })

  it('a Product without offers (e.g. a mention) is ignored with a warning', () => {
    const html = script([product(undefined, { name: 'Mention only' }), product(offer('10.00'))])
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 1000 }, warnings: expect.arrayContaining(['product_without_offers_ignored']) })
  })

  it('the same entity (same GTIN, same price state) declared twice collapses', () => {
    const html = script([product(offer('10.00'), { gtin13: GTIN_A, name: 'A', sku: undefined }), product(offer(10), { gtin13: GTIN_A, sku: 'X-1' })])
    expect(parse(html)).toMatchObject({ ok: true, ean: GTIN_A, manufacturerSku: 'X-1', observation: { observedCents: 1000 }, warnings: expect.arrayContaining(['equivalent_products_collapsed']) })
  })

  it('same GTIN but different prices, or identical prices without proof of identity, stay ambiguous', () => {
    expect(code(script([product(offer('10.00'), { gtin13: GTIN_A }), product(offer('11.00'), { gtin13: GTIN_A })]))).toBe('ambiguous_product')
    expect(code(script([product(offer('10.00'), { name: 'A', gtin13: undefined, sku: undefined }), product(offer('10.00'), { name: 'B', gtin13: undefined, sku: undefined })]))).toBe('ambiguous_product')
  })

  it('a malformed GTIN is never used as identity proof', () => {
    const html = script([product(offer('10.00'), { gtin13: '4750000000018' }), product(offer('10.00'), { gtin13: '4750000000018' })])
    expect(code(html)).toBe('ambiguous_product')
  })

  it('nested related/variant products are not candidates; mainEntity is', () => {
    const main = product(offer('10.00'), { '@id': '#main', isRelatedTo: product(offer('99.00')) })
    expect(parse(script(main))).toMatchObject({ ok: true, observation: { observedCents: 1000 } })
    const page = { '@type': 'ItemPage', mainEntity: product(offer('7.00')) }
    expect(parse(script(page))).toMatchObject({ ok: true, observation: { observedCents: 700 } })
  })

  it('no Product at all is no_product', () => {
    expect(code(script({ '@type': 'WebPage' }))).toBe('no_product')
    expect(code(script({ '@type': 'https://example.com/Product', offers: offer('1.00') }))).toBe('no_product')
  })
})

describe('determinism', () => {
  it('Offer order and priceSpecification order never change the outcome', () => {
    const offers = [offer('10.00', { availability: 'InStock' }), offer(10, { availability: 'InStock' }), { '@type': 'Offer', priceCurrency: 'EUR' }]
    const results = permutations(offers).map((order) => JSON.stringify(parse(script(product(order)))))
    expect(new Set(results).size).toBe(1)

    const specs = [
      { '@type': 'UnitPriceSpecification', price: '15.20', priceCurrency: 'EUR' },
      { '@type': 'UnitPriceSpecification', priceType: 'StrikethroughPrice', price: '19.00', priceCurrency: 'EUR' },
      { '@type': 'UnitPriceSpecification', priceType: 'MSRP', price: '25.00', priceCurrency: 'EUR' },
    ]
    const specResults = permutations(specs).map((order) => JSON.stringify(parse(script(product(offer('15.20', { priceSpecification: order }))))))
    expect(new Set(specResults).size).toBe(1)
  })

  it('Product order never changes the outcome', () => {
    const items = [product(offer('10.00'), { gtin13: GTIN_A }), product(offer(10), { gtin13: GTIN_A }), product(undefined)]
    const results = permutations(items).map((order) => JSON.stringify(parse(script(order))))
    expect(new Set(results).size).toBe(1)
  })
})

describe('identifiers', () => {
  it('malformed or numeric GTINs are dropped with a warning, product still parses', () => {
    expect(parse(script(product(offer('5.00'), { gtin13: '4750000000018' })))).toMatchObject({ ok: true, ean: null, warnings: expect.arrayContaining(['malformed_identifier']) })
    expect(parse(script(product(offer('5.00'), { gtin13: 4750000000017 })))).toMatchObject({ ok: true, ean: null, warnings: expect.arrayContaining(['malformed_identifier']) })
    expect(parse(script(product(offer('5.00'), { gtin8: GTIN_A, gtin13: undefined })))).toMatchObject({ ok: true, ean: null, warnings: expect.arrayContaining(['malformed_identifier']) })
  })

  it('conflicting valid GTINs give no ean', () => {
    expect(parse(script(product(offer('5.00'), { gtin13: GTIN_A, gtin: GTIN_B })))).toMatchObject({ ok: true, ean: null, warnings: expect.arrayContaining(['conflicting_identifiers']) })
  })

  it('missing identifiers are warnings, oversized identifiers are dropped', () => {
    expect(parse(script(product(offer('5.00'), { gtin13: undefined, sku: undefined })))).toMatchObject({ ok: true, warnings: ['missing_gtin', 'missing_sku'] })
    expect(parse(script(product(offer('5.00'), { sku: 'S'.repeat(201), gtin: GTIN_A })))).toMatchObject({ ok: true, manufacturerSku: null, warnings: ['malformed_identifier'] })
  })

  it('brand as string or object, @type arrays and schema.org URLs are understood', () => {
    expect(parse(script({ '@type': ['Thing', 'https://schema.org/Product'], brand: 'Plain', offers: { '@type': 'http://schema.org/Offer', price: '3.00', priceCurrency: 'EUR' } })))
      .toMatchObject({ ok: true, brand: 'Plain', observation: { observedCents: 300 } })
    expect(parse(script(product(offer('3.00'), { brand: { '@type': 'Brand', name: 'Obj' } })))).toMatchObject({ ok: true, brand: 'Obj' })
  })
})

describe('availability', () => {
  it.each([
    ['InStock', 'in_stock'],
    ['https://schema.org/InStock', 'in_stock'],
    ['http://schema.org/LimitedAvailability', 'in_stock'],
    ['OutOfStock', 'out_of_stock'],
    ['SoldOut', 'out_of_stock'],
    ['Discontinued', 'out_of_stock'],
    ['PreOrder', 'preorder'],
    ['BackOrder', 'preorder'],
  ])('%s → %s', (value, expected) => {
    expect(parse(script(product(offer('5.00', { availability: value }))))).toMatchObject({ ok: true, observation: { availability: expected } })
  })

  it('unknown availability is unknown with a warning, never in_stock', () => {
    expect(parse(script(product(offer('5.00', { availability: 'https://example.com/InStock' }))))).toMatchObject({
      ok: true, observation: { availability: 'unknown' }, warnings: expect.arrayContaining(['unknown_availability']),
    })
  })
})

describe('script extraction security', () => {
  it('ignores commented-out JSON-LD, ordinary scripts and data-type; accepts mixed-case type', () => {
    expect(parse(fixture('commented-and-js.html'))).toMatchObject({ ok: true, title: 'Real', observation: { observedCents: 999 } })
  })

  it('a `</script>` inside a JSON string ends the element like a browser (invalid JSON-LD, fail closed)', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","name":"x</script>","offers":{"@type":"Offer","price":"1.00","priceCurrency":"EUR"}}</script>'
    expect(code(html)).toBe('invalid_jsonld')
  })

  it('HTML entities are not decoded inside JSON-LD', () => {
    expect(code('<script type="application/ld+json">{&quot;@type&quot;:&quot;Product&quot;}</script>')).toBe('invalid_jsonld')
  })

  it('a malformed block anywhere fails closed (it could hide a second Product)', () => {
    expect(code(script('{broken') + script(product(offer('10.00'))))).toBe('invalid_jsonld')
  })

  it('does not execute JavaScript or JSON-LD contents', () => {
    delete (globalThis as { competitorAdapterExecuted?: boolean }).competitorAdapterExecuted
    const html = '<script>globalThis.competitorAdapterExecuted = true</script>' +
      script(product(offer('5.00'), { name: '<img src=x onerror="globalThis.competitorAdapterExecuted=true">' }))
    const result = parse(html)
    expect((globalThis as { competitorAdapterExecuted?: boolean }).competitorAdapterExecuted).toBeUndefined()
    expect(result).toMatchObject({ ok: true, title: '<img src=x onerror="globalThis.competitorAdapterExecuted=true">' })
  })

  it('__proto__ / constructor keys do not create products or pollute prototypes', () => {
    const html = '<script type="application/ld+json">{"__proto__":{"@type":"Product","polluted":true,"offers":{"@type":"Offer","price":"1.00","priceCurrency":"EUR"}},"constructor":{"prototype":{"polluted":true}}}</script>'
    expect(code(html)).toBe('no_product')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('duplicate keys follow JSON.parse (last wins) and stay deterministic', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"1.00","price":"2.00","priceCurrency":"EUR"}}</script>'
    expect(parse(html)).toMatchObject({ ok: true, observation: { observedCents: 200 } })
  })

  it('lone surrogates in strings are tolerated as text and do not affect prices', () => {
    expect(parse(script(product(offer('4.00'), { name: 'bad \ud800 text' })))).toMatchObject({ ok: true, observation: { observedCents: 400 } })
  })

  it('duplicate @id offer references are ambiguous', () => {
    const html = script({ '@graph': [product({ '@id': '#o' }), { '@id': '#o', '@type': 'Offer', price: '1.00', priceCurrency: 'EUR' }, { '@id': '#o', '@type': 'Offer', price: '2.00', priceCurrency: 'EUR' }] })
    expect(code(html)).toBe('ambiguous_offers')
  })

  it('cyclic AggregateOffer references terminate', () => {
    const html = script({ '@graph': [{ '@id': '#p', '@type': 'Product', offers: { '@id': '#a' } }, { '@id': '#a', '@type': 'AggregateOffer', offers: { '@id': '#a' } }] })
    expect(parse(html)).toMatchObject({ ok: false, code: 'aggregate_offer_only' })
  })
})

describe('limits', () => {
  it('block count', () => {
    expect(code(Array.from({ length: MAX_JSON_LD_BLOCKS + 1 }, () => script({ '@type': 'Thing' })).join(''))).toBe('too_many_jsonld_blocks')
  })

  it('per-block bytes (before JSON.parse, whitespace included)', () => {
    expect(code(script(`"${'x'.repeat(MAX_JSON_LD_BLOCK_BYTES)}"`))).toBe('jsonld_block_too_large')
    expect(code(script(`${' '.repeat(MAX_JSON_LD_BLOCK_BYTES)}{}`))).toBe('jsonld_block_too_large')
  })

  it('total bytes', () => {
    const payload = JSON.stringify({ value: 'x'.repeat(Math.floor(MAX_JSON_LD_TOTAL_BYTES / 3)) })
    expect(code(script(payload).repeat(4))).toBe('jsonld_total_too_large')
  })

  it('node count', () => {
    expect(code(script(Array.from({ length: MAX_JSON_LD_NODES + 1 }, () => ({ '@type': 'Thing' }))))).toBe('jsonld_too_complex')
  })

  it('container depth', () => {
    let nested: unknown = product(offer('1.00'))
    for (let i = 0; i <= MAX_JSON_LD_DEPTH; i += 1) nested = { '@graph': [nested] }
    expect(code(script(nested))).toBe('jsonld_too_complex')
  })

  it('deeply nested plain arrays/objects are bounded (no stack overflow)', () => {
    expect(['jsonld_too_complex', 'invalid_jsonld', 'no_product']).toContain(code(script(`${'['.repeat(50_000)}${']'.repeat(50_000)}`)))
    expect(code(script(`{"@type":"Product","x":${'{"a":'.repeat(20_000)}1${'}'.repeat(20_000)},"offers":{"@type":"Offer","price":"1.00","priceCurrency":"EUR"}}`))).toBe('ok')
  })

  it('list length per entity', () => {
    expect(code(script(product(Array.from({ length: MAX_JSON_LD_LIST_ITEMS + 1 }, () => offer('1.00')))))).toBe('jsonld_too_complex')
  })

  it('no JSON-LD / malformed / no offers', () => {
    expect(code('<html></html>')).toBe('no_jsonld')
    expect(code(script('{"@type":'))).toBe('invalid_jsonld')
    expect(code(script(product(undefined)))).toBe('no_offer')
  })
})

describe('end-to-end: HTML → adapter → normalizeObservation', () => {
  it('the adapter output round-trips through normalizeObservation unchanged', () => {
    for (const [price, cents] of [['12.34', 1234], [12.34, 1234]] as const) {
      const result = parse(script(product(offer(price))))
      if (!result.ok) throw new Error(result.code)
      const again = normalizeObservation({
        observedPrice: (result.observation.observedCents / 100).toFixed(2),
        currency: result.observation.currency,
        availability: result.observation.availability,
      })
      expect(again).toEqual({ ok: true, value: { ...result.observation, observedCents: cents } })
      expect(observationStateHash(result.observation)).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('0 / invalid / USD never produce an observation', () => {
    expect(parse(script(product(offer('0'))))).toEqual({ ok: false, code: 'non_positive_price' })
    expect(parse(script(product(offer('abc'))))).toEqual({ ok: false, code: 'invalid_price' })
    expect(parse(script(product(offer('10.00', { priceCurrency: 'USD' }))))).toEqual({ ok: false, code: 'unsupported_currency' })
  })
})
