import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile, writeFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { executeSecondWaveSync, parseSecondWaveAllowlist, prepareSecondWavePlan, sha256 } from '../lib/sync/controlled-second-wave'
import type { ExtendedPrismaClient } from '../lib/prisma'

const execute = process.argv.includes('--execute')
const fingerprintSql = `SELECT COUNT(*)::int count, COUNT(p."externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE p."isActive")::int active, COUNT(*) FILTER (WHERE NOT p."isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint FROM "Product" p`
const integrity = async (db: ExtendedPrismaClient, ids: string[]) => (await db.$queryRawUnsafe<Array<{ outsideFingerprint: string; protectedScopeFingerprint: string }>>(`SELECT md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id) FILTER (WHERE NOT (p.id=ANY($1::text[]))), '')) "outsideFingerprint", md5(COALESCE(string_agg(((to_jsonb(p)-'price'-'stock'-'updatedAt'-'lastSyncRunId')::text), '' ORDER BY p.id) FILTER (WHERE p.id=ANY($1::text[])), '')) "protectedScopeFingerprint" FROM "Product" p`, ids))[0]

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const [xml, content] = await Promise.all([readFile('export.xml', 'utf8'), readFile('second-wave-case-only-allowlist.json', 'utf8')])
    const xmlSha = sha256(xml), allowlistSha = sha256(content), allowlist = parseSecondWaveAllowlist(content, xmlSha), feed = parseGrinsXml(xml), ids = allowlist.entries.map(x => x.productId)
    const before = (await prisma.$queryRawUnsafe<Record<string, unknown>[]>(fingerprintSql))[0], integrityBefore = await integrity(prisma, ids), plan = await prepareSecondWavePlan(prisma, allowlist, feed)
    const preflight = { mode: execute ? 'execute' : 'dry-run', xmlSha, allowlistSha, before, integrityBefore, productInserts: 0, deactivations: 0, ...plan.metrics }
    if (!execute) { console.log(JSON.stringify({ event: 'controlled_second_wave_preflight', ...preflight, databaseWrites: 0 }, null, 2)); return }
    const controlled = await executeSecondWaveSync(prisma, allowlist, feed, xmlSha, allowlistSha)
    const after = (await prisma.$queryRawUnsafe<Record<string, unknown>[]>(fingerprintSql))[0], integrityAfter = await integrity(prisma, ids), postPlan = await prepareSecondWavePlan(prisma, allowlist, feed)
    const report = { event: 'controlled_second_wave_complete', preflight, controlled, after, integrityAfter, integrityChecks: { outsideProductsUnchanged: integrityBefore.outsideFingerprint === integrityAfter.outsideFingerprint, protectedScopeFieldsUnchanged: integrityBefore.protectedScopeFingerprint === integrityAfter.protectedScopeFingerprint, activeCountUnchanged: before.active === after.active, externalIdCountUnchanged: before.externalIdCount === after.externalIdCount }, idempotency: postPlan.metrics }
    await writeFile('controlled-sync-second-wave-result.json', JSON.stringify(report, null, 2), 'utf8'); console.log(JSON.stringify(report, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(JSON.stringify({ event: 'controlled_second_wave_failed', error: String(error) })); process.exitCode = 1 })
