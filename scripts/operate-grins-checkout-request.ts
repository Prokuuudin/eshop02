/**
 * Plesk "Run script" entry (no arguments): npm run ops:checkout:close | ops:checkout:open.
 * Reads checkout-close.request.json / checkout-open.request.json from GRINS_OPERATIONS_DIR
 * (private, outside the app/document root). Exit 0 = ok, 1 = refused/failed (gate unchanged).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const action = process.argv[2]
  if (action !== 'close' && action !== 'open') throw new Error('operator_confirmation_required')
  const { prisma: db } = await import('@/lib/prisma')
  try {
    const { runCheckoutCloseRequest, runCheckoutOpenRequest } = await import('@/lib/grins-checkout-request')
    const deps = { env: process.env, appRoot: process.cwd(), db }
    const outcome = action === 'close' ? await runCheckoutCloseRequest(deps) : await runCheckoutOpenRequest(deps)
    console.log(JSON.stringify(outcome.output, null, 2))
    process.exitCode = outcome.exitCode
  } finally {
    await db.$disconnect()
  }
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'grins_checkout_request_failed', reason: 'operation_not_verified', checkout: 'unchanged_verify_state' }))
  process.exitCode = 1
})
