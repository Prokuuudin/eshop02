/**
 * Protected manual return of the stock ledger to legacy mode. Never scheduled.
 *   --dry-run : read-only report of blockers (no lock, no SyncRun)
 *   --execute --confirm-deinitialize <instanceId> : clears grinsStock fields only
 * Both require the private environment registry, a verified DB marker and
 * --confirm-operation <instanceId>; execute additionally needs an admin actor.
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolveGrinsEnvironment, guardGrinsTransactions, safeGrinsOperationError, withGrinsEnvironment } from '@/lib/grins-operation-environment'
import { hasAdminPermission } from '@/lib/admin-permissions'
config({ path: '.env.local' })

const option = (name: string) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

async function main() {
  const profile = option('--environment-profile')
  const dryRun = process.argv.includes('--dry-run')
  const execute = process.argv.includes('--execute')
  if (!profile || dryRun === execute) throw new Error('operator_confirmation_required')
  const expected = resolveGrinsEnvironment(
    JSON.parse(readFileSync(profile, 'utf8')),
    option('--target'),
    process.env.DATABASE_URL,
    option('--confirm-production'),
  )
  if (option('--confirm-operation') !== expected.instanceId) throw new Error('operator_confirmation_required')
  if (execute && option('--confirm-deinitialize') !== expected.instanceId) throw new Error('operator_confirmation_required')
  const { prisma: db } = await import('@/lib/prisma')
  try {
    const guarded = guardGrinsTransactions(db, expected)
    const { deinitializeStockLedger, inspectStockLedgerDeinitialize } = await import('@/lib/sync/stock-ledger-deinitialize')
    if (dryRun) {
      const report = await inspectStockLedgerDeinitialize(guarded)
      console.log(JSON.stringify({ target: expected.target, instanceId: expected.instanceId, action: 'stock-ledger-deinitialize', dryRun: true, report }))
      if (report.blockers.length) process.exitCode = 2
      return
    }
    await withGrinsEnvironment(db, expected, async (tx) => {
      const { grinsMaintenanceClosed } = await import('@/lib/grins-import-maintenance')
      if (!await grinsMaintenanceClosed(tx)) throw new Error('maintenance_required')
      const actorId = option('--actor')
      const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: { platformRole: true, teamRole: true } }) : null
      if (!hasAdminPermission(actor, 'catalog.update')) throw new Error('admin_actor_required')
      return true
    })
    const result = await deinitializeStockLedger(guarded, `operator:${option('--actor')}`)
    console.log(JSON.stringify({ target: expected.target, instanceId: expected.instanceId, action: 'stock-ledger-deinitialize', result }))
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'grins_stock_ledger_deinitialize_failed', reason: safeGrinsOperationError(error), checkout: 'keep_closed_until_verified' }))
  process.exitCode = 1
})
