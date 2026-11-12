/**
 * Clears the order link of the two E2E-fixture bonus rows that point at reused order ids
 * (rules: lib/test-bonus-link-repair.ts). Same protocol as scripts/cleanup-test-accounts.ts:
 *
 * Review (READ ONLY transaction, writes only local files):
 *   CLEANUP_DATABASE_URL=... npm run repair:test-bonus-links -- --out <dir outside the repo>
 * Apply (only the reviewed plan):
 *   CLEANUP_DATABASE_URL=... npm run repair:test-bonus-links -- --out <dir> --apply \
 *     --confirm <fingerprint> --expect-host <db host> --operator-email <super admin> --reason "<why>"
 */
import fs from 'node:fs'
import path from 'node:path'

const FLAGS = new Set(['--out', '--confirm', '--expect-host', '--operator-email', '--reason'])

function parseArgs(argv: string[]): { apply: boolean; values: Record<string, string> } {
  const values: Record<string, string> = {}
  let apply = false
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--apply') { apply = true; continue }
    if (!FLAGS.has(flag)) throw new Error(`unknown argument ${flag}`)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`)
    values[flag] = next
    i += 1
  }
  return { apply, values }
}

async function main(): Promise<void> {
  const { apply, values } = parseArgs(process.argv.slice(2))
  const url = process.env.CLEANUP_DATABASE_URL?.trim()
  if (!url) throw new Error('set CLEANUP_DATABASE_URL explicitly (DATABASE_URL and .env.local are never used)')
  const host = new URL(url).hostname.toLowerCase()
  const out = values['--out']
  if (!out) throw new Error('--out <directory> is required (keep it outside the repository)')
  if (apply) {
    if (!values['--confirm'] || !values['--expect-host'] || !values['--operator-email'] || !values['--reason']?.trim()) {
      throw new Error('--apply needs --confirm, --expect-host, --operator-email and --reason')
    }
    if (values['--expect-host'].toLowerCase() !== host) throw new Error(`--expect-host does not match the database host (${host})`)
  }
  process.env.DATABASE_URL = url
  const { prisma } = await import('@/lib/prisma')
  const repair = await import('@/lib/test-bonus-link-repair')
  const { resolveCleanupOperator } = await import('@/lib/test-account-cleanup')

  fs.mkdirSync(out, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(out, `repair-${repair.REPAIR_RUN_ID}-${stamp}-${apply ? 'apply' : 'review'}.json`)
  console.log(`database host: ${host}`)

  try {
    if (!apply) {
      const report = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const state = await repair.collectBonusLinkState(tx)
        return { host, mode: 'review', plan: repair.planBonusLinkRepair(state.rows, state.allStale), ...state }
      }, { timeout: 60_000 })
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
      for (const decision of report.plan.decisions) console.log(`${decision.outcome.padEnd(6)} ${decision.id} ${decision.reasons.join('; ')}`)
      if (report.plan.otherStaleRows.length) console.log(`other stale rows (not touched): ${report.plan.otherStaleRows.join(', ')}`)
      console.log(`plan fingerprint: ${report.plan.fingerprint}  changes: ${report.plan.changes}  refused: ${report.plan.refused}`)
      console.log(`review written to ${file}`)
      return
    }
    const report = await prisma.$transaction(async (tx) => {
      const operator = await resolveCleanupOperator(tx, values['--operator-email'])
      const before = await repair.collectBonusLinkState(tx, true)
      fs.writeFileSync(file, JSON.stringify({ host, mode: 'apply-pending', before }, null, 2))
      const result = await repair.applyBonusLinkRepair(tx, { confirmFingerprint: values['--confirm'], operator, reason: values['--reason'] })
      return { host, mode: 'applied', operator: operator.email, reason: values['--reason'], before, ...result }
    }, { timeout: 60_000, isolationLevel: 'Serializable' })
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`cleared: ${report.cleared.join(', ') || 'none'}; plan ${report.plan.fingerprint}; report written to ${file}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'repair failed')
  process.exit(1)
})
