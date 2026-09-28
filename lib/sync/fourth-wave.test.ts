import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyFourthWaveAtomic, assertFourthWaveBaseline, FOURTH_WAVE_SIZE, sha256, validateFourthWave, type FourthWaveAllowlist, type FourthWaveProduct } from './fourth-wave-backfill'
import { buildFourthWavePlan, type FourthWaveScopeProduct } from './controlled-fourth-wave'
import type { ErpProduct } from './erp-adapter'

const content=readFileSync('fourth-wave-ean-allowlist.json'),xml=readFileSync('export.xml','utf8'),allowlist=JSON.parse(content.toString()) as FourthWaveAllowlist
const products=():FourthWaveProduct[]=>allowlist.entries.map(entry=>({id:entry.productId,sku:null,externalId:null,barcode:entry.productBarcode,isDeleted:false}))
const mutatedContent=(mutate:(value:FourthWaveAllowlist)=>void)=>{const value=structuredClone(allowlist);mutate(value);const data=Buffer.from(JSON.stringify(value));return{data,policy:{allowlistSha256:sha256(data)}}}

describe('fourth-wave immutable identity gates',()=>{
  it('rejects changed baseline',()=>expect(()=>assertFourthWaveBaseline({count:6377,externalIdCount:3465,active:2229,inactive:4149,syncRunCount:5,fingerprint:'changed'})).toThrow('FOURTH_WAVE_BASELINE_MISMATCH'))
  it('accepts exactly 61 current SAFE identities',()=>expect(validateFourthWave(content,xml,products()).entries).toHaveLength(61))
  it('rejects wrong XML SHA',()=>expect(()=>validateFourthWave(content,xml+' ',products())).toThrow('XML_SHA_MISMATCH'))
  it('rejects modified allowlist',()=>expect(()=>validateFourthWave(Buffer.concat([content,Buffer.from(' ')]),xml,products())).toThrow('ALLOWLIST_SHA_MISMATCH'))
  it('rejects missing Product',()=>expect(()=>validateFourthWave(content,xml,products().slice(1))).toThrow('missing Product'))
  it('rejects filled externalId',()=>{const rows=products();rows[0].externalId='claimed';expect(()=>validateFourthWave(content,xml,rows)).toThrow('externalId gate failed')})
  it('rejects an unexpectedly populated Product.sku',()=>{const rows=products();rows[0].sku='NEW';expect(()=>validateFourthWave(content,xml,rows)).toThrow('Product.sku unexpectedly appeared')})
  it('rejects changed barcode and EAN identity',()=>{const rows=products();rows[0].barcode='changed';expect(()=>validateFourthWave(content,xml,rows)).toThrow('barcode identity mismatch')})
  it('rejects duplicate barcode claimant',()=>{const rows=products();rows.push({id:'other',sku:null,externalId:null,barcode:rows[0].barcode,isDeleted:false});expect(()=>validateFourthWave(content,xml,rows)).toThrow('duplicate barcode claimant')})
  it('rejects duplicate XML EAN claimant',()=>{const first=allowlist.entries[0],changed=xml.replace('</root>',`<item><sku>DUPLICATE-TEST</sku><code>${first.xmlEan}</code></item></root>`);expect(()=>validateFourthWave(content,changed,products(),'pre-backfill',{xmlSha256:sha256(changed)})).toThrow('duplicate XML EAN claimant')})
  it('rejects XML SKU already claimed',()=>{const rows=products();rows.push({id:'claimant',sku:null,externalId:allowlist.entries[0].externalIdToSet,barcode:null,isDeleted:false});expect(()=>validateFourthWave(content,xml,rows)).toThrow('XML SKU already claimed')})
  it('rejects soft-deleted Product',()=>{const rows=products();rows[0].isDeleted=true;expect(()=>validateFourthWave(content,xml,rows)).toThrow('soft-deleted Product')})
  it('rejects manual-review intersection',()=>{const changed=mutatedContent(value=>{value.entries[0].productId='21352'}),rows=products();rows[0].id='21352';expect(()=>validateFourthWave(changed.data,xml,rows,'pre-backfill',changed.policy)).toThrow('manual review intersection')})
  it('rejects rejected-Product intersection',()=>{const changed=mutatedContent(value=>{value.entries[0].productId='19015'}),rows=products();rows[0].id='19015';expect(()=>validateFourthWave(changed.data,xml,rows,'pre-backfill',changed.policy)).toThrow('rejected Product intersection')})
  it('rejects deferred intersection',()=>{const changed=mutatedContent(value=>{value.entries[0].externalIdToSet='K18'});expect(()=>validateFourthWave(changed.data,xml,products(),'pre-backfill',changed.policy)).toThrow('deferred intersection')})
})

