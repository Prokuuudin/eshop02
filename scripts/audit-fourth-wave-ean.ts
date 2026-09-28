import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { XMLParser } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from '../lib/sync/grins-warehouse-map'
import { barcodeQuality, csv, diceSimilarity, measurementConflicts, nameTokens, normalizeName, numericTokens } from '../lib/fourth-wave-ean-matching'

config({ path: '.env.local' })

const EXPECTED = { productCount: 6378, externalIdCount: 3465, active: 2229, inactive: 4149, syncRunCount: 5,
  fingerprint: '8cfed3e298b5678ffe3da25c3401443a', xmlCount: 16176,
  xmlSha256: '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad' }
const DEFERRED = new Set(['24006256','97388150','BA02','DKIRI','KJMN0352','NIA308001','NIA407001','SS-40/3','K18','K86'])
type Classification = 'FOURTH_WAVE_SAFE_CANDIDATE' | 'MANUAL_REVIEW' | 'REJECTED_MATCH'
type Warehouse = { '@_id': string; '#text'?: string }
type XmlItem = { sku?: string; code?: string; title?: string; capacity?: string; price1?: string; price2?: string; price3?: string; price4?: string; quantity?: string; warehouses?: { warehouse?: Warehouse[] } }
const text = (value: unknown) => String(value ?? '')
const num = (value: unknown) => Number(value ?? 0) || 0
const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(x => x === value).length]))
const eqState = (value: Record<string, unknown>) => Object.entries(EXPECTED).filter(([key]) => key !== 'xmlCount' && key !== 'xmlSha256').every(([key, expected]) => value[key] === expected)
const VARIANT_MARKERS = ['black','white','mint','pink','violet','blue','red','green','medium','mini','silver','gold','fine','strong']
const variantMarkers = (value:string) => VARIANT_MARKERS.filter(marker => nameTokens(value).includes(marker))

function brandEvidence(brand: string, xmlName: string) {
  const aliases: Record<string, string[]> = { 'loreal professionnel': ['loreal'], 'schwarzkopf professional': ['schwarzkopf'], 'wella professionals': ['wella'], inebrya: ['inebrya'], kaypro: ['kaypro','kepro'], londa: ['londa','kadus'], 'american crew': ['american crew'], gosh: ['gosh'], 'olivia garden': ['olivia','og'], 'axis y': ['axis y'], lattafa: ['lattafa'] }
  const normalizedBrand = normalizeName(brand); const normalizedXml = normalizeName(xmlName); const compact=(value:string)=>value.replace(/[^\p{L}\p{N}]/gu,'')
  const expected = aliases[normalizedBrand] ?? aliases[normalizedBrand.replace(/\s+/gu,' ')] ?? [normalizedBrand]
  const agrees = !normalizedBrand || expected.some(value => compact(normalizedXml).includes(compact(value)))
  return { productBrand: brand, inferredFromName: true, inferredXmlBrand: agrees ? expected.find(value => compact(normalizedXml).includes(compact(value))) ?? '' : nameTokens(xmlName)[0] ?? '', agrees }
}

