import { describe, expect, it } from 'vitest'
import {
  bestAutomaticDiscount, formatCents, grinsCents, grossCents, parseDiscounts, parseNopExport, parseProLinks, parseUnits,
  reconcile, toCsv, type NopProductRow,
} from './price-reconciliation'

const nop = (overrides: Partial<NopProductRow> = {}): NopProductRow => ({
  productId: '1', sku: 'SKU', published: true, price: '19.4214', oldPrice: '.0000', taxCategoryId: '6', taxRate: '21',
  isTaxExempt: false, pricesIncludeTax: false, discounts: '', name: 'Product', ...overrides,
})

describe('integer money helpers', () => {
  it('parses nopCommerce and GrinS decimals exactly', () => {
    expect(parseUnits('19.4214')).toBe(194_214n)
    expect(parseUnits('.0000')).toBe(0n)
    expect(parseUnits('23.5')).toBe(235_000n)
    expect(parseUnits('1.00005')).toBe(10_001n)
    for (const bad of ['', 'NULL', '-1', '1e2', '1,5', 'abc']) expect(parseUnits(bad)).toBeNull()
    expect(grinsCents('23.5')).toBe(2350n)
    expect(grinsCents('0')).toBeNull()
    expect(formatCents(960n)).toBe('9.60')
  })

  it('reproduces live hairshop.lv gross prices from nopCommerce net prices (21% PVN, half-up)', () => {
    expect(formatCents(grossCents(194_214n, 210_000n))).toBe('23.50') // SKU 2
    expect(formatCents(grossCents(99_173n, 210_000n))).toBe('12.00') // SKU 3
    expect(formatCents(grossCents(144_628n, 210_000n))).toBe('17.50') // K6667
    expect(formatCents(grossCents(10_000n, 0n))).toBe('1.00')
  })
})

describe('discounts', () => {
  const parsed = parseDiscounts('4:p20.0000:0.0000:;37:p15.0000:0.0000:c;2:p10.0000:0.0000:r;9:a1.5000:0.0000:k;10:a1.0000:0.0000:k;bad')

  it('parses flags and ignores malformed entries', () => {
    expect(parsed.map((discount) => [discount.id, discount.requiresCoupon, discount.hasRequirements, discount.cumulative])).toEqual([
      ['4', false, false, false], ['37', true, false, false], ['2', false, true, false], ['9', false, false, true], ['10', false, false, true],
    ])
  })

  it('applies only automatic discounts (no coupon, no requirements), best single vs cumulative sum', () => {
    expect(bestAutomaticDiscount(99_173n, parsed.slice(0, 3))).toEqual({ units: 19_835n, ids: ['4'] })
    expect(bestAutomaticDiscount(99_173n, parsed)).toEqual({ units: 25_000n, ids: ['9', '10'] })
    expect(bestAutomaticDiscount(500_000n, parsed)).toEqual({ units: 100_000n, ids: ['4'] })
    expect(bestAutomaticDiscount(10_000n, parseDiscounts('1:a5.0000:0.0000:'))).toEqual({ units: 10_000n, ids: ['1'] })
    expect(bestAutomaticDiscount(1_000_000n, parseDiscounts('1:p50.0000:20.0000:'))).toEqual({ units: 200_000n, ids: ['1'] })
  })
})

