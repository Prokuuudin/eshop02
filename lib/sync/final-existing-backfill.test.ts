import { readFileSync } from 'node:fs'
import { describe,expect,it,vi } from 'vitest'
import { buildFinalExistingPlan } from './controlled-final-existing'
import { FINAL_EXISTING_ALLOWLIST_SHA,FINAL_EXISTING_BASELINE,PERMANENT_EXCLUSION,applyAtomic,assertBaseline,hash,parseAllowlist,previewSync,validateScope,type Allowlist,type ProductIdentity } from './final-existing-backfill'

const content=readFileSync('final-existing-product-backfill-allowlist.json'),allowlist=JSON.parse(content.toString()) as Allowlist
const escapeXml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const xml=`<root>${allowlist.entries.map((entry,index)=>`<item><sku>${escapeXml(entry.xmlSku)}</sku><code>${escapeXml(entry.xmlEan)}</code><title>fixture</title><price1>1</price1><price2>${index<2?0:Number(entry.baselineProtected.price)+1}</price2><price3>3</price3><price4>4</price4><warehouses><warehouse id="1">${Number(entry.baselineProtected.stock)+1}</warehouse></warehouses></item>`).join('')}</root>`,xmlSha=hash(xml)
const products=allowlist.entries.map(e=>({...e.baselineProtected,externalId:null})) as ProductIdentity[]
const linkedProducts=products.map((p,index)=>({...p,externalId:allowlist.entries[index].xmlSku}))
const clone=<T>(value:T):T=>structuredClone(value)

describe('final existing backfill immutable contract',()=>{
  it('binds the executable allowlist SHA',()=>expect(hash(content)).toBe(FINAL_EXISTING_ALLOWLIST_SHA))
  it('rejects baseline mismatch',()=>expect(()=>assertBaseline({...FINAL_EXISTING_BASELINE,productCount:1})).toThrow('BASELINE_DRIFT'))
  it('rejects XML SHA mismatch',()=>expect(()=>validateScope(allowlist,`${xml} `,products,new Set(),'pre',xmlSha)).toThrow('XML_SHA_MISMATCH'))
  it('rejects allowlist SHA mismatch',()=>expect(()=>parseAllowlist(Buffer.concat([content,Buffer.from(' ')]))).toThrow('ALLOWLIST_SHA_MISMATCH'))
  it('rejects occupied externalId',()=>{const p=clone(products);p.push({...p[0],id:'other',externalId:allowlist.entries[0].xmlSku});expect(()=>validateScope(allowlist,xml,p,new Set(),'pre',xmlSha)).toThrow('occupied externalId')})
  it('rejects duplicate Product and XML targets',()=>{const a=clone(allowlist);a.entries.push(clone(a.entries[0]));a.entryCount++;expect(()=>validateScope(a,xml,products,new Set(),'pre',xmlSha)).toThrow('duplicate target')})
  it('rejects competing SKU claimant',()=>{const p=clone(products);p[0].sku='UNIQUE';p.push({...p[0],id:'other'});const a=clone(allowlist);a.entries[0].currentLocalSku='UNIQUE';a.entries[0].baselineProtected.sku='UNIQUE';expect(()=>validateScope(a,xml,p,new Set(),'pre',xmlSha)).toThrow('competing SKU')})
  it('rejects competing EAN claimant',()=>{const p=clone(products);p.push({...p[0],id:'other'});expect(()=>validateScope(allowlist,xml,p,new Set(),'pre',xmlSha)).toThrow('competing EAN')})
  it('rejects protected deferred intersection',()=>expect(()=>validateScope(allowlist,xml,products,new Set([allowlist.entries[0].xmlSku]),'pre',xmlSha)).toThrow('protected intersection'))
  it('keeps 97388150 explicitly excluded',()=>{expect(allowlist.entries.some(e=>e.productId===PERMANENT_EXCLUSION.productId||e.xmlSku===PERMANENT_EXCLUSION.xmlSku)).toBe(false);const a=clone(allowlist);a.entries[0].xmlSku=PERMANENT_EXCLUSION.xmlSku;expect(()=>validateScope(a,xml,products,new Set(),'pre',xmlSha)).toThrow('PROTECTED_97388150')})
  it('rejects protected-field drift',()=>{const p=clone(products);p[0].title+=' drift';expect(()=>validateScope(allowlist,xml,p,new Set(),'pre',xmlSha)).toThrow('protected-field drift')})
  it('rolls back on affected-row mismatch',async()=>{const transaction=vi.fn(async(fn:any)=>fn({loadAll:async()=>products,updateExternalIds:async()=>7}));await expect(applyAtomic({transaction},allowlist,xml,new Set(),xmlSha)).rejects.toThrow('AFFECTED_ROWS:7');expect(transaction).toHaveBeenCalledOnce()})
  it('preserves price when price2 is zero and uses allowed warehouse stock',()=>{const a={...allowlist,entries:[allowlist.entries[0]],entryCount:1} as Allowlist,p=[products[0]],testXml='<root><item><sku>'+a.entries[0].xmlSku+'</sku><code>'+a.entries[0].xmlEan+'</code><title>x</title><price1>9</price1><price2>0</price2><price3>8</price3><price4>7</price4><warehouses><warehouse id="1">2</warehouse><warehouse id="2">-5</warehouse><warehouse id="4">99</warehouse><warehouse id="6">3</warehouse></warehouses></item></root>',plan=previewSync(a,testXml,p);expect(plan.rows[0].resultingPrice).toBe(Number(p[0].price));expect(plan.rows[0].resultingStock).toBe(5);expect(plan.metrics.zeroTierPreserved).toBe(1)})
  it('is deterministic and predicts no outside-scope writes',()=>{expect(previewSync(allowlist,xml,products)).toEqual(previewSync(allowlist,xml,products));expect(previewSync(allowlist,xml,products).metrics.databaseWrites).toBe(0)})
  it('builds an eight-row controlled-sync plan with exact expected gates',()=>{const plan=buildFinalExistingPlan(allowlist,xml,linkedProducts,{});expect(plan.metrics).toMatchObject({scope:8,predictedProductUpdates:8,predictedErpSemanticUpdates:8,priceUpdates:6,priceUnchanged:2,stockUpdates:8,stockUnchanged:0,zeroTierPreserved:2,zeroPriceRegressions:0,stockFormulaMismatches:0,conflicts:0})})
  it('blocks controlled sync when post-backfill identity drifts',()=>{const p=clone(linkedProducts);p[0].externalId='wrong';expect(()=>buildFinalExistingPlan(allowlist,xml,p,{})).toThrow('IMMUTABLE_SCOPE')})
})
