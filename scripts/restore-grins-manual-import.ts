// Restores price/stock/ERP-price flags of linked Products from a pre-import
// backup taken by the admin manual GrinS import (lib/sync/manual-import.ts).
//
//   npx tsx scripts/restore-grins-manual-import.ts --list
//   npx tsx scripts/restore-grins-manual-import.ts --backup <key>             # dry-run
//   npx tsx scripts/restore-grins-manual-import.ts --backup <key> --execute   # write
//
// Execute holds the shared sync lock and commits all-or-nothing. It overwrites
// any later change to these fields on the same Products (dry-run shows how many).
import { config } from 'dotenv'

config({ path: '.env.local' })

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const { prisma } = await import('@/lib/prisma')
  const { listPreImportBackups, restorePreImportBackup } = await import('@/lib/sync/manual-import')
  try {
    if (process.argv.includes('--list')) {
      console.log(JSON.stringify({ backups: await listPreImportBackups(prisma) }, null, 2))
      return
    }
    const key = argValue('--backup')
    if (!key) throw new Error('Usage: --list | --backup <key> [--execute]')
    const execute = process.argv.includes('--execute')
    const result = await restorePreImportBackup(prisma, key, { execute })
    console.log(JSON.stringify({ event: 'grins_manual_import_restore', mode: execute ? 'execute' : 'dry-run', ...result }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'grins_manual_import_restore_failed', error: String(err) }))
  process.exitCode = 1
})
