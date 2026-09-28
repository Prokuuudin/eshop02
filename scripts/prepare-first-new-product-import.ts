/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { XMLParser } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from '../lib/sync/grins-warehouse-map'
import { FIRST_IMPORT_BASELINE, FIRST_IMPORT_XML_SHA, type ImportAllowlist, type ImportEntry, sha256 } from '../lib/sync/first-new-product-import'

type Raw = { sku?: string; code?: string; title?: string; price1?: string; price2?: string; price3?: string; price4?: string; warehouses?: { warehouse?: Array<{ '@_id': string; '#text'?: string }> } }
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'@_', parseTagValue:false, processEntities:false, isArray:n=>n==='item'||n==='warehouse' })
const csv = (rows: Record<string, unknown>[]) => { const cols=[...new Set(rows.flatMap(Object.keys))], q=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`; return '\ufeff'+[cols.map(q).join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n')+'\n' }
const idFor = (sku:string) => { const h=createHash('sha256').update(`grins:${sku}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}` }
const n=(v:unknown)=>{const x=Number(String(v??'0'));return Number.isFinite(x)?x:0}
const money=(v:unknown)=>n(v).toFixed(2)

async function main(){
  const audit=JSON.parse(await readFile('final-pre-import-reconciliation.json','utf8')) as any
  if(!audit.unchanged||JSON.stringify(audit.before)!==JSON.stringify(FIRST_IMPORT_BASELINE)) throw new Error('STALE_RECONCILIATION')
  const xmlText=await readFile('export.xml','utf8'); if(sha256(xmlText)!==FIRST_IMPORT_XML_SHA) throw new Error('XML_SHA_DRIFT')
  const raw=((parser.parse(xmlText) as {root?:{item?:Raw[]}}).root?.item??[]); if(raw.length!==16176) throw new Error('XML_COUNT_DRIFT')
  const newRows=new Map<string,any>(audit.remainingXml.filter((r:any)=>r.classification==='NEW_PRODUCT_HIGH_CONFIDENCE').map((r:any)=>[r.xmlSku,r]))
  const linked=Number(audit.summary.hairshoppro.linked), hidden=Number(audit.summary.hiddenDuplicates), fresh=Number(audit.summary.newProductHighConfidence.total)
  const blocked=raw.length-linked-hidden-fresh
  const manualSkus=new Set<string>(audit.localProducts.filter((r:any)=>['MANUAL_REVIEW','REJECTED_MATCH'].includes(r.classification)).map((r:any)=>r.bestXmlSku).filter(Boolean))
  for(const sku of [...audit.knownDeferred.ambiguous,...audit.knownDeferred.caseReview,...audit.knownDeferred.rejected.map((x:string[])=>x[1]),audit.knownDeferred.manual.xmlSku]) manualSkus.add(String(sku))
  const blockedSkus=new Set<string>(audit.localProducts.map((r:any)=>r.bestXmlSku).filter(Boolean)); const manual=[...blockedSkus].filter(x=>manualSkus.has(x)).length
  const reconciliation={ALREADY_LINKED:linked,EXISTING_PRODUCT_CANDIDATE:blocked-manual,MANUAL_OR_DEFERRED:manual,POSSIBLE_HIDDEN_DUPLICATE:hidden,NEW_PRODUCT_HIGH_CONFIDENCE:fresh}
  if(Object.values(reconciliation).reduce((a,b)=>a+b,0)!==16176) throw new Error('RECONCILIATION_TOTAL_FAILURE')
  const entries:ImportEntry[]=[]
  for(const x of raw){const sku=String(x.sku??'').trim(), candidate=newRows.get(sku);if(!candidate||n(x.price2)<=0||Number(candidate.allowedStock)<=0)continue
    const warehouses:Record<string,number>={};for(const w of x.warehouses?.warehouse??[]){const id=GRINS_WAREHOUSE_INDEX_TO_ID[Number(w['@_id'])-1];if(id)warehouses[id]=n(w['#text'])}
    entries.push({plannedProductId:idFor(sku),xmlSku:sku,externalId:sku,barcode:String(x.code??'').trim()||null,sourceName:String(x.title??'').trim(),productTitle:sku,price2:money(x.price2),allowedStock:Number(candidate.allowedStock),warehouseQuantities:warehouses,prices:{price1:money(x.price1),price2:money(x.price2),price3:money(x.price3),price4:money(x.price4)},imageReferences:[],brand:'',category:'uncategorized',titleEn:null,titleLv:null,description:null,isActive:false,classification:'NEW_PRODUCT_HIGH_CONFIDENCE_IN_STOCK',identityEvidence:['no existing externalId/SKU/EAN/normalized-name or controlled-normalized-SKU collision','price and stock not used as identity evidence']})}
  const allowlist:ImportAllowlist={schemaVersion:1,wave:'first-new-product-import',executable:true,entryCount:entries.length,xmlSha256:FIRST_IMPORT_XML_SHA,baseline:FIRST_IMPORT_BASELINE,entries}
  const allowText=JSON.stringify(allowlist,null,2)+'\n', allowSha=sha256(allowText)
  const preview=entries.map(e=>({xmlSku:e.xmlSku,ean:e.barcode??'',sourceName:e.sourceName,price2:e.price2,allowedStock:e.allowedStock,isActive:e.isActive,brand:e.brand,category:e.category,images:e.imageReferences.length,classification:e.classification}))
  const report={generatedAt:new Date().toISOString(),readOnly:true,databaseWrites:0,baseline:FIRST_IMPORT_BASELINE,xml:{records:raw.length,sha256:FIRST_IMPORT_XML_SHA},reconciliation,firstWave:{candidates:entries.length,withEan:entries.filter(e=>e.barcode).length,withoutEan:entries.filter(e=>!e.barcode).length,brandResolved:0,brandUnresolved:entries.length,categoryResolved:0,categoryUnresolved:entries.length,withImage:0,withoutImage:entries.length},allowlist:{file:'first-new-product-import-allowlist.json',entries:entries.length,sha256:allowSha}}
  const md=`# First new-product import preparation\n\nRead-only: **yes** · Database writes: **0**\n\n## Reconciliation\n\n${Object.entries(reconciliation).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\n## First wave\n\n- Candidates: ${entries.length}; EAN present/missing: ${report.firstWave.withEan}/${report.firstWave.withoutEan}.\n- Product.price: exact price2; stock: allowed four-warehouse sum; isActive: false.\n- Brand unresolved: ${entries.length}; stored as empty technical pending value.\n- Category unresolved: ${entries.length}; stored as existing technical category \`uncategorized\`.\n- Images: XML has no image field; ${entries.length} missing. No downloads performed.\n- Source title is a mixed search string, so Product.title is seeded with exact SKU pending admin review.\n\n## Admin readiness\n\nInactive products are visible under Admin → Products with the hidden filter and are editable/activatable. Brand/category/title/translations/images can be edited, but there is no dedicated “new ERP import” queue or completeness filter; this is an operational blocker for a mass activation workflow.\n`
  await Promise.all([writeFile('first-new-product-import-allowlist.json',allowText),writeFile('first-new-product-import-audit.json',JSON.stringify(report,null,2)+'\n'),writeFile('first-new-product-import-audit.md',md),writeFile('first-new-product-import-preview.csv',csv(preview)),writeFile('first-new-product-import-conflicts.csv',csv([])),writeFile('first-new-product-import-images.csv',csv(preview.map(r=>({xmlSku:r.xmlSku,imageCount:0,status:'MISSING_FROM_XML'})))),writeFile('first-new-product-import-unresolved-brand-category.csv',csv(preview.map(r=>({xmlSku:r.xmlSku,brand:'UNRESOLVED_EMPTY',category:'uncategorized',reason:'XML has no reliable structured mapping'}))))])
  console.log(JSON.stringify(report,null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1})
