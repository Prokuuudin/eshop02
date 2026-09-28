import { describe,expect,it } from 'vitest'
import { allowedStock,isStandardEanUpc,median,normalizedEan,skuKeys,zeroStockReason } from './second-new-product-audit'

describe('second new-product audit helpers',()=>{
  it('uses only allowed warehouses and clamps negatives',()=>expect(allowedStock({10000:2,10001:-4,10003:99,10005:1})).toBe(3))
  it('normalizes EAN without treating it as identity by itself',()=>expect(normalizedEan(' 123-45 ')).toBe('12345'))
  it('validates standard EAN/UPC length and check digit',()=>{expect(isStandardEanUpc('4006381333931')).toBe(true);expect(isStandardEanUpc('12345678')).toBe(false);expect(isStandardEanUpc('ABC123')).toBe(false)})
  it('builds controlled case, zero, dot and space SKU keys',()=>expect(skuKeys(' 001. 2 ')).toEqual(expect.arrayContaining(['001. 2','1. 2','001 2','001.2'])))
  it('calculates median',()=>{expect(median([9,1,5])).toBe(5);expect(median([1,3])).toBe(2)})
  it('identifies excluded-only stock before missing allowed fields',()=>expect(zeroStockReason({10003:4})).toBe('EXCLUDED_WAREHOUSE_ONLY'))
  it('identifies negative and all-zero snapshots',()=>{expect(zeroStockReason({10000:-1,10001:0,10002:0,10005:0})).toBe('NEGATIVE_VALUES');expect(zeroStockReason({10000:0,10001:0,10002:0,10005:0})).toBe('ALL_WAREHOUSES_ZERO')})
})
