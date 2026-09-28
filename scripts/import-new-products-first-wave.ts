/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile } from 'node:fs/promises'
import type { Prisma } from '../generated/prisma/client'
import { getErpExtraData } from '../lib/sync/erp-extra-data-store'
import { assertImportBaseline, FIRST_IMPORT_XML_SHA, parseImportAllowlist, prepareImportPlan, sha256 } from '../lib/sync/first-new-product-import'

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]}
async function main(){
  const execute=process.argv.includes('--execute'), allowPath=arg('--allowlist'), xmlPath=arg('--file'), backup=arg('--backup-branch')
  if(!allowPath||!xmlPath)throw new Error('Explicit --allowlist and --file are required')
  if(execute&&!backup)throw new Error('NEW_PRODUCT_IMPORT_BLOCKED_BY_BACKUP')
  const {prisma}=await import('../lib/prisma')
  const state=async(db:any=prisma)=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`))[0] as Record<string,unknown>
  try{
    const [content,xml]=await Promise.all([readFile(allowPath),readFile(xmlPath,'utf8')]);if(sha256(xml)!==FIRST_IMPORT_XML_SHA)throw new Error('NEW_PRODUCT_IMPORT_XML_SHA_MISMATCH')
    const allowlist=parseImportAllowlist(content), before=await state()
    const existing=await prisma.product.findMany({select:{id:true,externalId:true,sku:true,barcode:true}}), plan=prepareImportPlan(allowlist,existing)
    if(!execute){
      const initial=plan.insertable.length===allowlist.entries.length&&plan.metrics.alreadyImported===0
      const idempotent=plan.insertable.length===0&&plan.metrics.alreadyImported===allowlist.entries.length
      if(plan.metrics.conflicts||(!initial&&!idempotent))throw new Error(`NEW_PRODUCT_IMPORT_CONFLICTS:${JSON.stringify(plan.metrics)}`)
      if(initial)assertImportBaseline(before)
      else {
        const expected={productCount:8577,externalIdCount:5779,unlinkedCount:2798,active:2229,inactive:6348,syncRunCount:9}
        for(const [key,value] of Object.entries(expected))if(before[key]!==value)throw new Error(`NEW_PRODUCT_IMPORT_IDEMPOTENCY_STATE_DRIFT:${JSON.stringify(before)}`)
      }
      const after=await state();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('NEW_PRODUCT_IMPORT_PREPARATION_SAFETY_FAILURE');console.log(JSON.stringify({event:'first_new_product_import_dry_run',...plan.metrics,before,after,backupBranch:null},null,2));return
    }
    assertImportBaseline(before)
    if(plan.metrics.conflicts||plan.insertable.length!==allowlist.entries.length)throw new Error(`NEW_PRODUCT_IMPORT_CONFLICTS:${JSON.stringify(plan.metrics)}`)
    const startedAt=new Date(),runId=crypto.randomUUID(),currentExtra=await getErpExtraData(prisma)
    const result=await prisma.$transaction(async tx=>{
      assertImportBaseline(await state(tx));const locked=await tx.product.findMany({select:{id:true,externalId:true,sku:true,barcode:true}}),lockedPlan=prepareImportPlan(allowlist,locked)
      if(lockedPlan.metrics.conflicts||lockedPlan.insertable.length!==allowlist.entries.length)throw new Error('NEW_PRODUCT_IMPORT_FAIL_CLOSED')
      let inserted=0;for(let i=0;i<lockedPlan.insertable.length;i+=250){const batch=lockedPlan.insertable.slice(i,i+250);const r=await tx.product.createMany({data:batch.map(e=>({id:e.plannedProductId,externalId:e.externalId,sku:e.xmlSku,barcode:e.barcode,title:e.productTitle,titleEn:null,titleLv:null,description:null,brand:e.brand,category:e.category,price:e.price2,stock:e.allowedStock,image:null,images:[],badges:[],relatedProductIds:[],oftenBoughtTogether:[],certificates:[],compatibleEquipment:[],isActive:false,isDeleted:false,isCustom:false,lastSyncRunId:runId}))});inserted+=r.count}
      if(inserted!==allowlist.entries.length)throw new Error(`NEW_PRODUCT_IMPORT_INSERT_COUNT:${inserted}`)
      const extra={...currentExtra};for(const e of lockedPlan.insertable)extra[e.externalId]={prices:Object.fromEntries(Object.entries(e.prices).map(([k,v])=>[k,Number(v)])) as any,warehouseQuantities:e.warehouseQuantities}
      await tx.keyValueSetting.upsert({where:{key:'erp-extra-data'},create:{key:'erp-extra-data',value:extra as unknown as Prisma.InputJsonValue},update:{value:extra as unknown as Prisma.InputJsonValue}})
      await tx.syncRun.create({data:{id:runId,status:'completed',triggeredBy:`controlled-first-new-product-import:${FIRST_IMPORT_XML_SHA}:${sha256(content)}`,startedAt,finishedAt:new Date(),productsTotal:allowlist.entries.length,productsSynced:inserted,deactivated:0,errorCount:0}})
      return inserted
    },{isolationLevel:'Serializable',timeout:180_000,maxWait:10_000})
    console.log(JSON.stringify({event:'first_new_product_import_complete',runId,inserted:result,backupBranch:backup,durationMs:Date.now()-startedAt.getTime()},null,2))
  }finally{await prisma.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
