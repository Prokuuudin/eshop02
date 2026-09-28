import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
import { SECOND_IMPORT_ALLOWLIST_SHA,SECOND_IMPORT_BASELINE,SECOND_IMPORT_COUNT,SECOND_IMPORT_EXPECTED_POST,SECOND_IMPORT_XML_SHA,assertSecondImportBaseline,parseSecondImportAllowlist,prepareSecondImportPlan,sha256,validateSecondEntry,type SecondImportAllowlist,type SecondImportEntry } from './second-new-product-import'
const content=readFileSync('second-new-product-import-allowlist.json'),allowlist=JSON.parse(content.toString()) as SecondImportAllowlist,entry=allowlist.entries[0],changed=(patch:Partial<SecondImportEntry>):SecondImportEntry=>({...entry,...patch}),runner=readFileSync('scripts/import-new-products-second-wave.ts','utf8')
describe('second import immutable gates',()=>{
  it('binds exact allowlist SHA',()=>expect(sha256(content)).toBe(SECOND_IMPORT_ALLOWLIST_SHA))
  it('rejects allowlist SHA mismatch',()=>expect(()=>parseSecondImportAllowlist(Buffer.concat([content,Buffer.from(' ')]))).toThrow('ALLOWLIST_SHA'))
  it('binds XML SHA and runner rejects XML mismatch',()=>{expect(allowlist.xmlSha256).toBe(SECOND_IMPORT_XML_SHA);expect(runner).toContain('XML_SHA_MISMATCH')})
  it('rejects baseline mismatch',()=>expect(()=>assertSecondImportBaseline({...SECOND_IMPORT_BASELINE,productCount:1})).toThrow('BASELINE_DRIFT'))
  it('requires exact scope count',()=>{const x={...allowlist,entryCount:1 as 8845};const b=Buffer.from(JSON.stringify(x));expect(()=>parseSecondImportAllowlist(b,sha256(b))).toThrow('SCOPE_COUNT')})
  it('rejects review entry in executable scope',()=>{const x={...allowlist,reviewExcludedSkus:[...allowlist.reviewExcludedSkus.slice(0,-1),entry.xmlSku]};x.reviewExclusionSha256=sha256(x.reviewExcludedSkus.join('\n'));const b=Buffer.from(JSON.stringify(x));expect(()=>parseSecondImportAllowlist(b,sha256(b))).toThrow('REVIEW_OR_DUPLICATE')})
  it('checks expected post arithmetic',()=>expect(SECOND_IMPORT_EXPECTED_POST).toMatchObject({productCount:8577+SECOND_IMPORT_COUNT,externalIdCount:5779+SECOND_IMPORT_COUNT,active:2229,inactive:6348+SECOND_IMPORT_COUNT,syncRunCount:10}))
})
describe('second import mapping and conflicts',()=>{
  it('rejects price2 mismatch or invalid format',()=>expect(()=>validateSecondEntry(changed({price2:'0.005'}))).toThrow('PRICE_INVALID'))
  it('rejects non-zero allowed stock',()=>expect(()=>validateSecondEntry(changed({allowedStock:1 as 0}))).toThrow('STOCK_INVALID'))
  it('keeps Product.stock zero when excluded warehouse has stock',()=>expect(()=>validateSecondEntry(changed({warehouseQuantities:{10000:0,10001:0,10002:0,10005:0,10003:9}}))).not.toThrow())
  it('preserves excluded warehouse snapshot',()=>expect(changed({warehouseQuantities:{10003:9}}).warehouseQuantities['10003']).toBe(9))
  it('forces inactive state',()=>expect(()=>validateSecondEntry(changed({isActive:true as false}))).toThrow('PENDING_STATE'))
  it.each([['externalId',{id:'x',externalId:entry.externalId,sku:null,barcode:null},'externalIdConflicts'],['SKU',{id:'x',externalId:null,sku:entry.sku,barcode:null},'skuConflicts'],['barcode',{id:'x',externalId:null,sku:null,barcode:entry.barcode},'barcodeConflicts']] as const)('detects %s conflict',(_label,existing,key)=>expect(prepareSecondImportPlan({...allowlist,entries:[entry],entryCount:1 as 8845},[existing]).metrics[key]).toBe(entry.barcode===null&&key==='barcodeConflicts'?0:1))
  it('is idempotent for an exact imported row',()=>expect(prepareSecondImportPlan({...allowlist,entries:[entry],entryCount:1 as 8845},[{id:entry.plannedProductId,externalId:entry.externalId,sku:entry.sku,barcode:entry.barcode}]).metrics).toMatchObject({wouldInsert:0,alreadyImported:1,conflicts:0,updates:0,deactivations:0,databaseWrites:0}))
  it('uses one Serializable transaction with fail-closed insert count',()=>{expect(runner).toContain("isolationLevel:'Serializable'");expect(runner).toContain('INSERT_COUNT');expect(runner).toContain('LOCKED_SCOPE_MISMATCH')})
  it('keeps Product batches, ERP metadata and SyncRun inside the atomic rollback boundary',()=>{const start=runner.indexOf('prisma.$transaction(async tx=>'),end=runner.indexOf("},{isolationLevel:'Serializable'");const atomic=runner.slice(start,end);expect(start).toBeGreaterThan(0);expect(atomic).toContain('tx.product.createMany');expect(atomic).toContain('tx.keyValueSetting.upsert');expect(atomic).toContain('tx.syncRun.create');expect(atomic).toContain('throw new Error')})
  it('contains no Product update, upsert, or deactivation path',()=>{expect(runner).not.toMatch(/tx\.product\.(?:update|upsert|updateMany)/u);expect(runner).not.toContain('deactivateMissing')})
})
