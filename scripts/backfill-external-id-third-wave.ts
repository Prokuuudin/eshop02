import { config } from 'dotenv'
config({ path: '.env.local' })
import { readFile } from 'fs/promises'
import { THIRD_WAVE_ALLOWLIST_SHA256, THIRD_WAVE_BASELINE_FINGERPRINT, THIRD_WAVE_SIZE, sha256, validateThirdWave } from '../lib/sync/third-wave-backfill'

const valueOf = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
async function main() {
  const apply = process.argv.includes('--apply'), allowlistPath = valueOf('--allowlist'), xmlPath = valueOf('--file'), backupBranch = valueOf('--backup-branch')
  if (!allowlistPath || !xmlPath) throw new Error('Explicit --allowlist and --file are required')
  if (apply && !backupBranch) throw new Error('THIRD_WAVE_APPLY_BLOCKED_BY_BACKUP')
  const { prisma } = await import('../lib/prisma')
  const state = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number; fingerprint: string }>>(`SELECT COUNT(*)::int count, COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE "isActive")::int active, COUNT(*) FILTER (WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint FROM "Product" p`))[0]
  try {
    const [content, xml] = await Promise.all([readFile(allowlistPath), readFile(xmlPath, 'utf8')]), raw = JSON.parse(content.toString()) as { entries: Array<{ productId: string }> }, ids = raw.entries.map(x => x.productId)
    const before = await state()
    if (before.count !== 6378 || before.externalIdCount !== 3423 || before.active !== 2229 || before.inactive !== 4149 || before.syncRunCount !== 4 || before.fingerprint !== THIRD_WAVE_BASELINE_FINGERPRINT) throw new Error(`THIRD_WAVE_BASELINE_MISMATCH:${JSON.stringify(before)}`)
    const [products, claimed] = await Promise.all([prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, isDeleted: true } }), prisma.product.findMany({ where: { externalId: { not: null } }, select: { externalId: true } })])
    const allowlist = validateThirdWave(content, xml, products, claimed.flatMap(x => x.externalId ? [x.externalId] : [])); let updated = 0
    if (apply) updated = await prisma.$transaction(async tx => {
      const [locked, currentClaims] = await Promise.all([tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, isDeleted: true } }), tx.product.findMany({ where: { externalId: { in: allowlist.entries.map(x => x.externalIdToSet) } }, select: { externalId: true } })])
      validateThirdWave(content, xml, locked, currentClaims.flatMap(x => x.externalId ? [x.externalId] : []))
      const count = await tx.$executeRawUnsafe(`UPDATE "Product" p SET "externalId"=v.external_id FROM (SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) x(id,sku,external_id)) v WHERE p.id=v.id AND p.sku=v.sku AND p."externalId" IS NULL AND p."isDeleted"=false`, allowlist.entries.map(x => x.productId), allowlist.entries.map(x => x.productSku), allowlist.entries.map(x => x.externalIdToSet))
      if (count !== THIRD_WAVE_SIZE) throw new Error(`ATOMIC_UPDATE_COUNT_MISMATCH:${count}`); return count
    }, { isolationLevel: 'Serializable', timeout: 60_000, maxWait: 10_000 })
    const after = await state(); if (!apply && JSON.stringify(before) !== JSON.stringify(after)) throw new Error('DATABASE_CHANGED_DURING_DRY_RUN')
    console.log(JSON.stringify({ event: 'third_wave_duplicate_safe_backfill', mode: apply ? 'apply' : 'dry-run', allowlistPath, xmlPath, backupBranch: backupBranch ?? null, xmlSha256: sha256(xml), allowlistSha256: sha256(content), expectedAllowlistSha256: THIRD_WAVE_ALLOWLIST_SHA256, candidates: allowlist.entries.length, wouldUpdate: allowlist.entries.length, conflicts: 0, skipped: 0, updated, databaseWrites: updated, before, after }, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : JSON.stringify(error, null, 2))
  process.exitCode = 1
})
