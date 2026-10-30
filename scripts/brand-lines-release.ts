/**
 * Release-grade BrandLine bootstrap (production-capable, two phases).
 *
 * 1. Plan (read-only, default):
 *    node --conditions=react-server --import tsx scripts/brand-lines-release.ts plan \
 *      --expect-project <id> --expect-branch <id> --expect-endpoint <ep-id> \
 *      --seed <inventory.json> --out <plan.json>
 *
 * 2. Apply exactly that plan:
 *    BRANDLINE_RELEASE_APPLY_ENDPOINT=<ep-id> node --conditions=react-server --import tsx \
 *      scripts/brand-lines-release.ts apply --plan <plan.json> --approve <planSha256> \
 *      --operator <admin e-mail> --expect-project ... --expect-branch ... --expect-endpoint ... \
 *      --seed <inventory.json> [--allow-mass-missing <n>] [--revalidate-base-url https://hairshoppro.lv]
 *
 * 3. Re-run only the storefront revalidation of an applied plan (idempotent, no database access):
 *    HAIRSHOP_CATALOG_SYNC_SECRET=... node --conditions=react-server --import tsx  *      scripts/brand-lines-release.ts revalidate --plan <plan.json> --revalidate-base-url https://hairshoppro.lv
 *
 * Both phases verify through the Neon API (NEON_API_KEY) that DATABASE_URL is the named
 * project/branch/endpoint. Apply additionally needs the endpoint repeated in
 * BRANDLINE_RELEASE_APPLY_ENDPOINT, the plan hash typed by the operator and an existing
 * platform admin as the audited actor. The apply recomputes the plan under the shared
 * taxonomy/BrandLine locks and refuses unless it equals the approved plan. Storefront
 * caches are revalidated through the running application only after the commit.
 * Exit codes: 0 ok, 1 refused, 2 apply failed (rolled back), 3 applied but revalidation failed.
 * Secrets and the database URL are never printed.
 */
import { readFileSync, writeFileSync } from 'node:fs'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function required(name: string): string {
  const value = argument(name)
  if (!value) throw Object.assign(new Error(`${name} is required`), { exitCode: 1 })
  return value
}

