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
  const targetRunId = option('--run')
  if (!profile || !targetRunId || !process.argv.includes('--execute') || option('--confirm-target-run') !== targetRunId) {
    throw new Error('operator_confirmation_required')
  }
  const expected = resolveGrinsEnvironment(
    JSON.parse(readFileSync(profile, 'utf8')),
    option('--target'),
    process.env.DATABASE_URL,
    option('--confirm-production'),
  )
  if (option('--confirm-operation') !== expected.instanceId) throw new Error('operator_confirmation_required')
  const { prisma: db } = await import('@/lib/prisma')
  try {
    await withGrinsEnvironment(db, expected, async (tx) => {
      const { grinsMaintenanceClosed } = await import('@/lib/grins-import-maintenance')
      if (!await grinsMaintenanceClosed(tx)) throw new Error('maintenance_required')
      const actorId = option('--actor')
      const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: { platformRole: true, teamRole: true } }) : null
      if (!hasAdminPermission(actor, 'catalog.update')) throw new Error('admin_actor_required')
      return true
    })
    const { rollbackLatestStockSnapshot } = await import('@/lib/sync/stock-snapshot')
    const result = await rollbackLatestStockSnapshot(guardGrinsTransactions(db, expected), targetRunId, `operator:${option('--actor')}`)
    console.log(JSON.stringify({ target: expected.target, instanceId: expected.instanceId, action: 'stock-rollback', result }))
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: 'grins_stock_rollback_failed', reason: safeGrinsOperationError(error), checkout: 'keep_closed_until_verified' }))
  process.exitCode = 1
})
