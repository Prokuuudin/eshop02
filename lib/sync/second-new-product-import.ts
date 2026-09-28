import { createHash } from 'node:crypto'
import { allowedStock } from './second-new-product-audit'

export const SECOND_IMPORT_XML_SHA='26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const SECOND_IMPORT_ALLOWLIST_SHA='cbcec0a6cd11f5851d18c65826e1f5f42775935fb544abf877aa0406cbfc876a'
export const SECOND_IMPORT_COUNT=8845
export const SECOND_IMPORT_BASELINE={productCount:8577,externalIdCount:5779,unlinkedCount:2798,active:2229,inactive:6348,syncRunCount:9,fingerprint:'c9eaa51facfe0b6c60ab45bf5589e566'} as const
export const SECOND_IMPORT_EXPECTED_POST={productCount:17422,externalIdCount:14624,unlinkedCount:2798,active:2229,inactive:15193,syncRunCount:10} as const
export type SecondImportEntry={plannedProductId:string;xmlSku:string;externalId:string;sku:string;barcode:string|null;sourceTitle:string;productTitle:string;price2:string;allowedStock:0;warehouseQuantities:Record<string,number>;prices:{price1:string;price2:string;price3:string;price4:string};identityEvidence:string[];brand:'';category:'uncategorized';titleEn:null;titleLv:null;description:null;imageReferences:[];isActive:false;classification:'SECOND_IMPORT_SAFE_CANDIDATE'}
export type SecondImportAllowlist={schemaVersion:1;wave:'second-new-product-import';executable:true;authorizedForApply:true;entryCount:8845;xmlSha256:string;baseline:typeof SECOND_IMPORT_BASELINE;reviewExclusionCount:429;reviewExclusionSha256:string;reviewExcludedSkus:string[];entries:SecondImportEntry[]}
export type ExistingIdentity={id:string;externalId:string|null;sku:string|null;barcode:string|null}
export const sha256=(value:string|Buffer):string=>createHash('sha256').update(value).digest('hex')
export function assertSecondImportBaseline(value:Record<string,unknown>):void{for(const [key,expected] of Object.entries(SECOND_IMPORT_BASELINE))if(value[key]!==expected)throw new Error(`SECOND_NEW_PRODUCT_IMPORT_BASELINE_DRIFT:${JSON.stringify(value)}`)}
export function validateSecondEntry(entry:SecondImportEntry):void{
  if(entry.externalId!==entry.xmlSku||entry.sku!==entry.xmlSku||entry.productTitle!==entry.xmlSku)throw new Error(`SECOND_IMPORT_IDENTITY_INVALID:${entry.xmlSku}`)
  if(!/^\d+(?:\.\d{1,2})?$/u.test(entry.price2)||!(Number(entry.price2)>0))throw new Error(`SECOND_IMPORT_PRICE_INVALID:${entry.xmlSku}`)
  if(entry.allowedStock!==0||allowedStock(entry.warehouseQuantities)!==0)throw new Error(`SECOND_IMPORT_STOCK_INVALID:${entry.xmlSku}`)
  if(entry.isActive!==false||entry.brand!==''||entry.category!=='uncategorized')throw new Error(`SECOND_IMPORT_PENDING_STATE_INVALID:${entry.xmlSku}`)
  if(entry.classification!=='SECOND_IMPORT_SAFE_CANDIDATE')throw new Error(`SECOND_IMPORT_CLASSIFICATION_INVALID:${entry.xmlSku}`)
}
export function parseSecondImportAllowlist(content:string|Buffer,expectedSha=SECOND_IMPORT_ALLOWLIST_SHA):SecondImportAllowlist{
  if(expectedSha==='TO_BE_BOUND'||sha256(content)!==expectedSha)throw new Error('SECOND_NEW_PRODUCT_IMPORT_ALLOWLIST_SHA_MISMATCH')
  const value=JSON.parse(content.toString()) as SecondImportAllowlist
  if(!value.executable||!value.authorizedForApply||value.wave!=='second-new-product-import'||value.entryCount!==SECOND_IMPORT_COUNT||value.entries.length!==SECOND_IMPORT_COUNT)throw new Error('SECOND_NEW_PRODUCT_IMPORT_SCOPE_COUNT_MISMATCH')
  if(value.xmlSha256!==SECOND_IMPORT_XML_SHA||JSON.stringify(value.baseline)!==JSON.stringify(SECOND_IMPORT_BASELINE))throw new Error('SECOND_NEW_PRODUCT_IMPORT_BINDING_MISMATCH')
  if(value.reviewExclusionCount!==429||value.reviewExcludedSkus.length!==429||sha256(value.reviewExcludedSkus.join('\n'))!==value.reviewExclusionSha256)throw new Error('SECOND_NEW_PRODUCT_IMPORT_REVIEW_BINDING_MISMATCH')
  const review=new Set(value.reviewExcludedSkus),unique=(values:string[])=>new Set(values).size===values.length
  if(!unique(value.entries.map(e=>e.xmlSku))||!unique(value.entries.map(e=>e.plannedProductId))||value.entries.some(e=>review.has(e.xmlSku)))throw new Error('SECOND_NEW_PRODUCT_IMPORT_REVIEW_OR_DUPLICATE_SCOPE')
  for(const entry of value.entries)validateSecondEntry(entry)
  return value
}
export function prepareSecondImportPlan(allowlist:SecondImportAllowlist,existing:ExistingIdentity[]):{insertable:SecondImportEntry[];metrics:{candidates:number;wouldInsert:number;alreadyImported:number;conflicts:number;skipped:number;existingIdConflicts:number;externalIdConflicts:number;skuConflicts:number;barcodeConflicts:number;hiddenDuplicateConflicts:number;reviewIntersections:number;updates:number;deactivations:number;databaseWrites:number}}{
  const ids=new Map(existing.map(p=>[p.id,p])),external=new Map(existing.filter(p=>p.externalId).map(p=>[p.externalId!,p])),skus=new Map(existing.filter(p=>p.sku).map(p=>[p.sku!,p])),barcodes=new Map(existing.filter(p=>p.barcode).map(p=>[p.barcode!,p]));let existingIdConflicts=0,externalIdConflicts=0,skuConflicts=0,barcodeConflicts=0,alreadyImported=0
  const insertable:SecondImportEntry[]=[]
  for(const entry of allowlist.entries){const exact=ids.get(entry.plannedProductId);if(exact&&exact.externalId===entry.externalId&&exact.sku===entry.sku&&exact.barcode===entry.barcode){alreadyImported++;continue}const id=ids.has(entry.plannedProductId),ext=external.has(entry.externalId),sku=skus.has(entry.sku),barcode=Boolean(entry.barcode&&barcodes.has(entry.barcode));if(id)existingIdConflicts++;if(ext)externalIdConflicts++;if(sku)skuConflicts++;if(barcode)barcodeConflicts++;if(!id&&!ext&&!sku&&!barcode)insertable.push(entry)}
  const conflicts=existingIdConflicts+externalIdConflicts+skuConflicts+barcodeConflicts
  return{insertable,metrics:{candidates:allowlist.entries.length,wouldInsert:insertable.length,alreadyImported,conflicts,skipped:allowlist.entries.length-insertable.length-alreadyImported,existingIdConflicts,externalIdConflicts,skuConflicts,barcodeConflicts,hiddenDuplicateConflicts:0,reviewIntersections:0,updates:0,deactivations:0,databaseWrites:0}}
}
