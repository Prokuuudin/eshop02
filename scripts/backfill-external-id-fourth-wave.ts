import { config } from 'dotenv'; config({path:'.env.local'})
import { readFile } from 'node:fs/promises'
import { assertFourthWaveBaseline, FOURTH_WAVE_SIZE, sha256, validateFourthWave } from '../lib/sync/fourth-wave-backfill'

const valueOf=(name:string)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined}
async function main(){
  const apply=process.argv.includes('--apply'),allowlistPath=valueOf('--allowlist'),xmlPath=valueOf('--file'),backupBranch=valueOf('--backup-branch')
  if(!allowlistPath||!xmlPath)throw new Error('Explicit --allowlist and --file are required')
  if(apply&&!backupBranch)throw new Error('FOURTH_WAVE_APPLY_BLOCKED_BY_BACKUP')
  const {prisma}=await import('../lib/prisma')
  const state=async()=>(await prisma.$queryRawUnsafe<Array<{count:number;externalIdCount:number;active:number;inactive:number;syncRunCount:number;fingerprint:string}>>(`SELECT COUNT(*)::int count,COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`))[0]
  try{
    const [content,xml]=await Promise.all([readFile(allowlistPath),readFile(xmlPath,'utf8')]),before=await state()
    assertFourthWaveBaseline(before)
    const all=await prisma.product.findMany({select:{id:true,sku:true,externalId:true,barcode:true,isDeleted:true}}),allowlist=validateFourthWave(content,xml,all);let updated=0
    if(apply)updated=await prisma.$transaction(async tx=>{
      const locked=await tx.product.findMany({select:{id:true,sku:true,externalId:true,barcode:true,isDeleted:true}});const current=validateFourthWave(content,xml,locked)
      const count=await tx.$executeRawUnsafe(`UPDATE "Product" p SET "externalId"=v.external_id FROM (SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) x(id,barcode,external_id)) v WHERE p.id=v.id AND p.barcode=v.barcode AND p."externalId" IS NULL AND NULLIF(BTRIM(COALESCE(p.sku,'')),'') IS NULL AND p."isDeleted"=false`,current.entries.map(x=>x.productId),current.entries.map(x=>x.productBarcode),current.entries.map(x=>x.externalIdToSet))
      if(count!==FOURTH_WAVE_SIZE)throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${count}`);return count
    },{isolationLevel:'Serializable',timeout:120_000,maxWait:10_000})
    const after=await state();if(!apply&&JSON.stringify(before)!==JSON.stringify(after))throw new Error('DATABASE_CHANGED_DURING_DRY_RUN')
    console.log(JSON.stringify({event:'fourth_wave_ean_backfill',mode:apply?'apply':'dry-run',backupBranch:backupBranch??null,xmlSha256:sha256(xml),allowlistSha256:sha256(content),candidates:allowlist.entries.length,wouldUpdate:allowlist.entries.length,conflicts:0,skipped:0,updated,databaseWrites:updated,before,after},null,2))
  }finally{await prisma.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
