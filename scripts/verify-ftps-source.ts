// Read-only verification of a GrinS export.xml source (FTPS source migration).
//
//   npx tsx scripts/verify-ftps-source.ts --source candidate   # new FTPS (GRINS_FTPS_CANDIDATE_*)
//   npx tsx scripts/verify-ftps-source.ts --source primary     # current FTPS (GRINS_FTPS_*)
//   npx tsx scripts/verify-ftps-source.ts --file <export.xml>  # already downloaded file
//   add --manifest (FTPS) or --manifest-file <path> (file) to also verify the Hairshop Pro
//   exporter's export.manifest.json: SHA/size/count match + freshness (generatedAt <= 36 h)
//   With <PREFIX>_SOURCE_LAYOUT=run-files the newest complete export-<runId>.xml/.manifest.json
//   pair in <PREFIX>_REMOTE_DIR is verified; the manifest (completion marker) is always checked
//   and must name that runId and XML file. The pair is read exactly like the scheduled stock sync
//   (readFtpsRunFilesSnapshot: one FTPS session, QUIT, bounded transient retries).
//   --no-save: keep nothing on disk (Plesk `npm run verify:ftps`; the app root is no place for XML).
//
// Never imports Prisma, never writes to the database, never changes which source
// the scheduled sync uses. Without --no-save downloads are saved under .ftps-migration/
// (gitignored) so the exact same bytes can be compared and dry-run afterwards.
// Exit codes: 0 PASS, 2 FAIL (contract), 1 connection/download/usage error.
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  downloadFtpsFileWithMetadata, FtpsReadError, getFtpsConfigForSource, readFtpsRunFilesSnapshot, type FtpsConfig, type RunFilesSnapshot,
} from '@/lib/sync/ftps-client'
import { runFilesManifestFailures, STOCK_MANIFEST_MAX_BYTES, STOCK_XML_MAX_BYTES } from '@/lib/sync/ftps-run-files'
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
  const save = !argv.includes('--no-save')

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

  let ftps = getFtpsConfigForSource(target.source)
  let snapshot: RunFilesSnapshot | undefined
  if (ftps.layout === 'run-files') {
    try {
      snapshot = await readFtpsRunFilesSnapshot(ftps, {
        xmlMaxBytes: STOCK_XML_MAX_BYTES,
        manifestMaxBytes: STOCK_MANIFEST_MAX_BYTES,
        onRetry: (retry) => console.log(JSON.stringify({ event: 'ftps_source_verification_retry', ...retry })),
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      const stage = err instanceof FtpsReadError ? err.stage : 'selection'
      const attempts = err instanceof FtpsReadError ? err.attempts : undefined
      console.log(JSON.stringify({ event: 'ftps_source_verification', source: { kind: 'ftps', which: target.source, layout: 'run-files', remoteDir: ftps.remoteDir }, attempts, verdict: 'FAIL', failures: [`run-files ${stage} read failed: ${error}`] }, null, 2))
      console.log('\nRESULT: FAIL')
      return error === 'no_complete_export' ? 2 : 1
    }
    ftps = { ...ftps, remotePath: snapshot.selection.xmlPath }
  }
  const runFiles = snapshot?.selection
  const prefetchedXml = snapshot?.xml
  const warnings: string[] = []
  if (target.source === 'candidate') {
    const same = sameSourceWarning(primaryOrNull(), ftps)
    if (same) warnings.push(same)
  }

  const result = await checkFtpsSource(ftps, prefetchedXml ? async () => prefetchedXml : downloadFtpsFileWithMetadata)
  let savedTo: string | undefined
  if (save && result.content !== undefined && result.verification) {
    mkdirSync(OUT_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
    savedTo = join(OUT_DIR, `${target.source}-export-${stamp}-${result.verification.summary.sha256.slice(0, 8)}.xml`)
    writeFileSync(savedTo, result.content, 'utf-8')
  }

  let manifest: ManifestVerification | undefined
  if ((manifestOption.kind === 'remote' || runFiles) && result.content !== undefined) {
    try {
      const downloaded = snapshot?.manifest ?? await downloadFtpsFileWithMetadata({ ...ftps, remotePath: manifestPathFor(ftps.remotePath) })
      manifest = verifyExportManifest(result.content, downloaded.content, new Date())
      if (runFiles) {
        const naming = runFilesManifestFailures(downloaded.content, runFiles)
        if (naming.length) manifest = { ...manifest, verdict: 'FAIL', failures: [...manifest.failures, ...naming] }
        if (savedTo) writeFileSync(savedTo.replace(/\.xml$/u, '.manifest.json'), downloaded.content, 'utf-8')
      }
    } catch (err) {
      manifest = { verdict: 'FAIL', failures: [`manifest download failed: ${err instanceof Error ? err.message : String(err)}`] }
    }
  }

  const base = result.verification ?? { verdict: 'FAIL' as const, failures: [`connection/download failed: ${result.connection.error}`], warnings: [] }
  const report = {
    event: 'ftps_source_verification',
    source: { kind: 'ftps', which: target.source, ...(snapshot && { layout: 'run-files', runId: snapshot.selection.runId, xml: snapshot.selection.xmlPath, manifest: snapshot.selection.manifestPath, attempts: snapshot.attempts }) },
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