describe('reconcile', () => {
  const grins = [
    { sku: 'P1', price1: '23.5', price2: '18.5' },
    { sku: 'P2', price1: '14.5', price2: '12' },
    { sku: 'SEP', price1: '30', price2: '20' },
    { sku: 'DUP', price1: '1', price2: '1' },
    { sku: 'DUP', price1: '2', price2: '2' },
    { sku: 'LINKED', price1: '23.5', price2: '10' },
    { sku: 'GRINS-ONLY', price1: '5', price2: '4' },
    { sku: 'PROMO', price1: '14.5', price2: '12' },
    { sku: 'OLD', price1: '23.5', price2: '18.5' },
    { sku: 'COND', price1: '30', price2: '20' },
    { sku: 'NOTAX', price1: '30', price2: '20' },
  ]
  const rows = [
    nop({ productId: '1', sku: 'P1' }),
    nop({ productId: '2', sku: 'P2', price: '9.9173' }),
    nop({ productId: '3', sku: 'SEP' }),
    nop({ productId: '4', sku: 'PROMO', price: '9.9173', discounts: '4:p20.0000:0.0000:' }),
    nop({ productId: '5', sku: 'OLD', oldPrice: '24.0000' }),
    nop({ productId: '6', sku: 'DUP' }),
    nop({ productId: '7', sku: '' }),
    nop({ productId: '8', sku: 'NOT-IN-GRINS' }),
    nop({ productId: '9', sku: 'COND', discounts: '2:p10.0000:0.0000:r' }),
    nop({ productId: '10', sku: 'NOTAX', taxRate: '' }),
    nop({ productId: '11', sku: 'WRONG-SKU' }),
  ]

  it('classifies every case and proposes a base price only when decidable', () => {
    const result = reconcile(rows, grins, new Map([['nop390-11', 'LINKED']]))
    const byId = new Map(result.rows.map((row) => [row.nopProductId, row]))
    expect(byId.get('1')).toMatchObject({ classification: 'matches_price1', nopGross: '23.50', preserveBasePrice: '23.50', baseMatches: 'price1', matchedBy: 'sku' })
    expect(byId.get('2')).toMatchObject({ classification: 'matches_price2', nopGross: '12.00', preserveBasePrice: '12.00' })
    expect(byId.get('3')).toMatchObject({ classification: 'separate_price', nopGross: '23.50', preserveBasePrice: '23.50', baseMatches: 'none' })
    expect(byId.get('4')).toMatchObject({ classification: 'promotion', finalGross: '9.60', preserveBasePrice: '12.00', automaticDiscounts: '4:20.00%' })
    expect(byId.get('5')).toMatchObject({ classification: 'promotion', nopOldPriceGross: '29.04', preserveBasePrice: '23.50', reasons: 'old_price_shown' })
    expect(byId.get('6')).toMatchObject({ classification: 'undetermined', preserveBasePrice: '', reasons: 'grins_sku_duplicate' })
    expect(byId.get('7')).toMatchObject({ classification: 'undetermined', reasons: 'no_match_key', matchedBy: '' })
    expect(byId.get('8')).toMatchObject({ classification: 'undetermined', reasons: 'grins_item_missing' })
    expect(byId.get('9')).toMatchObject({ classification: 'undetermined', reasons: 'conditional_discount', conditionalDiscounts: '2:10.00%' })
    expect(byId.get('10')).toMatchObject({ classification: 'undetermined', nopGross: '', reasons: 'tax_rate_unknown' })
    expect(byId.get('11')).toMatchObject({ classification: 'matches_price1', matchedBy: 'pro_external_id', grinsPrice1: '23.50' })
    expect(result.summary).toMatchObject({
      nopProducts: 11, grinsItems: 11, grinsOnlySkus: 1, matchedByProExternalId: 1, matchedBySku: 9,
      byClassification: { matches_price1: 2, matches_price2: 1, separate_price: 1, promotion: 2, undetermined: 5 },
    })
  })

  it('flags duplicated nopCommerce SKUs only when matching by SKU', () => {
    const duplicated = [nop({ productId: '1', sku: 'P1' }), nop({ productId: '2', sku: 'P1' })]
    expect(reconcile(duplicated, grins).rows.every((row) => row.reasons === 'nop_sku_duplicate')).toBe(true)
    const linked = reconcile(duplicated, grins, new Map([['1', 'P1'], ['2', 'SEP']])).rows
    expect(linked.map((row) => row.classification)).toEqual(['matches_price1', 'separate_price'])
  })

  it('treats a store configured with tax-inclusive prices as already gross', () => {
    const [row] = reconcile([nop({ sku: 'P1', price: '23.5000', pricesIncludeTax: true })], grins).rows
    expect(row).toMatchObject({ nopGross: '23.50', classification: 'matches_price1' })
  })
})

describe('file formats', () => {
  it('parses the sqlcmd export (tab-separated, NULLs, optional header)', () => {
    const tsv = '﻿ProductId\tSku\n12545\t3\t1\t9.9173\t.0000\t6\t21\t0\t0\t4:p20.0000:0.0000:\tSTAPIZ balm\r\n12471\tNULL\t0\t6.6120\tNULL\t6\tNULL\t0\t0\tNULL\tNULL\n'
    expect(parseNopExport(tsv)).toEqual([
      { productId: '12545', sku: '3', published: true, price: '9.9173', oldPrice: '.0000', taxCategoryId: '6', taxRate: '21', isTaxExempt: false, pricesIncludeTax: false, discounts: '4:p20.0000:0.0000:', name: 'STAPIZ balm' },
      { productId: '12471', sku: '', published: false, price: '6.6120', oldPrice: 'NULL', taxCategoryId: '6', taxRate: '', isTaxExempt: false, pricesIncludeTax: false, discounts: '', name: '' },
    ])
    expect(parseProLinks('id\texternalId\n12483\tK6667\nnop390-5\tA\nx\tNULL\n')).toEqual(new Map([['12483', 'K6667'], ['nop390-5', 'A']]))
  })

  it('writes CSV with quoting and spreadsheet-formula neutralisation, product columns only', () => {
    const { rows } = reconcile([nop({ sku: 'P1', name: '=HYPERLINK("x"), "quoted"' })], [{ sku: 'P1', price1: '23.5', price2: '1' }])
    const csv = toCsv(rows)
    const [header, line] = csv.trim().split('\n')
    expect(header).toBe('sku,nopProductId,matchedBy,published,name,grinsPrice1,grinsPrice2,nopNet,nopGross,nopOldPriceGross,automaticDiscounts,finalGross,couponDiscounts,conditionalDiscounts,baseMatches,classification,reasons,preserveBasePrice')
    expect(line).toContain('"\'=HYPERLINK(""x""), ""quoted"""')
    expect(header).not.toMatch(/email|phone|customer|address|user/iu)
  })
})
