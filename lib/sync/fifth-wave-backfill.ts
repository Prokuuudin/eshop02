import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { typedNormalizedRelation, type NormalizationType } from './normalized-sku-matching'

export const FIFTH_WAVE_SIZE = 24
export const FIFTH_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const FIFTH_WAVE_ALLOWLIST_SHA256 = 'd0a669941c7839091936cdcf9b65c9eea96d87d23ef5453833769c612ca3c935'
export const FIFTH_WAVE_BASELINE_FINGERPRINT = '5cce6d1caafdaf2721c9632a441445e2'
export const FIFTH_WAVE_EXCLUDED_PRODUCT_IDS = new Set(['20469','21445','21503','19282','19289','21449','21488','21473','21515','21923','21352','21623','19018','21283','21624','22129','21420','19015','21450','21476','21447','21448','21451','21453','21452','21446','21454','21516','18427'])
export const FIFTH_WAVE_DEFERRED_SKUS = new Set(['24006256','97388150','BA02','DKIRI','KJMN0352','NIA308001','NIA407001','SS-40/3','K18','K86'])
export const fifthWaveSha256 = (content: string | Buffer):string => createHash('sha256').update(content).digest('hex')

export type FifthWaveEntry = { productId:string; productSku:string; xmlSku:string; externalIdToSet:string; normalizationType:NormalizationType; normalizedKey:string; productName:string; xmlName:string; productBarcode:string|null; xmlEan:string|null; identityEvidence:unknown; baseline:{externalId:null;isActive:boolean;isDeleted:boolean;brand:string;category:string;title:string;titleEn:string|null;titleLv:string|null;description:string;technicalSpecs:unknown;specVolume:string|null;specType:string|null;image:string;images:string[];createdAt:string;price:number;stock:number} }
export type FifthWaveAllowlist = { schemaVersion:1;wave:'fifth-wave-normalized-sku-safe';executable:true;generatedAt:string;sourceAudit:string;entryCount:24;baseline:{productCount:6378;externalIdCount:3526;active:2229;inactive:4149;syncRunCount:6;fingerprint:string};xmlSha256:string;entries:FifthWaveEntry[] }
export type FifthWaveProduct = { id:string;sku:string|null;externalId:string|null;barcode:string|null;isDeleted:boolean;title?:string;titleEn?:string|null;titleLv?:string|null;brand?:string;category?:string;description?:string|null;technicalSpecs?:unknown;specVolume?:string|null;specType?:string|null;image?:string|null;images?:string[];isActive?:boolean;createdAt?:Date }
export type FifthWaveState = {count:number;externalIdCount:number;active:number;inactive:number;syncRunCount:number;fingerprint:string}
type XmlIdentity={sku:string;ean:string;name:string}
const parser=new XMLParser({parseTagValue:false,processEntities:false,isArray:name=>name==='item'})
const parseXml=(xml:string):XmlIdentity[]=>((parser.parse(xml) as {root?:{item?:Array<{sku?:string;code?:string;title?:string}>}}).root?.item??[]).map(item=>({sku:String(item.sku??'').trim(),ean:String(item.code??'').trim(),name:String(item.title??'').trim()}))

export function assertFifthWaveBaseline(value:FifthWaveState):void { if(value.count!==6378||value.externalIdCount!==3526||value.active!==2229||value.inactive!==4149||value.syncRunCount!==6||value.fingerprint!==FIFTH_WAVE_BASELINE_FINGERPRINT)throw new Error(`FIFTH_WAVE_BASELINE_MISMATCH:${JSON.stringify(value)}`) }
export function parseFifthWaveAllowlist(content:string|Buffer,expected=FIFTH_WAVE_ALLOWLIST_SHA256):FifthWaveAllowlist { if(fifthWaveSha256(content)!==expected)throw new Error('FIFTH_WAVE_ALLOWLIST_SHA_MISMATCH');return JSON.parse(content.toString()) as FifthWaveAllowlist }

