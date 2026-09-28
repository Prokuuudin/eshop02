/**
 * Identifies Hairshop (retail) promo residue carried into Hairshop-Pro by the one-time
 * nopCommerce migration: legacy `Product.oldPrice` and the `sale` badge that
 * scripts/_set-badges.mjs derived from it. Dry-run by default (writes nothing to the DB).
 *
 * A Product.oldPrice is a cleanup candidate only when ALL hold:
 *   1. the nopCommerce backup (MSSQL) has OldPrice > 0 for the same id and
 *      ROUND(OldPrice * 1.21, 2) equals Product.oldPrice to the cent;
 *   2. the legacy migration source (products.json exported by scripts/export-mssql-to-json.ps1)
 *      carries the same net OldPrice for that id (proves it arrived through the legacy import);
 *   3. no AuditLog product entry ever changed oldPrice for it (no Hairshop-Pro admin edit);
 *   4. no product-overrides entry sets oldPrice for it; the Product is not isCustom.
 * The `sale` badge is removed only for oldPrice candidates where nopCommerce OldPrice > Price
 * (the exact _set-badges rule) and no AuditLog entry / override ever changed badges.
 * Everything else is reported as excluded with a reason. Promo campaigns are not touched.
 *
 * Env: NOP_MSSQL_SERVER, NOP_MSSQL_DATABASE (legacy nopCommerce backup), optional NOP_SQLCMD
 * (sqlcmd binary, default `sqlcmd` on PATH). Output goes to --out, outside the repository.
 *
 * Dry-run: npx tsx scripts/audit-legacy-oldprice-cleanup.ts --out <dir> --migration-source <products.json>
 * Apply:   ... same args ... --apply --expect-fingerprint <sha256>
 *   Recomputes the plan inside one transaction with the rows locked, refuses unless the
 *   fingerprint equals both the argument and the approved rollback.json, then changes only
 *   Product.oldPrice and the single 'sale' badge of the planned rows. All-or-nothing.
 */
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const argValue = (flag: string) => { const index = process.argv.indexOf(flag); return index > 0 ? process.argv[index + 1] : undefined }
const requireArg = (flag: string) => { const value = argValue(flag); if (!value) throw new Error(`${flag} is required`); return value }
const requireEnv = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value }
const OUT = requireArg('--out')
const MIGRATION_PRODUCTS = requireArg('--migration-source')
const APPLY = process.argv.includes('--apply')
const EXPECTED_FINGERPRINT = argValue('--expect-fingerprint')

const cents = (value: number) => Math.round(value * 100)
const gross = (net: number) => Math.round(net * 1.21 * 100) / 100

type NopRow = { price: number; oldPrice: number }
type Db = import('@/lib/prisma').ExtendedPrismaClient | import('@/lib/prisma').ExtendedTransactionClient
type RollbackRow = { id: string; oldPrice: string | null; badges: string[] }
type Candidate = {
  id: string; sku: string | null; externalId: string | null; isActive: boolean; title: string; price: string
  before: { oldPrice: string | null; badges: string[] }; after: { oldPrice: string | null; badges: string[] }
  evidence: unknown
}

