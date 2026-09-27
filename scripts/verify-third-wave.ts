import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { getErpExtraData } from '../lib/sync/erp-extra-data-store'
import { parseThirdWaveAllowlist } from '../lib/sync/controlled-third-wave'
import { sha256, THIRD_WAVE_SIZE } from '../lib/sync/third-wave-backfill'

const postBackfill = process.argv.includes('--post-backfill')
const ambiguous = ['24006256','97388150','BA02','DKIRI','KJMN0352','NIA308001','NIA407001','SS-40/3']
async function main() { const { prisma } = await import('../lib/prisma'); try {
  const [xml,content,auditContent]=await Promise.all([readFile('export.xml','utf8'),readFile('third-wave-duplicate-safe-allowlist.json','utf8'),readFile('third-wave-duplicate-audit.json','utf8')]), allowlist=parseThirdWaveAllowlist(content,sha256(xml)), feedById=new Map(parseGrinsXml(xml).map(x=>[x.externalId,x])), byId=new Map(allowlist.entries.map(x=>[x.productId,x])), ids=allowlist.entries.map(x=>x.productId), siblingIds=[...new Set(allowlist.entries.flatMap(x=>x.rejectedDuplicateProductIds))]
  const audit=JSON.parse(auditContent) as {groups:Array<{products:Array<{id:string;sku:string|null;externalId:string|null;price:number;stock:number;isActive:boolean;isDeleted:boolean}>}>}, baselineById=new Map(audit.groups.flatMap(g=>g.products).map(p=>[p.id,p]))
  const [products,siblings,deferred,state,duplicates,lastRun,extra]=await Promise.all([
    prisma.product.findMany({where:{id:{in:ids}},select:{id:true,externalId:true,sku:true,price:true,stock:true,isActive:true,isDeleted:true,lastSyncRunId:true}}),
    prisma.product.findMany({where:{id:{in:siblingIds}},select:{id:true,externalId:true,sku:true,isActive:true,isDeleted:true,lastSyncRunId:true}}),
    prisma.product.findMany({where:{sku:{in:[...ambiguous,'k18','k86']}},select:{id:true,sku:true,externalId:true}}),
    prisma.$queryRawUnsafe<Array<{count:number;externalIdCount:number;active:number;inactive:number;syncRunCount:number}>>(`SELECT COUNT(*)::int count,COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount" FROM "Product"`),
    prisma.$queryRawUnsafe<Array<{externalId:string;count:number}>>(`SELECT "externalId",COUNT(*)::int count FROM "Product" WHERE "externalId" IS NOT NULL GROUP BY "externalId" HAVING COUNT(*)>1`),
    prisma.syncRun.findFirst({orderBy:{startedAt:'desc'}}), getErpExtraData(prisma)
  ])
  const zeroBaseline:Record<string,number>=postBackfill?{}:(JSON.parse(await readFile('controlled-sync-third-wave-result.json','utf8')) as {preflight:{zeroTierPriceBaseline:Record<string,number>}}).preflight.zeroTierPriceBaseline
  let identityMismatches=0,priceMappingMismatches=0,zeroPriceRegressions=0,stockFormulaMismatches=0,extraPriceMismatches=0,warehouseSnapshotMismatches=0
  for(const p of products){const a=byId.get(p.id),item=a?feedById.get(a.xmlSku):undefined;if(!a||!item||p.isDeleted||p.externalId!==a.externalIdToSet||p.sku!==a.productSku){identityMismatches++;continue}if(!postBackfill){if(item.price>0&&Number(p.price)!==item.price)priceMappingMismatches++;if(item.price===0&&Number(p.price)!==zeroBaseline[p.id])zeroPriceRegressions++;if(p.stock!==item.stock)stockFormulaMismatches++;const stored=extra[a.externalIdToSet];if(!stored||JSON.stringify(stored.prices)!==JSON.stringify(item.prices))extraPriceMismatches++;if(!stored||JSON.stringify(stored.warehouseQuantities)!==JSON.stringify(item.warehouseQuantities))warehouseSnapshotMismatches++}}
  const siblingExternalIdAssigned=siblings.filter(x=>x.externalId!==null).length,siblingDeleted=siblings.filter(x=>x.isDeleted).length,siblingStateMismatches=siblings.filter(x=>{const b=baselineById.get(x.id);return !b||x.sku!==b.sku||x.externalId!==b.externalId||x.isActive!==b.isActive||x.isDeleted!==b.isDeleted}).length,deferredAssigned=deferred.filter(x=>x.externalId!==null).length
  const result={phase:postBackfill?'post-backfill':'post-sync',scope:products.length,identityMismatches,siblingGroups:THIRD_WAVE_SIZE,siblingsChecked:siblings.length,siblingExternalIdAssigned,siblingDeleted,siblingStateMismatches,deferredChecked:deferred.length,deferredAssigned,priceMappingMismatches,zeroPriceRegressions,stockFormulaMismatches,extraRecordsChecked:postBackfill?0:products.length,extraPriceMismatches,warehouseSnapshotMismatches,duplicateExternalIds:duplicates.length,state:state[0],lastRun}
  console.log(JSON.stringify(result,null,2))
  const expectedRuns=postBackfill?4:5;if(products.length!==THIRD_WAVE_SIZE||identityMismatches||siblingExternalIdAssigned||siblingDeleted||siblingStateMismatches||deferredAssigned||duplicates.length||state[0].count!==6378||state[0].externalIdCount!==3465||state[0].active!==2229||state[0].inactive!==4149||state[0].syncRunCount!==expectedRuns||(!postBackfill&&(priceMappingMismatches||zeroPriceRegressions||stockFormulaMismatches||extraPriceMismatches||warehouseSnapshotMismatches||lastRun?.status!=='completed'||lastRun?.productsTotal!==42||lastRun?.productsSynced!==42||lastRun?.deactivated!==0||lastRun?.errorCount!==0)))throw new Error('THIRD_WAVE_VERIFICATION_FAILED')
}finally{await prisma.$disconnect()} }
main().catch(e=>{console.error(e);process.exitCode=1})
