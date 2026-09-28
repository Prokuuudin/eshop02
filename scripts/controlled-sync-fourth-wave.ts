import { config } from 'dotenv';config({path:'.env.local'})
import { readFile } from 'node:fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { executeFourthWaveSync, prepareFourthWavePlan } from '../lib/sync/controlled-fourth-wave'
import { FOURTH_WAVE_BASELINE_FINGERPRINT, sha256, validateFourthWave } from '../lib/sync/fourth-wave-backfill'

const valueOf=(name:string)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined}
async function main(){const execute=process.argv.includes('--execute'),allowlistPath=valueOf('--allowlist'),xmlPath=valueOf('--file');if(!allowlistPath||!xmlPath)throw new Error('Explicit --allowlist and --file are required');const{prisma}=await import('../lib/prisma');const state=async()=>(await prisma.$queryRawUnsafe<Array<{count:number;externalIdCount:number;active:number;inactive:number;syncRunCount:number;fingerprint:string}>>(`SELECT COUNT(*)::int count,COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`))[0];try{
  const[content,xml]=await Promise.all([readFile(allowlistPath),readFile(xmlPath,'utf8')]),before=await state(),all=await prisma.product.findMany({select:{id:true,sku:true,externalId:true,barcode:true,isDeleted:true}})
  if(!execute&&(before.count!==6378||before.externalIdCount!==3465||before.active!==2229||before.inactive!==4149||before.syncRunCount!==5||before.fingerprint!==FOURTH_WAVE_BASELINE_FINGERPRINT))throw new Error(`FOURTH_WAVE_BASELINE_MISMATCH:${JSON.stringify(before)}`)
  const allowlist=validateFourthWave(content,xml,all,execute?'post-backfill':'pre-backfill'),feed=parseGrinsXml(xml),plan=await prepareFourthWavePlan(prisma,allowlist,feed,execute?'post-backfill':'preview-before-backfill')
  if(!execute){const after=await state();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('DATABASE_CHANGED_DURING_PREVIEW');console.log(JSON.stringify({event:'controlled_fourth_wave_preview',mode:'dry-run',xmlSha256:sha256(xml),allowlistSha256:sha256(content),...plan.metrics,databaseWrites:0,before,after},null,2));return}
  const result=await executeFourthWaveSync(prisma,allowlist,feed,sha256(xml),sha256(content));console.log(JSON.stringify({event:'controlled_fourth_wave_complete',result},null,2))
}finally{await prisma.$disconnect()}}
main().catch(error=>{console.error(error);process.exitCode=1})