async function main(): Promise<number> {
  const command = process.argv[2]
  if (command !== 'plan' && command !== 'apply' && command !== 'revalidate') throw Object.assign(new Error('usage: brand-lines-release.ts plan|apply|revalidate ...'), { exitCode: 1 })
  if (command === 'revalidate') {
    const { requestStorefrontRevalidation } = await import('@/lib/brand-lines/brand-line-release')
    const plan = JSON.parse(readFileSync(required('--plan'), 'utf8')) as { kind?: string; planSha256?: string; snapshot?: { id?: string } }
    if (plan.kind !== 'brand-line-release-plan' || !plan.planSha256 || !plan.snapshot?.id) throw Object.assign(new Error('not a BrandLine release plan file'), { exitCode: 1 })
    const outcome = await requestStorefrontRevalidation({ baseUrl: required('--revalidate-base-url'), secret: process.env.HAIRSHOP_CATALOG_SYNC_SECRET ?? '', snapshotId: plan.snapshot.id, planSha256: plan.planSha256 })
    console.log(JSON.stringify(outcome))
    return outcome.ok ? 0 : 3
  }
  const databaseUrl = process.env.DATABASE_URL ?? ''
  const apiKey = process.env.NEON_API_KEY ?? ''
  if (!databaseUrl || !apiKey) throw Object.assign(new Error('DATABASE_URL and NEON_API_KEY are required'), { exitCode: 1 })

  const { NextRequest } = await import('next/server')
  const { prisma } = await import('@/lib/prisma')
  const { getBrandsConfigFromStore } = await import('@/lib/brands-server-store')
  const { parseAuditInventory, seedsFromAuditInventory } = await import('@/lib/brand-lines/audit-seed')
  const release = await import('@/lib/brand-lines/brand-line-release')

  try {
    const expected = { projectId: required('--expect-project'), branchId: required('--expect-branch'), endpointId: required('--expect-endpoint') }
    const identity = await release.verifyDatabaseIdentity(databaseUrl, expected, release.neonApiLookup(apiKey))
    const inventory = parseAuditInventory(JSON.parse(readFileSync(required('--seed'), 'utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ' ')))
    const brands = (await getBrandsConfigFromStore()).brands.map(brand => ({ key: brand.id, name: brand.name }))
    const { seeds, aliases } = seedsFromAuditInventory(inventory, brands)

    if (command === 'plan') {
      const { release: plan } = await release.buildReleasePlan(prisma, { identity, seeds, aliases })
      writeFileSync(required('--out'), JSON.stringify(plan, null, 2))
      console.log(JSON.stringify({ planSha256: plan.planSha256, snapshot: plan.snapshot, summary: plan.summary, guard: plan.guard }, null, 2))
      console.log(`Review the summary, then apply with --approve ${plan.planSha256}`)
      return 0
    }

    if (process.env.BRANDLINE_RELEASE_APPLY_ENDPOINT !== identity.endpointId) {
      throw Object.assign(new Error('refusing apply: BRANDLINE_RELEASE_APPLY_ENDPOINT must repeat the verified endpoint id'), { exitCode: 1 })
    }
    const approved = JSON.parse(readFileSync(required('--plan'), 'utf8')) as import('@/lib/brand-lines/brand-line-release').ReleasePlan
    if (approved.kind !== 'brand-line-release-plan' || approved.version !== 1) throw Object.assign(new Error('not a BrandLine release plan file'), { exitCode: 1 })
    const operator = await prisma.user.findUnique({ where: { email: required('--operator') }, select: { id: true, email: true, name: true, platformRole: true, mustChangePassword: true } })
    if (!operator || operator.platformRole !== 'admin' || operator.mustChangePassword) {
      throw Object.assign(new Error('refusing apply: --operator must be an active platform administrator'), { exitCode: 1 })
    }
    const allow = argument('--allow-mass-missing')
    const request = new NextRequest('http://localhost/cli/brand-lines-release', { headers: { 'user-agent': 'brand-lines-release-cli' } })
    let result: Awaited<ReturnType<typeof release.applyReleasePlan>>
    try {
      result = await release.applyReleasePlan(prisma, {
        approved, approvedHash: required('--approve'), identity, seeds, aliases, request,
        actor: {
          id: operator.id, email: operator.email, name: operator.name ?? undefined, platformRole: 'admin', approvalRequired: false,
          auditLoggingEnabled: true, bonusPoints: 0, mustChangePassword: false, createdAt: new Date().toISOString(),
        } as import('@/lib/server-auth').ServerUser,
        ...(allow === undefined ? {} : { allowMassMissing: Number(allow) }),
      })
    } catch (error) {
      const code = (error as { code?: string }).code
      // Known release refusals happen before or instead of any write (exit 1); anything
      // else is an unexpected failure of the transaction, which rolled back (exit 2).
      throw Object.assign(new Error(`apply rolled back${code ? ` (${code})` : ''}: ${(error as Error).message}`), { exitCode: error instanceof release.BrandLineReleaseError ? 1 : 2 })
    }
    console.log(JSON.stringify({ applied: result.applied, planSha256: result.planSha256, snapshotId: result.snapshotId }, null, 2))

    const baseUrl = argument('--revalidate-base-url')
    if (!baseUrl) {
      console.log('Committed. Storefront caches were NOT revalidated: run POST /api/admin/storefront-cache/revalidate as an admin, or re-run the revalidation with --revalidate-base-url.')
      return 0
    }
    const outcome = await release.requestStorefrontRevalidation({ baseUrl, secret: process.env.HAIRSHOP_CATALOG_SYNC_SECRET ?? '', snapshotId: result.snapshotId, planSha256: result.planSha256 })
    if (!outcome.ok) {
      console.error(`Committed, but storefront revalidation failed after ${outcome.attempts} attempt(s) (${outcome.status ?? 'no response'}). Caches expire within 10 minutes; re-run "brand-lines-release.ts revalidate --plan <plan.json> --revalidate-base-url ${baseUrl}" to refresh now.`)
      return 3
    }
    console.log('Committed and storefront caches revalidated.')
    return 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(code => process.exit(code)).catch((error: Error & { exitCode?: number; code?: string }) => {
  console.error(`${error.code ? `${error.code}: ` : ''}${error.message}`.replace(/postgres(ql)?:\/\/\S+/gu, '<database-url>'))
  process.exit(error.exitCode ?? 1)
})
