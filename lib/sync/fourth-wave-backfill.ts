import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'

export const FOURTH_WAVE_SIZE = 61
export const FOURTH_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const FOURTH_WAVE_ALLOWLIST_SHA256 = 'c0c885227d56b3dc9a24e7c24be5c4450b30a2ddabc85f5be4139d36e04cb703'
export const FOURTH_WAVE_BASELINE_FINGERPRINT = '8cfed3e298b5678ffe3da25c3401443a'
export const FOURTH_WAVE_MANUAL_IDS = new Set(['21352','21623','19018','21283','21624','22129','21420'])
export const FOURTH_WAVE_REJECTED_IDS = new Set(['19015'])
export const FOURTH_WAVE_DEFERRED_SKUS = new Set(['24006256','97388150','BA02','DKIRI','KJMN0352','NIA308001','NIA407001','SS-40/3','K18','K86'])
export const sha256 = (content: string | Buffer):string => createHash('sha256').update(content).digest('hex')

export type FourthWaveEntry = { productId:string; productBarcode:string; xmlEan:string; xmlSku:string; externalIdToSet:string; matchType:'UNIQUE_EAN_SAFE'; productName:string; xmlName:string; identityEvidence:unknown; protectedProductBaseline:{isActive:boolean;title:string;brand:string;category:string;description:string;technicalSpecs:unknown;image:string;imageCount:number;createdAt:string} }
export type FourthWaveAllowlist = { schemaVersion:1; wave:'fourth-wave-unique-ean-safe'; generatedAt:string; sourceAudit:string; matchType:'UNIQUE_EAN_SAFE'; entryCount:number; baseline:{productCount:number;externalIdCount:number;fingerprint:string}; xmlSha256:string; entries:FourthWaveEntry[] }
export type FourthWaveProduct = { id:string; sku:string|null; externalId:string|null; barcode:string|null; isDeleted:boolean }
export type FourthWaveBaseline={count:number;externalIdCount:number;active:number;inactive:number;syncRunCount:number;fingerprint:string}
type XmlIdentity = { sku:string; ean:string }
const xmlIdentityCache=new Map<string,XmlIdentity[]>()

function parseXmlIdentities(xml:string): XmlIdentity[] {
  const key=sha256(xml),cached=xmlIdentityCache.get(key);if(cached)return cached
  const parsed = new XMLParser({ parseTagValue:false, processEntities:false, isArray:name=>name==='item' }).parse(xml) as {root?:{item?:Array<{sku?:string;code?:string}>}}
  const identities=(parsed.root?.item??[]).map(item=>({sku:String(item.sku??''),ean:String(item.code??'')}));xmlIdentityCache.set(key,identities);return identities
}

export function assertFourthWaveBaseline(value:FourthWaveBaseline):void{if(value.count!==6378||value.externalIdCount!==3465||value.active!==2229||value.inactive!==4149||value.syncRunCount!==5||value.fingerprint!==FOURTH_WAVE_BASELINE_FINGERPRINT)throw new Error(`FOURTH_WAVE_BASELINE_MISMATCH:${JSON.stringify(value)}`)}

export type FourthWaveValidationPolicy={allowlistSha256?:string;xmlSha256?:string}
export function parseFourthWaveAllowlist(content:string|Buffer,policy:FourthWaveValidationPolicy={}): FourthWaveAllowlist {
  if(sha256(content)!==(policy.allowlistSha256??FOURTH_WAVE_ALLOWLIST_SHA256)) throw new Error('FOURTH_WAVE_ALLOWLIST_SHA_MISMATCH')
  return JSON.parse(content.toString()) as FourthWaveAllowlist
}