function atomicStore(affected=FOURTH_WAVE_SIZE,throwAfterWrite=false){const state=new Map(products().map(product=>[product.id,{...product,price:10,stock:5,title:product.id,isActive:true}]));const outside={id:'outside',sku:null,externalId:null,barcode:'outside',isDeleted:false,price:9,stock:4,title:'outside',isActive:true};state.set(outside.id,outside);return{state,store:{transaction:async<T>(operation:(tx:{loadAll:()=>Promise<FourthWaveProduct[]>;updateExternalIds:(entries:FourthWaveAllowlist['entries'])=>Promise<number>})=>Promise<T>)=>{const draft=new Map([...state].map(([id,p])=>[id,{...p}]));const result=await operation({loadAll:async()=>[...draft.values()],updateExternalIds:async entries=>{for(const entry of entries.slice(0,affected)){const p=draft.get(entry.productId);if(p)p.externalId=entry.externalIdToSet}if(throwAfterWrite)throw new Error('simulated failure');return affected}});state.clear();for(const[id,p]of draft)state.set(id,p);return result}}}}

describe('fourth-wave atomic apply contract',()=>{
  it('rejects affected-row mismatch',async()=>{const{store}=atomicStore(60);await expect(applyFourthWaveAtomic(store,content,xml)).rejects.toThrow('ATOMIC_UPDATE_COUNT_MISMATCH:60')})
  it('rolls back on failure and preserves Product outside scope',async()=>{const{store,state}=atomicStore(61,true);await expect(applyFourthWaveAtomic(store,content,xml)).rejects.toThrow('simulated failure');expect([...state.values()].every(p=>p.externalId===null)).toBe(true);expect(state.get('outside')?.title).toBe('outside')})
  it('changes only externalId and leaves Product.sku untouched',async()=>{const{store,state}=atomicStore();await applyFourthWaveAtomic(store,content,xml);expect(allowlist.entries.every(entry=>state.get(entry.productId)?.externalId===entry.externalIdToSet&&state.get(entry.productId)?.sku===null)).toBe(true);expect(state.get('outside')?.externalId).toBeNull()})
})

const scope=():FourthWaveScopeProduct[]=>allowlist.entries.map(entry=>({id:entry.productId,externalId:null,sku:null,barcode:entry.productBarcode,price:10,stock:5,isDeleted:false,isActive:true}))
const feed=():ErpProduct[]=>allowlist.entries.map((entry,index)=>({externalId:entry.externalIdToSet,title:entry.xmlSku,price:index===0?0:12,stock:6,prices:{price1:99,price2:index===0?0:12,price3:88,price4:77},warehouseQuantities:{'10000':1,'10001':2,'10002':3,'10003':100,'10005':0}}))
describe('fourth-wave controlled preview rules',()=>{
  it('price2=0 preserves price with no fallback',()=>{const plan=buildFourthWavePlan(allowlist,feed(),scope(),{},'preview-before-backfill');expect(plan.rows[0].price).toBe(10);expect(plan.metrics.zeroPriceRegressions).toBe(0)})
  it('uses only the four approved warehouses',()=>{const plan=buildFourthWavePlan(allowlist,feed(),scope(),{},'preview-before-backfill');expect(plan.rows[0].stock).toBe(6);expect(plan.metrics.stockFormulaMismatches).toBe(0)})
  it('does not include inserts, deactivations, or outside-scope changes',()=>{const plan=buildFourthWavePlan(allowlist,feed(),scope(),{},'preview-before-backfill');expect(plan.metrics).toMatchObject({scope:61,inserts:0,deactivations:0,outsideScopeChanges:0})})
})
