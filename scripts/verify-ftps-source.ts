// Read-only verification of a GrinS export.xml source (FTPS source migration).
//
//   npx tsx scripts/verify-ftps-source.ts --source candidate   # new FTPS (GRINS_FTPS_CANDIDATE_*)
//   npx tsx scripts/verify-ftps-source.ts --source primary     # current FTPS (GRINS_FTPS_*)
//   npx tsx scripts/verify-ftps-source.ts --file <export.xml>  # already downloaded file
//   add --manifest (FTPS) or --manifest-file <path> (file) to also verify the Hairshop Pro
//   exporter's export.manifest.json: SHA/size/count match + freshness (generatedAt <= 36 h)
//
// Never imports Prisma, never writes to the database, never changes which source
// the scheduled sync uses. Downloads are saved under .ftps-migration/ (gitignored)
// so the exact same bytes can be compared and dry-run afterwards.
// Exit codes: 0 PASS, 2 FAIL (contract), 1 connection/download/usage error.
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { downloadFtpsFileWithMetadata, getFtpsConfigForSource, type FtpsConfig } from '@/lib/sync/ftps-client'
import {
  checkFtpsSource, manifestPathFor, parseManifestOption, parseVerifyTarget, sameSourceWarning, verifyExport, verifyExportManifest,
  type ManifestVerification,
} from '@/lib/sync/ftps-source-verification'

config({ path: '.env.local' })

const OUT_DIR = '.ftps-migration'

function primaryOrNull(): FtpsConfig | null {
  try {
    return getFtpsConfigForSource('primary')
  } catch {
    return null
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const target = parseVerifyTarget(argv)
  const manifestOption = parseManifestOption(argv)

  if (target.kind === 'file') {
    const xml = readFileSync(target.path, 'utf-8')
    const verification = verifyExport(xml)
    if (manifestOption.kind === 'remote') throw new Error('--manifest needs --source; use --manifest-file with --file')
    const manifest = manifestOption.kind === 'file' ? verifyExportManifest(xml, readFileSync(manifestOption.path, 'utf-8'), new Date()) : undefined
    const verdict = verification.verdict === 'PASS' && (!manifest || manifest.verdict === 'PASS') ? 'PASS' : 'FAIL'
    console.log(JSON.stringify({ event: 'ftps_source_verification', source: { kind: 'file', path: target.path }, ...verification, verdict, ...(manifest && { manifest }) }, null, 2))
    console.log(`\nRESULT: ${verdict}`)
    return verdict === 'PASS' ? 0 : 2
  }
  if (manifestOption.kind === 'file') throw new Error('--manifest-file is for --file; use --manifest with --source')

  const ftps = getFtpsConfigForSource(target.source)
  const warnings: string[] = []
  if (target.source === 'candidate') {
    const same = sameSourceWarning(primaryOrNull(), ftps)
    if (same) warnings.push(same)
  }

  const result = await checkFtpsSource(ftps, downloadFtpsFileWithMetadata)
  let savedTo: string | undefined
  if (result.content !== undefined && result.verification) {
    mkdirSync(OUT_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    savedTo = join(OUT_DIR, `${target.source}-export-${stamp}-${result.verification.summary.sha256.slice(0, 8)}.xml`)
    writeFileSync(savedTo, result.content, 'utf-8')
  }

  let manifest: ManifestVerification | undefined
  if (manifestOption.kind === 'remote' && result.content !== undefined) {
    try {
      const downloaded = await downloadFtpsFileWithMetadata({ ...ftps, remotePath: manifestPathFor(ftps.remotePath) })
      manifest = verifyExportManifest(result.content, downloaded.content, new Date())
    } catch (err) {
      manifest = { verdict: 'FAIL', failures: [`manifest download failed: ${err instanceof Error ? err.message : String(err)}`] }
    }
  }

  const base = result.verification ?? { verdict: 'FAIL' as const, failures: [`connection/download failed: ${result.connection.error}`], warnings: [] }
  const report = {
    event: 'ftps_source_verification',
    source: { kind: 'ftps', which: target.source },
    connection: result.connection,
    savedTo,
    ...base,
    verdict: base.verdict === 'PASS' && (!manifest || manifest.verdict === 'PASS') ? 'PASS' : 'FAIL',
    ...(manifest && { manifest }),
  }
  report.warnings = [...warnings, ...report.warnings]
  if (savedTo) writeFileSync(savedTo.replace(/\.xml$/u, '.verification.json'), JSON.stringify(report, null, 2), 'utf-8')
  console.log(JSON.stringify(report, null, 2))
  console.log(`\nRESULT: ${report.verdict}${savedTo ? ` — saved ${savedTo}` : ''}`)
  if (!result.connection.ok) return 1
  return report.verdict === 'PASS' ? 0 : 2
}

main()
  .then(code => { process.exitCode = code })
  .catch(err => {
    console.error(JSON.stringify({ event: 'ftps_source_verification_fatal', error: err instanceof Error ? err.message : String(err) }))
    process.exitCode = 1
  })
