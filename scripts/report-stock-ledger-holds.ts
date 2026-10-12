/** Read-only emergency-mode report. Output intentionally contains no credentials. */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main(): Promise<void> {
  const { prisma } = await import('@/lib/prisma')
  const warningUnits = Math.max(1, Number(process.env.GRINS_STOCK_HOLD_WARNING_UNITS ?? '5') || 5)
  try {
    const [statusCounts, aging, constrainedProducts, openExceptions, lastRun] = await Promise.all([
      prisma.stockAllocation.groupBy({ by: ['status'], _count: { _all: true }, _sum: { quantity: true } }),
      prisma.$queryRaw<Array<{ bucket: string; allocations: number; quantity: number }>>`
        SELECT CASE
                 WHEN "acknowledgedAt" >= now() - interval '1 day' THEN 'under_1_day'
                 WHEN "acknowledgedAt" >= now() - interval '3 days' THEN '1_to_3_days'
                 WHEN "acknowledgedAt" >= now() - interval '7 days' THEN '3_to_7_days'
                 ELSE 'over_7_days'
               END AS bucket,
               COUNT(*)::int AS allocations,
               COALESCE(SUM(quantity), 0)::int AS quantity
        FROM "StockAllocation"
        WHERE status = 'awaiting_grins_sync'
        GROUP BY bucket
        ORDER BY bucket
      `,
      prisma.$queryRaw<Array<{ id: string; sku: string | null; externalId: string | null; grinsStock: number; stock: number; heldGap: number }>>`
        SELECT id, sku, "externalId", "grinsStock", stock, ("grinsStock" - stock)::int AS "heldGap"
        FROM "Product"
        WHERE "grinsStock" IS NOT NULL
          AND ("grinsStock" - stock) >= ${warningUnits}
        ORDER BY ("grinsStock" - stock) DESC, id
        LIMIT 100
      `,
      prisma.orderOperationalException.findMany({
        where: { status: 'open' },
        select: { orderId: true, code: true, productIds: true, occurrences: true, firstSeenAt: true, lastSeenAt: true },
        orderBy: { firstSeenAt: 'asc' },
        take: 100,
      }),
      prisma.syncRun.findFirst({
        where: { mode: 'stocks-only' }, orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, startedAt: true, finishedAt: true, productsTotal: true, productsSynced: true, errorCount: true },
      }),
    ])
    console.log(JSON.stringify({
      readOnly: true,
      databaseWrites: 0,
      mode: process.env.GRINS_STOCK_MANIFEST_ENABLED === 'true' ? 'manifest' : 'emergency_no_manifest_no_reconciliation',
      warning: process.env.GRINS_STOCK_RECONCILIATION_ENABLED === 'true'
        ? null
        : 'Acknowledged holds accumulate until a causally verified manifest snapshot can reconcile them.',
      allocationStatusCounts: statusCounts,
      awaitingAgeBuckets: aging,
      productsWithAvailabilityBelowPhysicalByAtLeast: { units: warningUnits, rows: constrainedProducts },
      openOperationalExceptions: openExceptions,
      lastStockRun: lastRun,
    }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
