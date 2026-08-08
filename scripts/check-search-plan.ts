import { config } from 'dotenv'

async function main(): Promise<void> {
config({ path: '.env.local' })
const { prisma } = await import('@/lib/prisma')
const plan = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`
  EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT id
  FROM "Product"
  WHERE "isDeleted" = false
    AND "isActive" = true
    AND (
      COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' ||
      COALESCE(description,'') || ' ' || COALESCE(sku,'')
    ) <-> 'matrix' < 0.9
  ORDER BY (
    COALESCE(title,'') || ' ' || COALESCE(brand,'') || ' ' ||
    COALESCE(description,'') || ' ' || COALESCE(sku,'')
  ) <-> 'matrix'
  LIMIT 20
`)

const text = plan.map((row) => row['QUERY PLAN']).join('\n')
const execution = /Execution Time: ([0-9.]+) ms/.exec(text)?.[1]
const usesTrigramIndex = text.includes('Product_search_trgm_gist_idx')
console.log(JSON.stringify({ event: 'search_plan_checked', usesTrigramIndex, executionMs: execution ? Number(execution) : null }))
if (!usesTrigramIndex) console.warn(text)
await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  process.exitCode = 1
})