async function main() {
  const { prisma } = await import('../lib/prisma')
  const state = async () => (await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT COUNT(*)::int "productCount", COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount", COUNT(*) FILTER(WHERE "isActive")::int active, COUNT(*) FILTER(WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`))[0]
  try {
    const before = await state(); const xmlBuffer = await readFile('export.xml'); const xmlSha = sha256(xmlBuffer)
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, processEntities: false, isArray: name => name === 'item' || name === 'warehouse' }).parse(xmlBuffer.toString('utf8')) as { root?: { item?: XmlItem[] } }
    const xmlItems = parsed.root?.item ?? []
    if (!eqState(before) || xmlItems.length !== EXPECTED.xmlCount || xmlSha !== EXPECTED.xmlSha256) throw new Error(`BASELINE_DRIFT:${JSON.stringify({ before, xmlCount: xmlItems.length, xmlSha256: xmlSha, expected: EXPECTED })}`)

    const products = await prisma.product.findMany({ select: { id:true, externalId:true, sku:true, barcode:true, title:true, titleEn:true, titleLv:true, description:true, brand:true, category:true, price:true, stock:true, isActive:true, isDeleted:true, technicalSpecs:true, images:true, image:true, createdAt:true, updatedAt:true } })
    const xmlByEan = new Map<string, XmlItem[]>(); const xmlBySku = new Map<string, XmlItem[]>()
    for (const item of xmlItems) { const ean=text(item.code); const sku=text(item.sku); if(ean) xmlByEan.set(ean,[...(xmlByEan.get(ean)??[]),item]); if(sku) xmlBySku.set(sku,[...(xmlBySku.get(sku)??[]),item]) }
    const productsByBarcode = new Map<string, typeof products>(); const productsBySkuFold = new Map<string, typeof products>()
    for (const product of products) { const barcode=text(product.barcode); const sku=text(product.sku).trim(); if(barcode) productsByBarcode.set(barcode,[...(productsByBarcode.get(barcode)??[]),product]); if(sku) productsBySkuFold.set(sku.toLocaleLowerCase('en-US'),[...(productsBySkuFold.get(sku.toLocaleLowerCase('en-US'))??[]),product]) }
    const claimedExternalIds = new Set(products.flatMap(product => product.externalId ? [product.externalId] : []))
    const candidates = products.filter(product => product.externalId === null && !text(product.sku).trim() && text(product.barcode) && (productsByBarcode.get(text(product.barcode))?.length === 1) && (xmlByEan.get(text(product.barcode))?.length === 1) && !claimedExternalIds.has(text(xmlByEan.get(text(product.barcode))![0].sku)))

    let previousRows: Array<Record<string,string>> = []
    try { const previous = JSON.parse(await readFile('remaining-products-audit.json','utf8')) as { localProducts?: Array<Record<string,string>> }; previousRows=(previous.localProducts??[]).filter(row=>row.classification==='UNIQUE_EAN_CANDIDATE') } catch { /* comparison remains empty and is reported */ }
    const previousMap = new Map(previousRows.map(row => [text(row.productId), text(row.bestXmlSku)]))
    const currentMap = new Map(candidates.map(product => [product.id, text(xmlByEan.get(text(product.barcode))![0].sku)]))

    const rows = candidates.map(product => {
      const item=xmlByEan.get(text(product.barcode))![0]; const sku=text(item.sku); const xmlName=text(item.title); const productName=product.title
      const quality=barcodeQuality(text(product.barcode)); const numericConflicts=measurementConflicts(productName,xmlName); const productNumbers=numericTokens(productName); const xmlNumbers=numericTokens(xmlName); const unmatchedNumbers={productOnly:productNumbers.filter(x=>!xmlNumbers.includes(x)),xmlOnly:xmlNumbers.filter(x=>!productNumbers.includes(x))}; const productVariants=variantMarkers(productName); const xmlVariants=variantMarkers(xmlName); const unmatchedVariants={productOnly:productVariants.filter(x=>!xmlVariants.includes(x)),xmlOnly:xmlVariants.filter(x=>!productVariants.includes(x))}; const brand=brandEvidence(product.brand,xmlName); const similarity=Math.max(diceSimilarity(product.title,xmlName),diceSimilarity(product.titleEn??'',xmlName),diceSimilarity(product.titleLv??'',xmlName))
      const globalClaimants=productsByBarcode.get(text(product.barcode))??[]; const skuClaimants=productsBySkuFold.get(sku.toLocaleLowerCase('en-US'))??[]; const deferred=DEFERRED.has(sku.toLocaleUpperCase('en-US'))
      const localWords=new Set(nameTokens(productName)); const xmlWords=new Set(nameTokens(xmlName)); const shared=[...localWords].filter(token=>xmlWords.has(token)); const strongName=similarity>=0.35 || shared.length>=3 || (brand.agrees&&similarity>=0.2&&shared.length>=1)
      let classification: Classification='FOURTH_WAVE_SAFE_CANDIDATE'; const reasons: string[]=[]
      if(numericConflicts.length){classification='REJECTED_MATCH';reasons.push(`Significant numeric/variant conflict: ${numericConflicts.join('; ')}`)}
      if(globalClaimants.length!==1||skuClaimants.length||deferred||product.isDeleted){classification='REJECTED_MATCH';reasons.push(`Identity conflict: EAN claimants=${globalClaimants.length}, SKU claimants=${skuClaimants.length}, deferred=${deferred}, softDeleted=${product.isDeleted}`)}
      if(classification!=='REJECTED_MATCH' && quality.kind==='INVALID_STANDARD_LOOKING'){classification='MANUAL_REVIEW';reasons.push('Standard-looking barcode has an invalid check digit')}
      if(classification!=='REJECTED_MATCH' && quality.kind==='INTERNAL_NON_STANDARD'){classification='MANUAL_REVIEW';reasons.push('Non-standard/internal barcode requires human confirmation')}
      if(classification!=='REJECTED_MATCH' && (unmatchedNumbers.productOnly.length||unmatchedNumbers.xmlOnly.length)){classification='MANUAL_REVIEW';reasons.push(`Numeric/model markers differ: Product-only=${unmatchedNumbers.productOnly.join('|')||'none'}, XML-only=${unmatchedNumbers.xmlOnly.join('|')||'none'}`)}
      if(classification!=='REJECTED_MATCH' && (unmatchedVariants.productOnly.length||unmatchedVariants.xmlOnly.length)){classification='MANUAL_REVIEW';reasons.push(`Named variant markers differ: Product-only=${unmatchedVariants.productOnly.join('|')||'none'}, XML-only=${unmatchedVariants.xmlOnly.join('|')||'none'}`)}
      if(classification!=='REJECTED_MATCH' && !brand.agrees){classification='MANUAL_REVIEW';reasons.push(`Brand is not evident in XML name (${product.brand})`)}
      if(classification!=='REJECTED_MATCH' && !strongName){classification='MANUAL_REVIEW';reasons.push(`Name evidence is weak (Dice=${similarity.toFixed(3)}, shared=${shared.join('|')||'none'})`)}
      if(!reasons.length) reasons.push(`Unique exact string EAN; free unique XML SKU; compatible name/brand/variant; no global claimant, deferred, or deletion conflict`)
      const warehouses: Record<string,number>={}; for(const warehouse of item.warehouses?.warehouse??[]){const id=GRINS_WAREHOUSE_INDEX_TO_ID[Number(warehouse['@_id'])-1];if(id)warehouses[id]=num(warehouse['#text'])}
      const allowedStock=['10000','10001','10002','10005'].reduce((sum,id)=>sum+Math.max(0,warehouses[id]??0),0); const price2=num(item.price2); const futurePrice=price2>0?price2:Number(product.price); const currentPrice=Number(product.price)
      return { productId:product.id, active:product.isActive, isDeleted:product.isDeleted, barcode:text(product.barcode), barcodeLength:quality.length, barcodeDigitsOnly:quality.digitsOnly, barcodeQuality:quality.kind, checksumValid:quality.checksumValid, leadingZero:quality.leadingZero, productName, productBrand:product.brand, productCategory:product.category, description:product.description??'', technicalSpecs:product.technicalSpecs??null, image:product.image??'', imageCount:product.images.length, createdAt:product.createdAt.toISOString(), updatedAt:product.updatedAt.toISOString(), xmlSku:sku, xmlEan:text(item.code), xmlName, price1:num(item.price1), price2, price3:num(item.price3), price4:num(item.price4), currentPrice, futurePrice, priceWouldChange:futurePrice!==currentPrice, currentStock:product.stock, allowedStock, stockWouldChange:allowedStock!==product.stock, classification, reason:reasons.join('; '), nameEvidence:{similarity,sharedTokens:shared}, numericVariantEvidence:{measurements:{product:productName,xml:xmlName},conflicts:numericConflicts,productNumbers,xmlNumbers,unmatchedNumbers,productVariants,xmlVariants,unmatchedVariants}, brandEvidence:brand, categoryEvidence:{productCategory:product.category,xmlCategoryField:null,note:'XML has no separate category field'}, conflicts:{globalEanClaimants:globalClaimants.map(p=>p.id),xmlEanRecords:xmlByEan.get(text(product.barcode))?.length??0,externalIdClaimed:claimedExternalIds.has(sku),localExactOrCaseSkuClaimants:skuClaimants.map(p=>p.id),deferred,softDeleted:product.isDeleted} }
    })
    const after=await state(); if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error(`DATABASE_FINGERPRINT_CHANGED:${JSON.stringify({before,after})}`)
    const classes=countBy(rows.map(row=>row.classification)); const activeInactive=Object.fromEntries((['FOURTH_WAVE_SAFE_CANDIDATE','MANUAL_REVIEW','REJECTED_MATCH'] as Classification[]).map(c=>[c,{active:rows.filter(r=>r.classification===c&&r.active).length,inactive:rows.filter(r=>r.classification===c&&!r.active).length}]))
    const safe=rows.filter(row=>row.classification==='FOURTH_WAVE_SAFE_CANDIDATE'); const review=rows.filter(row=>row.classification!=='FOURTH_WAVE_SAFE_CANDIDATE')
    const reconstruction={previousCandidates:previousMap.size,currentCandidates:currentMap.size,disappeared:[...previousMap.keys()].filter(id=>!currentMap.has(id)),newlyAppeared:[...currentMap.keys()].filter(id=>!previousMap.has(id)),changedXmlTarget:[...currentMap].filter(([id,sku])=>previousMap.has(id)&&previousMap.get(id)!==sku).map(([id,sku])=>({productId:id,previous:previousMap.get(id),current:sku}))}
    const quality=countBy(rows.map(row=>row.barcodeQuality)); const leadingZero=rows.filter(row=>row.leadingZero).length
    const pricePreview={price2Positive:safe.filter(r=>r.price2>0).length,price2Zero:safe.filter(r=>r.price2===0).length,wouldChange:safe.filter(r=>r.priceWouldChange).length,unchanged:safe.filter(r=>!r.priceWouldChange).length,over50Percent:safe.filter(r=>r.currentPrice>0&&Math.abs(r.futurePrice-r.currentPrice)/r.currentPrice>.5).length,largeAbsolute:safe.filter(r=>Math.abs(r.futurePrice-r.currentPrice)>=20).map(r=>({productId:r.productId,from:r.currentPrice,to:r.futurePrice}))}
    const stockPreview={wouldChange:safe.filter(r=>r.stockWouldChange).length,unchanged:safe.filter(r=>!r.stockWouldChange).length,positiveToZero:safe.filter(r=>r.currentStock>0&&r.allowedStock===0).length,zeroToPositive:safe.filter(r=>r.currentStock===0&&r.allowedStock>0).length,resultingZero:safe.filter(r=>r.allowedStock===0).length}
    const deferredIntersection=rows.filter(row=>row.conflicts.deferred).map(row=>row.productId)
    const report={generatedAt:new Date().toISOString(),readOnly:true,databaseWrites:0,baseline:{before,after,unchanged:true,xmlCount:xmlItems.length,xmlSha256:xmlSha},reconstruction,eanQuality:{...quality,leadingZero,globalConflicts:rows.filter(r=>r.conflicts.globalEanClaimants.length!==1||r.conflicts.xmlEanRecords!==1).length},classification:classes,activeInactive,deferredIntersection,pricePreview,stockPreview,candidates:rows}
    const humanCols=['productId','active','barcode','productName','xmlSku','xmlEan','xmlName','currentPrice','price2','currentStock','allowedStock','classification','reason']
    const md=['# Fourth-wave EAN audit','',`Generated: ${report.generatedAt}`,'','**READ-ONLY. Database writes: 0. Apply is not authorized.**','','## Baseline','','```json',JSON.stringify(report.baseline,null,2),'```','','## Candidate reconstruction','','```json',JSON.stringify(reconstruction,null,2),'```','','## EAN quality','','```json',JSON.stringify(report.eanQuality,null,2),'```','','## Classification','','```json',JSON.stringify({classes,activeInactive},null,2),'```','','## SAFE evidence','',...safe.map(r=>`- ${r.productId} | ${r.barcode} | ${r.xmlSku} | ${r.productName} ↔ ${r.xmlName} — ${r.reason}`),'','## Manual review / rejected','',...review.map(r=>`- **${r.classification}** ${r.productId} | ${r.barcode} | ${r.productName} ↔ ${r.xmlSku} / ${r.xmlName} — ${r.reason}`),'','## Price preview (SAFE only)','','```json',JSON.stringify(pricePreview,null,2),'```','','## Stock preview (SAFE only)','','```json',JSON.stringify(stockPreview,null,2),'```','','## Deferred intersection','',`Count: ${deferredIntersection.length}`,'','## Database safety','',`Before/after identical: yes; fingerprint: ${text(before.fingerprint)}; databaseWrites = 0.`,'','## Candidate artifact','','`fourth-wave-ean-safe-candidates.json` has `executable: false` and is diagnostic only.'].join('\n')+'\n'
    await Promise.all([writeFile('fourth-wave-ean-audit.json',JSON.stringify(report,null,2)+'\n'),writeFile('fourth-wave-ean-audit.md',md),writeFile('fourth-wave-ean-safe-candidates.json',JSON.stringify({executable:false,authorizedForApply:false,classification:'FOURTH_WAVE_SAFE_CANDIDATE',count:safe.length,candidates:safe},null,2)+'\n'),writeFile('fourth-wave-ean-review.csv',csv(review,humanCols)),writeFile('fourth-wave-ean-all.csv',csv(rows,humanCols))])
    console.log(JSON.stringify({baseline:report.baseline,reconstruction,eanQuality:report.eanQuality,classification:classes,activeInactive,deferredIntersection:deferredIntersection.length,pricePreview,stockPreview,databaseWrites:0,outputs:['fourth-wave-ean-audit.json','fourth-wave-ean-audit.md','fourth-wave-ean-safe-candidates.json','fourth-wave-ean-review.csv','fourth-wave-ean-all.csv']},null,2))
  } finally { await prisma.$disconnect() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
