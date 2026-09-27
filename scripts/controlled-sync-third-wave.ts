import { config } from 'dotenv'; config({ path: '.env.local' })
import { readFile, writeFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { executeThirdWaveSync, parseThirdWaveAllowlist, prepareThirdWavePlan } from '../lib/sync/controlled-third-wave'
import { sha256 } from '../lib/sync/third-wave-backfill'
import type { ExtendedPrismaClient } from '../lib/prisma'

const execute = process.argv.includes('--execute')
const state = async (db: ExtendedPrismaClient) => (await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT COUNT(*)::int count,COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount" FROM "Product"`))[0]
const integrity = async (db: ExtendedPrismaClient, ids: string[]) => (await db.$queryRawUnsafe<Array<{ outsideFingerprint: string; protectedFingerprint: string }>>(`SELECT md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id) FILTER (WHERE NOT (p.id=ANY($1::text[]))), '')) "outsideFingerprint", md5(COALESCE(string_agg(((to_jsonb(p)-'price'-'stock'-'updatedAt'-'lastSyncRunId')::text), '' ORDER BY p.id) FILTER (WHERE p.id=ANY($1::text[])), '')) "protectedFingerprint" FROM "Product" p`, ids))[0]
async function main() { const { prisma } = await import('../lib/prisma'); try {
  const [xml, content] = await Promise.all([readFile('export.xml','utf8'), readFile('third-wave-duplicate-safe-allowlist.json','utf8')]), xmlSha=sha256(xml), allowlistSha=sha256(content), allowlist=parseThirdWaveAllowlist(content,xmlSha), feed=parseGrinsXml(xml), ids=allowlist.entries.map(x=>x.productId)
  const before=await state(prisma), integrityBefore=await integrity(prisma,ids), plan=await prepareThirdWavePlan(prisma,allowlist,feed), zeroTierPriceBaseline=Object.fromEntries(plan.rows.filter(x=>feed.find(i=>i.externalId===x.externalId)?.price===0).map(x=>[x.id,x.originalPrice])), preflight={mode:execute?'execute':'dry-run',xmlSha,allowlistSha,before,integrityBefore,productInserts:0,deactivations:0,zeroTierPriceBaseline,...plan.metrics}
  if (!execute) { console.log(JSON.stringify({event:'controlled_third_wave_preflight',...preflight,databaseWrites:0},null,2)); return }
  const controlled=await executeThirdWaveSync(prisma,allowlist,feed,xmlSha,allowlistSha), after=await state(prisma), integrityAfter=await integrity(prisma,ids), postPlan=await prepareThirdWavePlan(prisma,allowlist,feed)
  const report={event:'controlled_third_wave_complete',preflight,controlled,after,integrityAfter,integrityChecks:{outsideProductsUnchanged:integrityBefore.outsideFingerprint===integrityAfter.outsideFingerprint,protectedScopeFieldsUnchanged:integrityBefore.protectedFingerprint===integrityAfter.protectedFingerprint,activeCountUnchanged:before.active===after.active,externalIdCountUnchanged:before.externalIdCount===after.externalIdCount},idempotency:postPlan.metrics}
  await writeFile('controlled-sync-third-wave-result.json',JSON.stringify(report,null,2),'utf8'); console.log(JSON.stringify(report,null,2))
} finally { await prisma.$disconnect() } }
main().catch(e=>{console.error(e);process.exitCode=1})
