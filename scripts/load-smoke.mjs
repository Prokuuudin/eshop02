import { performance } from 'node:perf_hooks'

const baseUrl = (process.env.LOAD_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const concurrency = Math.max(1, Number(process.env.LOAD_CONCURRENCY ?? 5))
const requestsPerScenario = Math.max(1, Number(process.env.LOAD_REQUESTS ?? 20))
const p95BudgetMs = Math.max(1, Number(process.env.LOAD_P95_BUDGET_MS ?? 2000))
const maxErrorRate = Math.max(0, Number(process.env.LOAD_MAX_ERROR_RATE ?? 0))

const scenarios = [
  { name: 'catalog-page', path: '/api/products?skip=0&take=24' },
  { name: 'search', path: '/api/search?q=matrix&take=20' },
  { name: 'checkout-page', path: '/checkout' },
  { name: 'health', path: '/api/health' },
]

const percentile = (sorted, fraction) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0

async function runScenario({ name, path }) {
  // Keep cold start/connection establishment out of the steady-state sample.
  await fetch(`${baseUrl}${path}`, { redirect: 'manual' }).then((response) => response.arrayBuffer())
  const timings = []
  const statuses = new Map()
  let cursor = 0

  async function worker() {
    while (cursor < requestsPerScenario) {
      cursor += 1
      const started = performance.now()
      try {
        const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
        await response.arrayBuffer()
        timings.push(performance.now() - started)
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1)
      } catch {
        timings.push(performance.now() - started)
        statuses.set('network-error', (statuses.get('network-error') ?? 0) + 1)
      }
    }
  }

  const started = performance.now()
  await Promise.all(Array.from({ length: Math.min(concurrency, requestsPerScenario) }, worker))
  const durationMs = performance.now() - started
  const sorted = timings.sort((a, b) => a - b)
  const errorCount = [...statuses.entries()].reduce(
    (sum, [status, count]) => sum + (status === 'network-error' || Number(status) >= 400 ? count : 0),
    0,
  )
  const errorRate = errorCount / requestsPerScenario
  const p95Ms = Math.round(percentile(sorted, 0.95))
  return {
    scenario: name,
    requests: requestsPerScenario,
    concurrency,
    durationMs: Math.round(durationMs),
    requestsPerSecond: Number((requestsPerScenario / (durationMs / 1000)).toFixed(2)),
    p50Ms: Math.round(percentile(sorted, 0.5)),
    p95Ms,
    p99Ms: Math.round(percentile(sorted, 0.99)),
    errorRate: Number(errorRate.toFixed(4)),
    budgetPassed: p95Ms <= p95BudgetMs && errorRate <= maxErrorRate,
    statuses: Object.fromEntries(statuses),
  }
}

let failed = false
for (const scenario of scenarios) {
  const result = await runScenario(scenario)
  console.log(JSON.stringify(result))
  if (!result.budgetPassed) failed = true
}
if (failed) process.exitCode = 1
