import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIRST_IMPORT_ALLOWLIST_SHA, FIRST_IMPORT_BASELINE, FIRST_IMPORT_XML_SHA, assertImportBaseline, parseImportAllowlist, prepareImportPlan, sha256, validateEntry, type ImportAllowlist, type ImportEntry } from './first-new-product-import'

const content=readFileSync('first-new-product-import-allowlist.json'), allowlist=JSON.parse(content.toString()) as ImportAllowlist, entry=allowlist.entries[0]
const changed=(patch:Partial<ImportEntry>):ImportEntry=>({...entry,...patch})
describe('first new-product import immutable gates',()=>{
  it('binds XML SHA',()=>expect(allowlist.xmlSha256).toBe(FIRST_IMPORT_XML_SHA))
  it('rejects allowlist SHA drift',()=>expect(()=>parseImportAllowlist(Buffer.concat([content,Buffer.from(' ')]))).toThrow('ALLOWLIST_SHA'))
  it('accepts the bound allowlist SHA',()=>expect(sha256(content)).toBe(FIRST_IMPORT_ALLOWLIST_SHA))
  it('rejects baseline drift',()=>expect(()=>assertImportBaseline({...FIRST_IMPORT_BASELINE,productCount:1})).toThrow('BASELINE_DRIFT'))
  it('rejects duplicate allowlist entry',()=>{const x={...allowlist,entries:[entry,entry],entryCount:2};const b=Buffer.from(JSON.stringify(x));expect(()=>parseImportAllowlist(b,sha256(b))).toThrow('DUPLICATE_ALLOWLIST')})
  it('preserves leading-zero SKU',()=>{const x=changed({xmlSku:'00123',externalId:'00123',productTitle:'00123'});validateEntry(x);expect(x.xmlSku).toBe('00123')})
  it('preserves decimal price text',()=>expect(entry.price2).toMatch(/^\d+\.\d{2}$/u))
  it('excludes price2 <= 0',()=>expect(()=>validateEntry(changed({price2:'0.00'}))).toThrow('PRICE_INVALID'))
  it('excludes zero allowed stock',()=>expect(()=>validateEntry(changed({allowedStock:0,warehouseQuantities:{}}))).toThrow('STOCK_INVALID'))
  it('uses only allowed warehouses',()=>{const x=changed({allowedStock:4,warehouseQuantities:{10000:1,10001:1,10002:1,10005:1,10003:999}});expect(()=>validateEntry(x)).not.toThrow()})
  it('rejects stock formula mismatch',()=>expect(()=>validateEntry(changed({allowedStock:2,warehouseQuantities:{10000:1}}))).toThrow('STOCK_INVALID'))
  it('forces isActive false',()=>expect(()=>validateEntry(changed({isActive:true as false}))).toThrow('PENDING_STATE'))
  it('forbids price fallback',()=>{const x=changed({price2:'0.00',prices:{...entry.prices,price1:'99.00'}});expect(()=>validateEntry(x)).toThrow('PRICE_INVALID')})
  it('allows unresolved brand/category pending values',()=>expect(()=>validateEntry(changed({brand:'',category:'uncategorized'}))).not.toThrow())
  it('allows missing images',()=>expect(()=>validateEntry(changed({imageReferences:[]}))).not.toThrow())
})
describe('first new-product import conflict and idempotency plan',()=>{
  const one={...allowlist,entries:[entry],entryCount:1}
  it('rejects existing externalId',()=>expect(prepareImportPlan(one,[{id:'x',externalId:entry.externalId,sku:null,barcode:null}]).metrics.existingExternalIdConflicts).toBe(1))
  it('rejects existing SKU',()=>expect(prepareImportPlan(one,[{id:'x',externalId:null,sku:entry.xmlSku,barcode:null}]).metrics.existingSkuConflicts).toBe(1))
  it('rejects EAN collision',()=>expect(prepareImportPlan(one,[{id:'x',externalId:null,sku:null,barcode:entry.barcode}]).metrics.barcodeConflicts).toBe(entry.barcode?1:0))
  it('marks hidden duplicates absent from executable scope',()=>expect(allowlist.entries.every(e=>e.classification==='NEW_PRODUCT_HIGH_CONFIDENCE_IN_STOCK')).toBe(true))
  it('predicts no update or deactivate',()=>expect(prepareImportPlan(one,[]).metrics).toMatchObject({updates:0,deactivations:0}))
  it('prepares ERP metadata for every insert',()=>expect(prepareImportPlan(one,[]).metrics.predictedErpRecords).toBe(1))
  it('is idempotent for an exactly imported row',()=>expect(prepareImportPlan(one,[{id:entry.plannedProductId,externalId:entry.externalId,sku:entry.xmlSku,barcode:entry.barcode}]).metrics).toMatchObject({wouldInsert:0,alreadyImported:1,conflicts:0}))
  it('reports a conflicting planned id without updating',()=>expect(prepareImportPlan(one,[{id:entry.plannedProductId,externalId:'other',sku:'other',barcode:null}]).metrics).toMatchObject({wouldInsert:0,existingIdConflicts:1,updates:0}))
})
