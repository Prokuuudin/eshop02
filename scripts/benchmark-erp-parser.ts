import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { parseGrinsXml } from '@/lib/sync/grins-xml-parser'

async function main(): Promise<void> {
  const iterations = Math.max(1, Number(process.env.ERP_BENCH_ITERATIONS ?? 100))
  const p95BudgetMs = Math.max(1, Number(process.env.ERP_PARSE_P95_BUDGET_MS ?? 100))
  const xml = await readFile(new URL('../export_sample.xml', import.meta.url), 'utf8')

  parseGrinsXml(xml)
  const timings: number[] = []
  let productCount = 0
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    productCount = parseGrinsXml(xml).length
    timings.push(performance.now() - started)
  }

  timings.sort((a, b) => a - b)
  const at = (fraction: number): number =>
    timings[Math.min(timings.length - 1, Math.ceil(timings.length * fraction) - 1)] ?? 0
  const result = {
    sampleBytes: Buffer.byteLength(xml),
    productCount,
    iterations,
    p50Ms: Number(at(0.5).toFixed(2)),
    p95Ms: Number(at(0.95).toFixed(2)),
    p99Ms: Number(at(0.99).toFixed(2)),
    heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    budgetPassed: at(0.95) <= p95BudgetMs,
  }

  console.log(JSON.stringify(result))
  if (!result.budgetPassed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
