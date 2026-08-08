import { neon } from '@neondatabase/serverless'
import { assertSafeRestoreUrl } from '@/lib/restore-safety'

async function main(): Promise<void> {
const url = assertSafeRestoreUrl(process.env.RESTORE_DATABASE_URL, process.env.DATABASE_URL)

const sql = neon(url)
const tables = ['Product', 'User', 'Order', 'Invoice', 'Payment', 'SyncRun'] as const
const counts: Record<string, number> = {}

for (const table of tables) {
  const rows = await sql.query(`SELECT COUNT(*)::int AS count FROM "${table}"`, []) as Array<{ count: number }>
  counts[table] = Number(rows[0]?.count ?? 0)
}

const latestOrders = await sql`SELECT id, "createdAt" FROM "Order" ORDER BY "createdAt" DESC LIMIT 1`
const latestSync = await sql`SELECT id, status, "startedAt", "finishedAt" FROM "SyncRun" ORDER BY "startedAt" DESC LIMIT 1`

if (counts.Product < 1) throw new Error('Restore verification failed: Product is empty')
if (counts.User < 1) throw new Error('Restore verification failed: User is empty')

console.log(JSON.stringify({ event: 'restore_verified', counts, latestOrder: latestOrders[0] ?? null, latestSync: latestSync[0] ?? null }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
