/**
 * Idempotent clean-up of known test accounts (targets and rules: lib/test-account-cleanup.ts).
 *
 * Review (default; READ ONLY transaction, writes only local files):
 *   CLEANUP_DATABASE_URL=... npm run cleanup:test-accounts -- --out <dir outside the repo>
 * Apply (only the reviewed plan; refuses if anything changed since the review):
 *   CLEANUP_DATABASE_URL=... npm run cleanup:test-accounts -- --out <dir> --apply \
 *     --confirm <fingerprint> --expect-host <db host> --operator-email <super admin> --reason "<why>"
 *
 * The database is never taken from DATABASE_URL or .env.local: CLEANUP_DATABASE_URL must be set
 * explicitly for each run. The URL is never printed.
 */
import fs from 'node:fs'
import path from 'node:path'

type Args = { out?: string; apply: boolean; confirm?: string; expectHost?: string; operatorEmail?: string; reason?: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = (): string => {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error(`${flag} needs a value`)
      i += 1
      return next
    }
    if (flag === '--apply') args.apply = true
    else if (flag === '--out') args.out = value()
    else if (flag === '--confirm') args.confirm = value()
    else if (flag === '--expect-host') args.expectHost = value()
    else if (flag === '--operator-email') args.operatorEmail = value()
    else if (flag === '--reason') args.reason = value()
    else throw new Error(`unknown argument ${flag}`)
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const url = process.env.CLEANUP_DATABASE_URL?.trim()
  if (!url) throw new Error('set CLEANUP_DATABASE_URL explicitly (DATABASE_URL and .env.local are never used)')
  const host = new URL(url).hostname.toLowerCase()
  if (!args.out) throw new Error('--out <directory> is required (keep it outside the repository)')
  if (args.apply) {
    if (!args.confirm || !args.expectHost || !args.operatorEmail || !args.reason?.trim()) {
      throw new Error('--apply needs --confirm, --expect-host, --operator-email and --reason')
    }
    if (args.expectHost.toLowerCase() !== host) throw new Error(`--expect-host does not match the database host (${host})`)
  }
  // lib/prisma reads DATABASE_URL when first imported; pin it to the explicit target first.
  process.env.DATABASE_URL = url
  const { prisma } = await import('@/lib/prisma')
  const cleanup = await import('@/lib/test-account-cleanup')

  fs.mkdirSync(args.out, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(args.out, `cleanup-${cleanup.CLEANUP_RUN_ID}-${stamp}-${args.apply ? 'apply' : 'review'}.json`)
  console.log(`database host: ${host}`)

  try {
    if (!args.apply) {
      const report = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        const states = await cleanup.collectCleanupStates(tx)
        return { host, mode: 'review', plan: cleanup.planTestAccountCleanup(states), states, snapshot: await cleanup.snapshotCleanupRows(tx) }
      }, { timeout: 60_000 })
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
      for (const decision of report.plan.decisions) console.log(`${decision.outcome.padEnd(10)} ${decision.action.padEnd(10)} ${decision.id} <${decision.email}> ${decision.reasons.join('; ')}`)
      console.log(`plan fingerprint: ${report.plan.fingerprint}  changes: ${report.plan.changes}  refused: ${report.plan.refused}`)
      console.log(`review written to ${file}`)
      return
    }

    const report = await prisma.$transaction(async (tx) => {
      const operator = await cleanup.resolveCleanupOperator(tx, args.operatorEmail!)
      // Lock first so the snapshot below is exactly the state the plan is checked against.
      await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id = ANY($1::text[]) FOR UPDATE', cleanup.CLEANUP_TARGETS.map((t) => t.id))
      const snapshot = await cleanup.snapshotCleanupRows(tx)
      // Written before anything changes; if the transaction fails it documents the untouched state.
      fs.writeFileSync(file, JSON.stringify({ host, mode: 'apply-pending', snapshot }, null, 2))
      const result = await cleanup.applyTestAccountCleanup(tx, { confirmFingerprint: args.confirm!, operator, reason: args.reason! })
      return { host, mode: 'applied', operator: operator.email, reason: args.reason, snapshot, ...result }
    }, { timeout: 60_000, isolationLevel: 'Serializable' })
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    for (const change of report.applied) console.log(`${change.outcome.padEnd(10)} ${change.id} <${change.email}> ${JSON.stringify(change.removed)}`)
    console.log(`applied plan ${report.plan.fingerprint}; report written to ${file}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'cleanup failed')
  process.exit(1)
})
