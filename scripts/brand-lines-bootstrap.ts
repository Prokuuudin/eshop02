/**
 * BrandLine bootstrap / shadow reconciliation from the active taxonomy snapshot.
 *
 *   npx tsx scripts/brand-lines-bootstrap.ts --seed <inventory.json> [--report <out.json>] [--apply]
 *
 * Default is a read-only dry run. --apply writes BrandLine, mappings, links and the
 * review queue, and is refused unless BRANDLINE_BOOTSTRAP_WRITE_ACK=isolated-branch
 * and DATABASE_URL is not the production database. Product rows are never written.
 * The database URL is never printed.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PRODUCTION_ENDPOINTS = ['ep-long-glitter-aq88pk3t']

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const seedPath = argument('--seed')
  const reportPath = argument('--report')
  if (!seedPath) throw new Error('--seed <inventory.json> is required')
  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const isProduction = PRODUCTION_ENDPOINTS.some(endpoint => databaseUrl.includes(endpoint))
  if (apply && (isProduction || process.env.BRANDLINE_BOOTSTRAP_WRITE_ACK !== 'isolated-branch')) {
    throw new Error('refusing --apply: requires BRANDLINE_BOOTSTRAP_WRITE_ACK=isolated-branch and a non-production database')
  }

  const { prisma } = await import('@/lib/prisma')
  const { getBrandsConfigFromStore } = await import('@/lib/brands-server-store')
  const { runBrandLineBootstrap } = await import('@/lib/brand-lines/brand-line-bootstrap')
  const { compareWithAudit, parseAuditInventory, seedsFromAuditInventory } = await import('@/lib/brand-lines/audit-seed')
  const { effectiveProducts } = await import('@/lib/brand-lines/brand-line-plan')

  // PowerShell exports may contain raw control characters inside strings.
  const inventory = parseAuditInventory(JSON.parse(readFileSync(seedPath, 'utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ' ')))
  const brands = (await getBrandsConfigFromStore()).brands.map(brand => ({ key: brand.id, name: brand.name }))
  const { seeds, aliases, excluded, keyByAuditKey } = seedsFromAuditInventory(inventory, brands)
  const { plan, applied } = await runBrandLineBootstrap({ mode: apply ? 'apply' : 'dry-run', seeds, aliases })

  const direct = Object.fromEntries(Object.values(plan.linesByKey).map(line => [line.key, line.directProducts]))
  const audit = compareWithAudit(inventory, direct, keyByAuditKey)
  const reviewsByReason = plan.reviews.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.reason]: (acc[item.reason] ?? 0) + 1 }), {})
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    seeds: seeds.length,
    seedsExcluded: excluded,
    brandsRootCategoryIds: plan.brandsRootCategoryIds,
    plannedLines: plan.lines.length,
    plannedLinesByOrigin: plan.lines.reduce<Record<string, number>>((acc, line) => ({ ...acc, [line.origin]: (acc[line.origin] ?? 0) + 1 }), {}),
    lineNodesTotal: Object.keys(plan.linesByKey).length,
    nestedLineNodes: Object.values(plan.linesByKey).filter(line => line.parentKey).length,
    maxDepth: Math.max(0, ...Object.values(plan.linesByKey).map(line => line.depth)),
    directLinksTotal: Object.values(plan.linesByKey).reduce((sum, line) => sum + line.directProducts.length, 0),
    links: { create: plan.links.create.length, refresh: plan.links.refresh.length, markMissing: plan.links.markMissing.length, suppressedByAdmin: plan.links.suppressedByAdmin.length },
    manufacturerMappings: plan.manufacturerMappings.length,
    categoryMappings: plan.categoryMappings.reduce<Record<string, number>>((acc, row) => ({ ...acc, [`${row.targetType}:${row.origin}`]: (acc[`${row.targetType}:${row.origin}`] ?? 0) + 1 }), {}),
    genericCategories: plan.genericCategories,
    newSeries: plan.newSeries.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {}),
    reviewsByReason,
    stats: plan.stats,
    audit: {
      nodesCompared: audit.length,
      nodesMatching: audit.filter(row => row.missing.length === 0 && row.extra.length === 0).length,
      expectedDirect: audit.reduce((sum, row) => sum + row.expected, 0),
      plannedDirectForAuditNodes: audit.reduce((sum, row) => sum + row.planned, 0),
      differences: audit.filter(row => row.missing.length || row.extra.length),
    },
    applied,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (reportPath) {
    const lines = Object.values(plan.linesByKey).map(line => ({ ...line, effectiveProducts: effectiveProducts(plan, line.key).length }))
    writeFileSync(reportPath, JSON.stringify({ summary, lines, newSeries: plan.newSeries, reviews: plan.reviews }, null, 2))
  }
  await prisma.$disconnect()
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
