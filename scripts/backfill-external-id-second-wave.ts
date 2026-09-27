import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile } from 'fs/promises'
import { SECOND_WAVE_ALLOWLIST_SHA256, SECOND_WAVE_TOTAL, sha256, validateSecondWave } from '../lib/sync/second-wave-backfill'

async function main() {
  const apply = process.argv.includes('--apply'); const backupIndex = process.argv.indexOf('--backup-branch'); const backupBranch = backupIndex >= 0 ? process.argv[backupIndex + 1] : undefined
  if (apply && !backupBranch) throw new Error('SECOND_WAVE_APPLY_BLOCKED_BY_BACKUP: --apply requires a newly confirmed --backup-branch')
  const { prisma } = await import('../lib/prisma')
  const state = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number; fingerprint: string }>>(`SELECT COUNT(*)::int count, COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE "isActive")::int active, COUNT(*) FILTER (WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint FROM "Product" p`))[0]
  try {
    const [xml, allowContent] = await Promise.all([readFile('export.xml', 'utf8'), readFile('second-wave-case-only-allowlist.json')]); const rawAllow = JSON.parse(allowContent.toString()) as { entries: Array<{ productId: string; productSku: string; externalIdToSet: string }> }
    const ids = rawAllow.entries.map(x => x.productId); const before = await state(); const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, isDeleted: true } }); const allowlist = validateSecondWave(allowContent, xml, products)
    let updated = 0
    if (apply) updated = await prisma.$transaction(async tx => {
      const locked = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, isDeleted: true } }); validateSecondWave(allowContent, xml, locked)
      const count = await tx.$executeRawUnsafe(`UPDATE "Product" p SET "externalId"=v.external_id FROM (SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) x(id,sku,external_id)) v WHERE p.id=v.id AND p.sku=v.sku AND p."externalId" IS NULL AND p."isDeleted"=false`, allowlist.entries.map(x => x.productId), allowlist.entries.map(x => x.productSku), allowlist.entries.map(x => x.externalIdToSet))
      if (count !== SECOND_WAVE_TOTAL) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${count}`); return count
    }, { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 10_000 })
    const after = await state(); if (!apply && JSON.stringify(before) !== JSON.stringify(after)) throw new Error('DATABASE_CHANGED_DURING_DRY_RUN')
    console.log(JSON.stringify({ event: 'second_wave_case_only_backfill', mode: apply ? 'apply' : 'dry-run', xmlSha256: sha256(xml), allowlistSha256: sha256(allowContent), expectedAllowlistSha256: SECOND_WAVE_ALLOWLIST_SHA256, backupBranch: backupBranch ?? null, candidates: allowlist.entries.length, wouldUpdate: allowlist.entries.length, updated, conflicts: 0, skipped: 0, databaseWrites: updated, before, after }, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(String(error)); process.exitCode = 1 })
