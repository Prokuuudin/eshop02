// GrinS exporter "run-files" layout (exporter publish.layout = "run-files").
//
// The Hairshop Pro FTPS (IIS, allowReplaceOnRename=false) cannot replace export.xml in place, so
// every exporter run publishes its own immutable pair:
//   export-<runId>.xml            uploaded first (.part -> rename onto a new name)
//   export-<runId>.manifest.json  uploaded last = completion marker
// The source is the newest COMPLETE pair. A pair without its manifest (exporter still running or
// failed mid-way), .part files and foreign names are never selected. Pure functions, no I/O.

export const FTPS_SOURCE_LAYOUTS = ['fixed', 'run-files'] as const
export type FtpsSourceLayout = (typeof FTPS_SOURCE_LAYOUTS)[number]

const RUN_FILE = /^export-(\d{8}T\d{12}Z-\d+)\.(xml|manifest\.json)$/u
const SAFE_DIR = /^\/?([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]*\/?$/u

export interface RunFilesSelection {
  runId: string
  xmlName: string
  manifestName: string
  xmlPath: string
  manifestPath: string
}

export function parseFtpsSourceLayout(raw: string | undefined, name: string): FtpsSourceLayout {
  const value = raw?.trim() || 'fixed'
  if (!(FTPS_SOURCE_LAYOUTS as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${FTPS_SOURCE_LAYOUTS.join(', ')}`)
  }
  return value as FtpsSourceLayout
}

/** "/grins-feed", "grins-feed/" or "" -> normalized directory; "" means the login root. */
export function normalizeRemoteDir(raw: string | undefined, name: string): string {
  const value = (raw ?? '').trim()
  if (!SAFE_DIR.test(value) || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`${name} must be a plain directory path (letters, digits, . _ - and /)`)
  }
  return value.replace(/\/+$/u, '')
}

export function joinRemotePath(remoteDir: string, name: string): string {
  return remoteDir ? `${remoteDir}/${name}` : name
}

export function isRunFileName(name: string): boolean {
  return RUN_FILE.test(name)
}

/** Newest complete pair among the listed names, or throws `no_complete_export`. */
export function selectLatestRunFiles(names: readonly string[], remoteDir: string): RunFilesSelection {
  const seen = new Map<string, Set<string>>()
  for (const raw of names) {
    const name = raw.split('/').pop() ?? ''
    const match = RUN_FILE.exec(name)
    if (!match) continue
    const kinds = seen.get(match[1]) ?? new Set<string>()
    kinds.add(match[2])
    seen.set(match[1], kinds)
  }
  const complete = [...seen].filter(([, kinds]) => kinds.has('xml') && kinds.has('manifest.json')).map(([runId]) => runId)
  if (complete.length === 0) throw new Error('no_complete_export')
  // runId = UTC %Y%m%dT%H%M%S%fZ-<pid>: the same ordering the exporter uses when pruning.
  const runId = complete.sort()[complete.length - 1]
  const xmlName = `export-${runId}.xml`
  const manifestName = `export-${runId}.manifest.json`
  return { runId, xmlName, manifestName, xmlPath: joinRemotePath(remoteDir, xmlName), manifestPath: joinRemotePath(remoteDir, manifestName) }
}

/** The manifest must describe exactly the selected pair (not another run's file renamed). */
export function runFilesManifestFailures(manifestText: string, selection: RunFilesSelection): string[] {
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(manifestText) as Record<string, unknown>
  } catch {
    return ['manifest is not valid JSON']
  }
  const failures: string[] = []
  if (manifest.runId !== selection.runId) failures.push(`manifest runId ${String(manifest.runId)} != ${selection.runId} from the file name`)
  if (manifest.xmlFileName !== selection.xmlName) failures.push(`manifest xmlFileName ${String(manifest.xmlFileName)} != ${selection.xmlName}`)
  return failures
}
