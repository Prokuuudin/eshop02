// ============================================================================
// PRODUCTION WARNING — READ BEFORE RUNNING THIS AGAINST REAL PRODUCTION DATA
// ============================================================================
// Do NOT run this adapter against production before a one-time externalId
// backfill has matched existing Product.sku values to the GrinS feed's <sku>.
//
// ~2,231 already-curated products (imported via scripts/migrate-from-mssql.ts)
// currently have externalId = null but a sku that almost certainly matches the
// feed's <sku> (both trace back to the same nopCommerce/GrinS-fed data). The
// upsert in lib/sync/upsert-products.ts matches rows on externalId, not sku —
// so without the backfill, every one of those 2,231 products gets duplicated
// as a brand-new pending row (isActive=false) instead of being matched and
// updated. The backfill itself is intentionally NOT implemented here: it needs
// the real ~16,025-row export.xml to build and verify against (only the
// 23-row sample is available as of this writing), and is its own follow-up
// task with its own reviewed plan. See docs/superpowers/plans/
// 2026-07-30-grins-xml-sync-adapter.md ("Global Constraints") for the full
// writeup.
//
// The guard below is a last-resort safety net, not a substitute for actually
// doing the backfill: it only checks that *some* product already has an
// externalId set, which is true immediately after a correct backfill and
// stays true forever after — it cannot detect a partial or wrong backfill.
// ============================================================================

import { runSync } from '@/lib/sync/sync-runner'
import { prisma } from '@/lib/prisma'
import { GrinsXmlAdapter } from '@/lib/sync/adapters/grins-xml'

async function assertBackfillDone(): Promise<void> {
  if (process.argv.includes('--allow-first-run')) return

  const backfilledCount = await prisma.product.count({ where: { externalId: { not: null } } })
  if (backfilledCount === 0) {
    throw new Error(
      'Refusing to run: no Product rows have externalId set yet. This looks like the ' +
        'one-time externalId backfill (Product.sku -> GrinS feed sku) has not been run. ' +
        'Running this sync now would duplicate ~2,231 already-curated products as new ' +
        'pending rows instead of matching them. See the warning block at the top of this ' +
        'file. If you have already completed the backfill and this is a fresh/empty ' +
        'database, pass --allow-first-run to proceed anyway.',
    )
  }
}

async function main() {
  const adapter = new GrinsXmlAdapter()

  try {
    await assertBackfillDone()
    const result = await runSync(adapter, prisma, 'manual')
    console.log(JSON.stringify({ event: 'sync_complete', ...result }))
    process.exit(result.status === 'completed' ? 0 : 1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'sync_fatal', error: String(err) }))
  process.exit(1)
})
