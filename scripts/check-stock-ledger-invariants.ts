/** Read-only operational health check; output contains no credentials or connection strings. */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('@/lib/prisma')
  const { stockLedgerInvariantViolations } = await import('@/lib/stock-ledger')
  try {
    const [violations, statusCounts, awaiting, lastRun] = await Promise.all([
      prisma.$transaction((tx) => stockLedgerInvariantViolations(tx)),
      prisma.stockAllocation.groupBy({ by: ['status'], _count: { _all: true }, _sum: { quantity: true } }),
      prisma.stockAllocation.findMany({
        where: { status: 'awaiting_grins_sync' },
        select: { orderId: true, productId: true, quantity: true, acknowledgedAt: true },
        orderBy: { acknowledgedAt: 'asc' },
        take: 20,
      }),
      prisma.syncRun.findFirst({
        where: { mode: 'stocks-only' }, orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, startedAt: true, finishedAt: true, productsTotal: true, productsSynced: true, errorCount: true },
      }),
    ])
    const report = {
      readOnly: true,
      databaseWrites: 0,
      healthy: violations.length === 0 && lastRun?.status !== 'failed',
      availabilityInvariantViolations: violations.slice(0, 20),
      allocationStatusCounts: statusCounts,
      awaitingOldestSample: awaiting,
      lastStockRun: lastRun,
    }
    console.log(JSON.stringify(report, null, 2))
    if (process.argv.includes('--strict') && !report.healthy) process.exitCode = 2
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
