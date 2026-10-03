// Read-only OLD vs NEW export.xml comparison (FTPS source migration).
//
//   npx tsx scripts/compare-ftps-exports.ts --old <old export.xml> --new <new export.xml>
//
// Inputs are local files (produced by scripts/verify-ftps-source.ts), so the
// comparison is reproducible against exact, SHA-identified bytes. Prints a short
// summary; the full diff goes to .ftps-migration/compare-*.json (gitignored).
// Never touches the database or FTPS.
// Exit codes: 0 PASS or REVIEW (differences listed for a human), 2 FAIL, 1 usage error.
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { compareExports, summarizeComparison } from '@/lib/sync/ftps-source-verification'

const OUT_DIR = '.ftps-migration'

function arg(name: string): string {
  const i = process.argv.indexOf(name)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error('usage: compare-ftps-exports.ts --old <old.xml> --new <new.xml>')
  return value
}

function main(): number {
  const oldPath = arg('--old')
  const newPath = arg('--new')
  const report = compareExports(readFileSync(oldPath, 'utf-8'), readFileSync(newPath, 'utf-8'))
  mkdirSync(OUT_DIR, { recursive: true })
  const reportPath = join(OUT_DIR, `compare-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`)
  writeFileSync(reportPath, JSON.stringify({ oldPath, newPath, ...report }, null, 2), 'utf-8')
  console.log(JSON.stringify({ event: 'ftps_export_comparison', oldPath, newPath, reportPath, ...summarizeComparison(report) }, null, 2))
  console.log(`\nRESULT: ${report.verdict} — full report ${reportPath}`)
  return report.verdict === 'FAIL' ? 2 : 0
}

try {
  process.exitCode = main()
} catch (err) {
  console.error(JSON.stringify({ event: 'ftps_export_comparison_fatal', error: err instanceof Error ? err.message : String(err) }))
  process.exitCode = 1
}
