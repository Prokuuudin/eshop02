/**
 * Returns clients whose only invitation failed during pre-launch test mailings to «не приглашён»
 * (rules: lib/invitation-test-error-reset.ts). Same protocol as scripts/repair-test-bonus-order-links.ts:
 *
 * Review (READ ONLY transaction, writes only local files):
 *   CLEANUP_DATABASE_URL=... npm run reset:invitation-test-errors -- --out <dir outside the repo>
 * Apply (only the reviewed plan; take a Neon backup branch first):
 *   CLEANUP_DATABASE_URL=... npm run reset:invitation-test-errors -- --out <dir> --apply \
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
  const reset = await import('@/lib/invitation-test-error-reset')
  const { resolveCleanupOperator } = await import('@/lib/test-account-cleanup')

  fs.mkdirSync(out, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(out, `reset-${reset.RESET_RUN_ID}-${stamp}-${apply ? 'apply' : 'review'}.json`)
  console.log(`database host: ${host}`)

  try {
    if (!apply) {
      const report = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const state = await reset.collectInvitationTestErrors(tx)
        return { host, mode: 'review', plan: reset.planInvitationTestErrorReset(state.rows, state.postLaunchErrors), ...state }
      }, { timeout: 60_000 })
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
      // Console output stays free of emails: ids, dates and outcomes only.
      for (const decision of report.plan.decisions) {
        const row = report.rows.find((candidate) => candidate.id === decision.id)!
        console.log(`${decision.outcome.padEnd(5)} ${decision.id} ${row.createdAt} ${decision.reasons.join('; ')}`)
      }
      console.log(`post-launch send errors (not touched): ${report.plan.postLaunchErrors}`)
      console.log(`plan fingerprint: ${report.plan.fingerprint}  changes: ${report.plan.changes}  shown in list: ${report.plan.visibleInList}  refused: ${report.plan.refused}`)
      console.log(`review written to ${file}`)
      return
    }
    const report = await prisma.$transaction(async (tx) => {
      const operator = await resolveCleanupOperator(tx, values['--operator-email'])
      const before = await reset.collectInvitationTestErrors(tx, true)
      fs.writeFileSync(file, JSON.stringify({ host, mode: 'apply-pending', before }, null, 2))
      const result = await reset.applyInvitationTestErrorReset(tx, { confirmFingerprint: values['--confirm'], operator, reason: values['--reason'] })
      return { host, mode: 'applied', operator: operator.email, reason: values['--reason'], before, ...result }
    }, { timeout: 60_000, isolationLevel: 'Serializable' })
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`voided: ${report.voided.length}; plan ${report.plan.fingerprint}; report written to ${file}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'reset failed')
  process.exit(1)
})
