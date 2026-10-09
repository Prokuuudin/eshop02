// Explicit future operator action. No dotenv, migrations, automatic runtime
// initialization or resetting a closed gate. Default mode is read-only check.
import { initializeGrinsCheckoutState, readGrinsCheckoutState } from '@/lib/grins-checkout-preparation'

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const target = option('--target')
  const expectedHost = option('--expected-host')
  const expectedDatabase = option('--expected-database')
  const expectedState = option('--expect-state')
  const initialize = process.argv.includes('--initialize')
  if (!['staging', 'production'].includes(target ?? '') || !expectedHost || !expectedDatabase || !['open', 'closed'].includes(expectedState ?? '')) throw new Error('explicit_target_database_and_state_required')
  if (initialize && (option('--confirm-initial-state') !== 'open' || expectedState !== 'open')) throw new Error('initial_open_state_confirmation_required')
  const connection = process.env.DATABASE_URL
  if (!connection) throw new Error('database_identity_not_confirmed')
  const identity = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(identity.protocol) || identity.hostname.toLowerCase() !== expectedHost.toLowerCase() || decodeURIComponent(identity.pathname.slice(1)) !== expectedDatabase) throw new Error('database_identity_not_confirmed')
  // Import only after arguments and the process-provided URL are validated.
  const { prisma } = await import('@/lib/prisma')
  try {
    const result = initialize ? await initializeGrinsCheckoutState(prisma) : { created: false, checkoutClosed: await readGrinsCheckoutState(prisma) }
    if (result.checkoutClosed === 'missing') throw new Error('checkout_state_missing_release_blocked')
    console.log(JSON.stringify({ event: 'grins_checkout_preparation', target, action: initialize ? 'initialize-if-missing' : 'check', ...result }))
    if (result.checkoutClosed !== (expectedState === 'closed')) throw new Error('checkout_state_unexpected_release_blocked')
  } finally { await prisma.$disconnect() }
}

main().catch(error => {
  // Driver exceptions may contain connection strings; never print them.
  const safeReasons = ['explicit_target_database_and_state_required', 'initial_open_state_confirmation_required', 'database_identity_not_confirmed', 'checkout_state_missing_release_blocked', 'checkout_state_unexpected_release_blocked', 'invalid_checkout_state', 'checkout_state_initialization_unverified']
  const reason = error instanceof Error && safeReasons.includes(error.message) ? error.message : 'preparation_not_verified'
  console.error(JSON.stringify({ event: 'grins_checkout_preparation_failed', reason, release: 'blocked' }))
  process.exitCode = 1
})
