import { readFileSync } from 'node:fs'
import { resolveGrinsEnvironment, safeGrinsOperationError, withGrinsEnvironment } from '@/lib/grins-operation-environment'
// Explicit future operator action. No dotenv, migrations, automatic runtime
// initialization or resetting a closed gate. Default mode is read-only check.
import { initializeGrinsCheckoutState, readGrinsCheckoutState } from '@/lib/grins-checkout-preparation'

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const target = option('--target')
  const expectedState = option('--expect-state')
  const initialize = process.argv.includes('--initialize')
  if (!['staging', 'production'].includes(target ?? '') || !['open', 'closed'].includes(expectedState ?? '')) throw new Error('explicit_target_database_and_state_required')
  if (initialize && (option('--confirm-initial-state') !== 'open' || expectedState !== 'open')) throw new Error('initial_open_state_confirmation_required')
  const profile = option('--environment-profile')
  if (!profile) throw new Error('environment_registry_invalid')
  const expected = resolveGrinsEnvironment(JSON.parse(readFileSync(profile, 'utf8')), target, process.env.DATABASE_URL, option('--confirm-production'))
  if ((option('--expected-host') && !expected.hosts.includes(option('--expected-host')!)) || (option('--expected-database') && option('--expected-database') !== expected.database)) throw new Error('database_identity_not_confirmed')
  const { prisma } = await import('@/lib/prisma')
  try {
    const result = await withGrinsEnvironment(prisma, expected, async tx => {
      const state = initialize ? await initializeGrinsCheckoutState(tx) : { created: false, checkoutClosed: await readGrinsCheckoutState(tx) }
      if (state.checkoutClosed === 'missing') throw new Error('checkout_state_missing_release_blocked')
      if (state.checkoutClosed !== (expectedState === 'closed')) throw new Error('checkout_state_unexpected_release_blocked')
      return state
    })
    console.log(JSON.stringify({ event: 'grins_checkout_preparation', target, instanceId: expected.instanceId, action: initialize ? 'initialize-if-missing' : 'check', ...result }))
  } finally { await prisma.$disconnect() }
}

main().catch(error => {
  // Driver exceptions may contain connection strings; never print them.
  const reason = safeGrinsOperationError(error)
  console.error(JSON.stringify({ event: 'grins_checkout_preparation_failed', reason, release: 'blocked' }))
  process.exitCode = 1
})
