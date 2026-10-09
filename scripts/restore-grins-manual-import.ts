// Restores only prices from a v3 prices-only backup. Catalog/ERP fingerprints
// reject later changes; stock, orders and reservations are never restored.
// Local tsx, --environment-profile, --target and --confirm-operation required
// even for list/dry-run. Production additionally requires --confirm-production.
// No dotenv loading; credentials come only from the approved process env.
import { readFileSync } from 'node:fs'
import { resolveGrinsEnvironment, withGrinsEnvironment, guardGrinsTransactions, safeGrinsOperationError } from '@/lib/grins-operation-environment'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const profile = argValue('--environment-profile')
  if (!profile) throw new Error('environment_registry_invalid')
  const expected = resolveGrinsEnvironment(JSON.parse(readFileSync(profile, 'utf8')), argValue('--target'), process.env.DATABASE_URL, argValue('--confirm-production'))
  if (argValue('--confirm-operation') !== expected.instanceId) throw new Error('operator_confirmation_required')
  const { prisma } = await import('@/lib/prisma')
  const { listPreImportBackups, restorePreImportBackup } = await import('@/lib/sync/manual-import')
  try {
    await withGrinsEnvironment(prisma, expected, async () => true)
    const guarded = guardGrinsTransactions(prisma, expected)
    if (process.argv.includes('--list')) {
      console.log(JSON.stringify({ backups: await listPreImportBackups(prisma) }, null, 2))
      return
    }
    const key = argValue('--backup')
    if (!key) throw new Error('Usage: --list | --backup <key> [--execute]')
    const execute = process.argv.includes('--execute')
    const result = await restorePreImportBackup(guarded, key, { execute })
    console.log(JSON.stringify({ event: 'grins_manual_import_restore', mode: execute ? 'execute' : 'dry-run', ...result }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'grins_manual_import_restore_failed', reason: safeGrinsOperationError(err) }))
  process.exitCode = 1
})
