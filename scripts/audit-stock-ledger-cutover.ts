/** Read-only cutover inventory. It never creates allocations or initializes grinsStock. */
import { config } from 'dotenv'
import { buildStockLedgerCutoverReport } from '@/lib/stock-ledger-cutover'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const [products, orders, allocations, checkout] = await Promise.all([
      prisma.product.findMany({
        where: { externalId: { not: null } },
        select: { id: true, externalId: true, stock: true, grinsStock: true, isDeleted: true },
        orderBy: { id: 'asc' },
      }),
      prisma.order.findMany({
        where: { stockReservationStatus: { in: ['reserved', 'committed'] } },
        select: { id: true, createdAt: true, paymentStatus: true, stockReservationStatus: true, items: true },
        orderBy: { id: 'asc' },
      }),
      prisma.stockAllocation.count(),
      prisma.keyValueSetting.findUnique({ where: { key: 'grins-prices-only-maintenance' }, select: { value: true } }),
    ])
    console.log(JSON.stringify(buildStockLedgerCutoverReport(
      products,
      orders,
      allocations,
      Boolean((checkout?.value as { checkoutClosed?: unknown } | null)?.checkoutClosed),
    ), null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
