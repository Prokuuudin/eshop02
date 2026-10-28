/**
 * Plesk "Run script" entry (no arguments): npm run ops:stock-deinitialize:dry-run | ops:stock-deinitialize:execute.
 * Reads the one-time request from GRINS_OPERATIONS_DIR (private, outside the app/document root).
 * Exit 0 = ok, 2 = dry-run found blockers, 1 = refused/failed (database unchanged unless the result says completed).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const mode = process.argv[2]
  if (mode !== 'dry-run' && mode !== 'execute') throw new Error('operator_confirmation_required')
  const { prisma: db } = await import('@/lib/prisma')
  try {
    const { runDeinitializeRequest } = await import('@/lib/sync/stock-ledger-deinitialize-request')
    const outcome = await runDeinitializeRequest(mode, { env: process.env, appRoot: process.cwd(), db })
    console.log(JSON.stringify(outcome.output, null, 2))
    process.exitCode = outcome.exitCode
  } finally {
    await db.$disconnect()
  }
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'grins_stock_ledger_deinitialize_failed', reason: 'operation_not_verified', checkout: 'keep_closed_until_verified' }))
  process.exitCode = 1
})
