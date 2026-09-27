import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile, writeFile } from 'fs/promises'
import { parseGrinsXml } from '../lib/sync/grins-xml-parser'
import { executeControlledSync, parseAndValidateAllowlist, prepareControlledPlan, sha256 } from '../lib/sync/controlled-first-wave'
import type { ExtendedPrismaClient } from '../lib/prisma'

const execute = process.argv.includes('--execute')
const fingerprintSql = `SELECT COUNT(*)::int AS count, COUNT(p."externalId")::int AS "externalIdCount", COUNT(*) FILTER (WHERE p."isActive")::int AS active, COUNT(*) FILTER (WHERE NOT p."isActive")::int AS inactive, (SELECT COUNT(*)::int FROM "SyncRun") AS "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) AS fingerprint FROM "Product" p`
const integrity = async (prisma: ExtendedPrismaClient, ids: string[]): Promise<{ outsideFingerprint: string; protectedScopeFingerprint: string }> => (await prisma.$queryRawUnsafe<Array<{ outsideFingerprint: string; protectedScopeFingerprint: string }>>(
  `SELECT
     md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id) FILTER (WHERE NOT (p.id = ANY($1::text[]))), '')) AS "outsideFingerprint",
     md5(COALESCE(string_agg(((to_jsonb(p) - 'price' - 'stock' - 'updatedAt' - 'lastSyncRunId')::text), '' ORDER BY p.id) FILTER (WHERE p.id = ANY($1::text[])), '')) AS "protectedScopeFingerprint"
   FROM "Product" p`, ids,
))[0]

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const [xml, allowlistContent] = await Promise.all([readFile('export.xml', 'utf8'), readFile('first-wave-external-id-allowlist.json', 'utf8')])
    const xmlSha = sha256(xml), allowlistSha = sha256(allowlistContent), allowlist = parseAndValidateAllowlist(allowlistContent, xmlSha), feed = parseGrinsXml(xml)
    const before = (await prisma.$queryRawUnsafe<Record<string, unknown>[]>(fingerprintSql))[0]
    const integrityBefore = await integrity(prisma, allowlist.entries.map(row => row.productId))
    const plan = await prepareControlledPlan(prisma, allowlist, feed)
    const preflight = { mode: execute ? 'execute' : 'dry-run', xmlSha, allowlistSha, before, integrityBefore, productInserts: 0, deactivations: 0, ...plan.metrics }
    if (!execute) { console.log(JSON.stringify({ event: 'controlled_first_wave_preflight', ...preflight, databaseWrites: 0 }, null, 2)); return }
    const controlled = await executeControlledSync(prisma, allowlist, feed, xmlSha, allowlistSha)
    const after = (await prisma.$queryRawUnsafe<Record<string, unknown>[]>(fingerprintSql))[0]
    const integrityAfter = await integrity(prisma, allowlist.entries.map(row => row.productId))
    const postPlan = await prepareControlledPlan(prisma, allowlist, feed)
    const report = { event: 'controlled_first_wave_complete', preflight, controlled, after, integrityAfter, integrityChecks: { outsideProductsUnchanged: integrityBefore.outsideFingerprint === integrityAfter.outsideFingerprint, protectedScopeFieldsUnchanged: integrityBefore.protectedScopeFingerprint === integrityAfter.protectedScopeFingerprint, activeCountUnchanged: before.active === after.active, externalIdCountUnchanged: before.externalIdCount === after.externalIdCount }, idempotency: postPlan.metrics }
    await writeFile('controlled-sync-first-wave-result.json', JSON.stringify(report, null, 2), 'utf8')
    console.log(JSON.stringify(report, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(JSON.stringify({ event: 'controlled_first_wave_failed', error: String(error) })); process.exitCode = 1 })