function loadNopcommerce(): Map<string, NopRow> {
  const out = execFileSync(process.env.NOP_SQLCMD ?? 'sqlcmd', ['-S', requireEnv('NOP_MSSQL_SERVER'), '-d', requireEnv('NOP_MSSQL_DATABASE'), '-C', '-W', '-s', '|', '-h', '-1', '-Q',
    'SET NOCOUNT ON; SELECT Id, Price, ISNULL(OldPrice,0) FROM Product'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const map = new Map<string, NopRow>()
  for (const line of out.split(/\r?\n/)) {
    const [id, price, oldPrice] = line.split('|').map(value => value?.trim())
    if (!id || !/^\d+$/.test(id)) continue
    map.set(id, { price: Number(price), oldPrice: Number(oldPrice) })
  }
  if (map.size === 0) throw new Error('nopCommerce export returned no rows')
  return map
}

function loadMigrationSource(): Map<string, NopRow> {
  // The sqlcmd FOR JSON export is not strictly valid JSON (raw control chars / bad escapes in
  // HTML descriptions), so read the fixed-order numeric fields of each object directly.
  const text = readFileSync(MIGRATION_PRODUCTS, 'utf8')
  const map = new Map<string, NopRow>()
  for (const chunk of text.split('{"id":"').slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"'))
    const match = chunk.match(/,"price":(-?[\d.]+)(?:,"oldPrice":(-?[\d.]+))?,"stock"/)
    if (/^\d+$/.test(id) && match) map.set(id, { price: Number(match[1]), oldPrice: Number(match[2] ?? 0) })
  }
  if (map.size === 0) throw new Error('migration source parsed to zero rows')
  return map
}

const fieldChanged = (before: unknown, after: unknown, field: string) => {
  const b = before && typeof before === 'object' ? (before as Record<string, unknown>)[field] : undefined
  const a = after && typeof after === 'object' ? (after as Record<string, unknown>)[field] : undefined
  return JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)
}

async function buildPlan(db: Db, nop: Map<string, NopRow>, migration: Map<string, NopRow>) {
  const products = await db.$queryRawUnsafe<Array<{ id: string; sku: string | null; externalId: string | null; title: string; price: string; oldPrice: string | null; badges: string[]; isActive: boolean; isCustom: boolean }>>(
    `SELECT id, sku, "externalId", title, price::text price, "oldPrice"::text "oldPrice", badges, "isActive", "isCustom"
       FROM "Product" WHERE "isDeleted" = false AND ("oldPrice" IS NOT NULL OR 'sale' = ANY(badges)) ORDER BY id`)
  const audits = await db.auditLog.findMany({ where: { entityType: 'product' }, select: { entityId: true, action: true, before: true, after: true } })
  const oldPriceTouched = new Set<string>(), badgesTouched = new Set<string>(), auditOpaque = new Set<string>()
  for (const entry of audits) {
    if (entry.before == null || entry.after == null) { auditOpaque.add(entry.entityId); continue }
    if (fieldChanged(entry.before, entry.after, 'oldPrice')) oldPriceTouched.add(entry.entityId)
    if (fieldChanged(entry.before, entry.after, 'badges')) badgesTouched.add(entry.entityId)
  }
  const overrides = ((await db.keyValueSetting.findUnique({ where: { key: 'product-overrides' } }))?.value ?? {}) as Record<string, Record<string, unknown>>

  const candidates: Candidate[] = [], excluded: unknown[] = [], rollback: RollbackRow[] = []
  let oldPriceCleared = 0, oldPriceClearedActive = 0, saleRemoved = 0, saleRemovedActive = 0
  const excludedReasons: Record<string, number> = {}
  const exclude = (row: typeof products[number], field: 'oldPrice' | 'sale', reason: string) => {
    excluded.push({ id: row.id, sku: row.sku, externalId: row.externalId, isActive: row.isActive, price: row.price, oldPrice: row.oldPrice, badges: row.badges, field, reason })
    excludedReasons[`${field}:${reason}`] = (excludedReasons[`${field}:${reason}`] ?? 0) + 1
  }

  for (const row of products) {
    const src = nop.get(row.id), mig = migration.get(row.id)
    let oldPriceIsLegacy = false
    if (row.oldPrice != null) {
      const stored = Number(row.oldPrice)
      const reason =
        row.isCustom ? 'custom_product'
        : !src ? 'no_nopcommerce_row'
        : !(src.oldPrice > 0) ? 'nopcommerce_oldprice_empty'
        : cents(gross(src.oldPrice)) !== cents(stored) ? 'nopcommerce_oldprice_mismatch'
        : !mig || !(mig.oldPrice > 0) ? 'missing_in_migration_source'
        : cents(gross(mig.oldPrice)) !== cents(stored) ? 'migration_source_mismatch'
        : oldPriceTouched.has(row.id) ? 'admin_changed_oldprice_in_auditlog'
        : auditOpaque.has(row.id) ? 'auditlog_entry_without_before_after'
        : overrides[row.id] && 'oldPrice' in overrides[row.id] ? 'override_sets_oldprice'
        : null
      if (reason) exclude(row, 'oldPrice', reason)
      else oldPriceIsLegacy = true
    }

    let removeSale = false
    if (row.badges.includes('sale')) {
      const reason =
        !oldPriceIsLegacy ? (row.oldPrice == null ? 'sale_without_oldprice' : 'oldprice_not_proven_legacy')
        : !(src!.oldPrice > src!.price) ? 'set_badges_rule_not_met_in_source'
        : badgesTouched.has(row.id) ? 'admin_changed_badges_in_auditlog'
        : overrides[row.id] && 'badges' in overrides[row.id] ? 'override_sets_badges'
        : null
      if (reason) exclude(row, 'sale', reason)
      else removeSale = true
    }

    if (!oldPriceIsLegacy && !removeSale) continue
    const after = { oldPrice: oldPriceIsLegacy ? null : row.oldPrice, badges: removeSale ? row.badges.filter(badge => badge !== 'sale') : row.badges }
    if (oldPriceIsLegacy) { oldPriceCleared++; if (row.isActive) oldPriceClearedActive++ }
    if (removeSale) { saleRemoved++; if (row.isActive) saleRemovedActive++ }
    candidates.push({
      id: row.id, sku: row.sku, externalId: row.externalId, isActive: row.isActive, title: row.title.slice(0, 80), price: row.price,
      before: { oldPrice: row.oldPrice, badges: row.badges }, after,
      evidence: {
        nopcommerceNet: src ? { price: src.price, oldPrice: src.oldPrice } : null,
        migrationSourceNet: mig ? { price: mig.price, oldPrice: mig.oldPrice } : null,
        reason: [oldPriceIsLegacy && 'oldPrice = nopCommerce OldPrice x1.21 carried by legacy migration, never edited by Hairshop-Pro admin',
          removeSale && 'sale badge = _set-badges.mjs rule (oldPrice > price) on that legacy oldPrice'].filter(Boolean),
      },
    })
    rollback.push({ id: row.id, oldPrice: row.oldPrice, badges: row.badges })
  }

  const fingerprint = createHash('sha256').update(JSON.stringify(rollback)).digest('hex')
  const summary = {
    mode: APPLY ? 'APPLY' : 'DRY_RUN', generatedAt: new Date().toISOString(), fingerprint,
    scanned: products.length, productsAffected: candidates.length,
    productsAffectedActive: candidates.filter(row => row.isActive).length,
    productsAffectedLinked: candidates.filter(row => row.externalId).length,
    oldPriceCleared, oldPriceClearedActive, saleRemoved, saleRemovedActive,
    excludedRows: excluded.length, excludedReasons,
    activeWithOldPriceGreaterThanPriceAfter: candidates
      .filter(row => row.isActive && row.after.oldPrice != null && Number(row.after.oldPrice) > Number(row.price)).length,
  }
  return { summary, candidates, excluded, rollback, fingerprint }
}

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const nop = loadNopcommerce()
    const migration = loadMigrationSource()
    if (!APPLY) {
      const { summary, candidates, excluded, rollback, fingerprint } = await buildPlan(prisma, nop, migration)
      mkdirSync(OUT, { recursive: true })
      writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ summary, candidates }, null, 1))
      writeFileSync(join(OUT, 'excluded.json'), JSON.stringify(excluded, null, 1))
      writeFileSync(join(OUT, 'rollback.json'), JSON.stringify({ fingerprint, generatedAt: summary.generatedAt, rows: rollback }, null, 1))
      console.log(JSON.stringify(summary, null, 1))
      console.log(`\nWritten to ${OUT}: plan.json, excluded.json, rollback.json. No database writes were made.`)
      return
    }

    if (!EXPECTED_FINGERPRINT) throw new Error('--apply requires --expect-fingerprint <sha256> from the approved dry-run')
    const approved = JSON.parse(readFileSync(join(OUT, 'rollback.json'), 'utf8')) as { fingerprint: string; rows: RollbackRow[] }
    if (approved.fingerprint !== EXPECTED_FINGERPRINT) throw new Error(`Approved rollback.json fingerprint ${approved.fingerprint} differs from --expect-fingerprint`)
    const approvedIds = approved.rows.map(row => row.id)

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(`SELECT id FROM "Product" WHERE id = ANY($1::text[]) FOR UPDATE`, approvedIds)
      const plan = await buildPlan(tx, nop, migration)
      if (plan.fingerprint !== EXPECTED_FINGERPRINT) throw new Error(`PLAN_DRIFT: recomputed fingerprint ${plan.fingerprint} ≠ approved ${EXPECTED_FINGERPRINT}`)
      if (JSON.stringify(plan.rollback) !== JSON.stringify(approved.rows)) throw new Error('PLAN_DRIFT: recomputed rows differ from approved rollback.json')
      const payload = plan.candidates.map(row => ({ id: row.id, before_old: row.before.oldPrice, before_badges: row.before.badges, new_old: row.after.oldPrice, new_badges: row.after.badges }))
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "Product" AS p SET "oldPrice" = v.new_old, badges = v.new_badges
           FROM jsonb_to_recordset($1::jsonb) AS v(id text, before_old numeric, before_badges text[], new_old numeric, new_badges text[])
          WHERE p.id = v.id AND p."isDeleted" = false
            AND p."oldPrice" IS NOT DISTINCT FROM v.before_old AND p.badges = v.before_badges`,
        JSON.stringify(payload))
      if (updated !== plan.candidates.length) throw new Error(`UPDATE_COUNT_MISMATCH: expected ${plan.candidates.length}, got ${updated}`)
      const after = await tx.$queryRawUnsafe<Array<{ id: string; oldPrice: string | null; badges: string[] }>>(
        `SELECT id, "oldPrice"::text "oldPrice", badges FROM "Product" WHERE id = ANY($1::text[])`, approvedIds)
      const byId = new Map(after.map(row => [row.id, row]))
      for (const row of plan.candidates) {
        const current = byId.get(row.id)
        const expectedOld = row.after.oldPrice == null ? null : Number(row.after.oldPrice)
        const actualOld = current?.oldPrice == null ? null : Number(current.oldPrice)
        if (!current || actualOld !== expectedOld || JSON.stringify(current.badges) !== JSON.stringify(row.after.badges)) throw new Error(`POST_CHECK_FAILED for ${row.id}`)
      }
      return { updated, summary: plan.summary }
    }, { maxWait: 10_000, timeout: 120_000 })

    writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify({ appliedAt: new Date().toISOString(), fingerprint: EXPECTED_FINGERPRINT, ...result }, null, 1))
    console.log(JSON.stringify({ event: 'legacy_cleanup_applied', updated: result.updated, fingerprint: EXPECTED_FINGERPRINT, rollback: join(OUT, 'rollback.json') }, null, 1))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exit(1) })