export function validateFourthWave(content:string|Buffer, xml:string, allProducts:FourthWaveProduct[], phase:'pre-backfill'|'post-backfill'='pre-backfill',policy:FourthWaveValidationPolicy={}):FourthWaveAllowlist {
  if(sha256(xml)!==(policy.xmlSha256??FOURTH_WAVE_XML_SHA256)) throw new Error('FOURTH_WAVE_XML_SHA_MISMATCH')
  const allowlist=parseFourthWaveAllowlist(content,policy), errors:string[]=[]
  if(allowlist.schemaVersion!==1||allowlist.wave!=='fourth-wave-unique-ean-safe'||allowlist.matchType!=='UNIQUE_EAN_SAFE')errors.push('schema/wave mismatch')
  if(allowlist.xmlSha256!==FOURTH_WAVE_XML_SHA256||allowlist.baseline.productCount!==6378||allowlist.baseline.externalIdCount!==3465||allowlist.baseline.fingerprint!==FOURTH_WAVE_BASELINE_FINGERPRINT)errors.push('baseline/source binding mismatch')
  if(allowlist.entryCount!==FOURTH_WAVE_SIZE||allowlist.entries.length!==FOURTH_WAVE_SIZE)errors.push(`scope must be ${FOURTH_WAVE_SIZE}`)
  for(const [label,values] of [['Product ids',allowlist.entries.map(x=>x.productId)],['barcodes',allowlist.entries.map(x=>x.productBarcode)],['XML EANs',allowlist.entries.map(x=>x.xmlEan)],['externalIds',allowlist.entries.map(x=>x.externalIdToSet)]] as Array<[string,string[]]>)if(new Set(values).size!==FOURTH_WAVE_SIZE)errors.push(`duplicate ${label}`)
  const xmlItems=parseXmlIdentities(xml), byId=new Map(allProducts.map(product=>[product.id,product])), barcodeCounts=new Map<string,number>(),eanCounts=new Map<string,number>(),skuCounts=new Map<string,number>()
  for(const product of allProducts)if(product.barcode)barcodeCounts.set(product.barcode,(barcodeCounts.get(product.barcode)??0)+1)
  for(const item of xmlItems){if(item.ean)eanCounts.set(item.ean,(eanCounts.get(item.ean)??0)+1);if(item.sku)skuCounts.set(item.sku,(skuCounts.get(item.sku)??0)+1)}
  const externalClaims=new Map(allProducts.filter(p=>p.externalId).map(p=>[p.externalId!,p.id])),skuClaims=new Map<string,string[]>();for(const p of allProducts){const key=p.sku?.trim().toLocaleLowerCase('en-US');if(key)skuClaims.set(key,[...(skuClaims.get(key)??[]),p.id])}
  for(const entry of allowlist.entries){
    const product=byId.get(entry.productId), xmlMatches=xmlItems.filter(item=>item.sku===entry.xmlSku&&item.ean===entry.xmlEan)
    if(!product){errors.push(`missing Product ${entry.productId}`);continue}
    if(product.isDeleted)errors.push(`soft-deleted Product ${entry.productId}`)
    if(product.sku?.trim())errors.push(`Product.sku unexpectedly appeared ${entry.productId}`)
    const expectedExternal=phase==='pre-backfill'?null:entry.externalIdToSet;if(product.externalId!==expectedExternal)errors.push(`externalId gate failed ${entry.productId}`)
    if(product.barcode!==entry.productBarcode||product.barcode!==entry.xmlEan)errors.push(`barcode identity mismatch ${entry.productId}`)
    if(entry.matchType!=='UNIQUE_EAN_SAFE'||entry.xmlSku!==entry.externalIdToSet)errors.push(`allowlist identity mismatch ${entry.productId}`)
    if(barcodeCounts.get(entry.productBarcode)!==1)errors.push(`duplicate barcode claimant ${entry.productBarcode}`)
    if(eanCounts.get(entry.xmlEan)!==1)errors.push(`duplicate XML EAN claimant ${entry.xmlEan}`)
    if(skuCounts.get(entry.xmlSku)!==1||xmlMatches.length!==1)errors.push(`XML SKU/EAN target mismatch ${entry.xmlSku}`)
    const claimant=externalClaims.get(entry.externalIdToSet);if(claimant&&claimant!==entry.productId)errors.push(`XML SKU already claimed ${entry.externalIdToSet}`)
    const localSkuClaimants=skuClaims.get(entry.xmlSku.toLocaleLowerCase('en-US'))??[];if(localSkuClaimants.length)errors.push(`local SKU claimant ${entry.xmlSku}:${localSkuClaimants.join(',')}`)
    if(FOURTH_WAVE_MANUAL_IDS.has(entry.productId))errors.push(`manual review intersection ${entry.productId}`)
    if(FOURTH_WAVE_REJECTED_IDS.has(entry.productId))errors.push(`rejected Product intersection ${entry.productId}`)
    if(FOURTH_WAVE_DEFERRED_SKUS.has(entry.externalIdToSet.toLocaleUpperCase('en-US')))errors.push(`deferred intersection ${entry.externalIdToSet}`)
  }
  if(errors.length)throw new Error(`Fourth-wave validation failed:\n- ${errors.join('\n- ')}`)
  return allowlist
}

export type FourthWaveAtomicStore={transaction:<T>(operation:(tx:{loadAll:()=>Promise<FourthWaveProduct[]>;updateExternalIds:(entries:FourthWaveEntry[])=>Promise<number>})=>Promise<T>)=>Promise<T>}
export async function applyFourthWaveAtomic(store:FourthWaveAtomicStore,content:string|Buffer,xml:string):Promise<number>{return store.transaction(async tx=>{const all=await tx.loadAll();const allowlist=validateFourthWave(content,xml,all);const affected=await tx.updateExternalIds(allowlist.entries);if(affected!==FOURTH_WAVE_SIZE)throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${affected}`);return affected})}