export function validateFifthWave(content:string|Buffer,xml:string,products:FifthWaveProduct[],phase:'pre-backfill'|'post-backfill'='pre-backfill',policy:{allowlistSha256?:string;xmlSha256?:string}={}):FifthWaveAllowlist {
  if(fifthWaveSha256(xml)!==(policy.xmlSha256??FIFTH_WAVE_XML_SHA256))throw new Error('FIFTH_WAVE_XML_SHA_MISMATCH')
  const allowlist=parseFifthWaveAllowlist(content,policy.allowlistSha256),errors:string[]=[]
  if(allowlist.schemaVersion!==1||allowlist.wave!=='fifth-wave-normalized-sku-safe'||allowlist.executable!==true)errors.push('allowlist metadata mismatch')
  if(allowlist.entryCount!==FIFTH_WAVE_SIZE||allowlist.entries.length!==FIFTH_WAVE_SIZE)errors.push(`scope must be ${FIFTH_WAVE_SIZE}`)
  if(allowlist.xmlSha256!==FIFTH_WAVE_XML_SHA256||allowlist.baseline.fingerprint!==FIFTH_WAVE_BASELINE_FINGERPRINT)errors.push('source binding mismatch')
  for(const values of [allowlist.entries.map(x=>x.productId),allowlist.entries.map(x=>x.xmlSku),allowlist.entries.map(x=>x.externalIdToSet),allowlist.entries.map(x=>x.normalizedKey)])if(new Set(values).size!==FIFTH_WAVE_SIZE)errors.push('duplicate allowlist claim')
  const xmlItems=parseXml(xml),byId=new Map(products.map(product=>[product.id,product])),externalClaims=new Map(products.filter(p=>p.externalId).map(p=>[p.externalId!,p.id]))
  for(const entry of allowlist.entries){
    const product=byId.get(entry.productId),matches=xmlItems.filter(item=>item.sku===entry.xmlSku)
    if(!product){errors.push(`missing Product ${entry.productId}`);continue}
    if(FIFTH_WAVE_EXCLUDED_PRODUCT_IDS.has(entry.productId)||FIFTH_WAVE_DEFERRED_SKUS.has(entry.xmlSku.toLocaleUpperCase('en-US')))errors.push(`excluded scope intersection ${entry.productId}`)
    if(product.isDeleted)errors.push(`soft-deleted Product ${entry.productId}`)
    if(product.sku!==entry.productSku)errors.push(`Product SKU drift ${entry.productId}`)
    const relation=typedNormalizedRelation(product.sku??'',entry.xmlSku);if(!relation||relation.type!==entry.normalizationType||relation.normalizedKey!==entry.normalizedKey)errors.push(`normalization identity drift ${entry.productId}`)
    if(matches.length!==1||matches[0].name!==entry.xmlName||matches[0].ean!==(entry.xmlEan??''))errors.push(`XML identity drift ${entry.xmlSku}`)
    if(entry.externalIdToSet!==entry.xmlSku)errors.push(`externalId target mismatch ${entry.productId}`)
    const expectedExternal=phase==='pre-backfill'?null:entry.externalIdToSet;if(product.externalId!==expectedExternal)errors.push(`externalId gate failed ${entry.productId}`)
    const claimant=externalClaims.get(entry.externalIdToSet);if(claimant&&claimant!==entry.productId)errors.push(`XML SKU already claimed ${entry.xmlSku}`)
    const localCollision=products.filter(p=>p.id!==product.id&&typedNormalizedRelation(p.sku??'',entry.xmlSku));if(localCollision.length)errors.push(`normalized key collision ${entry.normalizedKey}`)
    if(products.some(p=>p.id!==product.id&&(p.sku??'').toLocaleLowerCase('en-US')===entry.xmlSku.toLocaleLowerCase('en-US')))errors.push(`case-fold collision ${entry.xmlSku}`)
    if(product.title!==undefined){const actual={isActive:product.isActive,isDeleted:product.isDeleted,brand:product.brand,category:product.category,title:product.title,titleEn:product.titleEn??null,titleLv:product.titleLv??null,description:product.description??'',technicalSpecs:product.technicalSpecs??null,specVolume:product.specVolume??null,specType:product.specType??null,image:product.image??'',images:product.images??[],createdAt:product.createdAt?.toISOString()};const expected={...entry.baseline};delete (expected as Partial<typeof expected>).externalId;delete (expected as Partial<typeof expected>).price;delete (expected as Partial<typeof expected>).stock;if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push(`protected baseline drift ${entry.productId}`)}
  }
  if(errors.length)throw new Error(`Fifth-wave validation failed:\n- ${errors.join('\n- ')}`)
  return allowlist
}

export type FifthWaveAtomicStore={transaction:<T>(operation:(tx:{loadAll:()=>Promise<FifthWaveProduct[]>;updateExternalIds:(entries:FifthWaveEntry[])=>Promise<number>})=>Promise<T>)=>Promise<T>}
export async function applyFifthWaveAtomic(store:FifthWaveAtomicStore,content:string|Buffer,xml:string,policy:{allowlistSha256?:string;xmlSha256?:string}={}):Promise<number>{return store.transaction(async tx=>{const all=await tx.loadAll(),allowlist=validateFifthWave(content,xml,all,'pre-backfill',policy),affected=await tx.updateExternalIds(allowlist.entries);if(affected!==FIFTH_WAVE_SIZE)throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${affected}`);return affected})}
