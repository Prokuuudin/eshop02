import { describe, expect, it } from 'vitest'
import {
  isRunFileName,
  joinRemotePath,
  normalizeRemoteDir,
  parseFtpsSourceLayout,
  runFilesManifestFailures,
  selectLatestRunFiles,
} from './ftps-run-files'

const R1 = '20261017T100000000000Z-1'
const R2 = '20261017T110000000000Z-9'
const R3 = '20261017T120000000000Z-2'
const pair = (runId: string) => [`export-${runId}.xml`, `export-${runId}.manifest.json`]

describe('GrinS run-files layout', () => {
  it('defaults to the fixed layout and rejects unknown layouts', () => {
    expect(parseFtpsSourceLayout(undefined, 'L')).toBe('fixed')
    expect(parseFtpsSourceLayout(' ', 'L')).toBe('fixed')
    expect(parseFtpsSourceLayout('run-files', 'L')).toBe('run-files')
    expect(() => parseFtpsSourceLayout('latest', 'GRINS_FTPS_SOURCE_LAYOUT')).toThrow(/GRINS_FTPS_SOURCE_LAYOUT/)
  })

  it('accepts only plain remote directories', () => {
    expect(normalizeRemoteDir(undefined, 'D')).toBe('')
    expect(normalizeRemoteDir('/grins-feed/', 'D')).toBe('/grins-feed')
    expect(normalizeRemoteDir('/', 'D')).toBe('')
    for (const bad of ['../x', '/a/../b', 'a b', 'C:\\x', '/a;rm']) expect(() => normalizeRemoteDir(bad, 'GRINS_FTPS_REMOTE_DIR')).toThrow(/GRINS_FTPS_REMOTE_DIR/)
    expect(joinRemotePath('', 'a.xml')).toBe('a.xml')
    expect(joinRemotePath('/grins-feed', 'a.xml')).toBe('/grins-feed/a.xml')
  })

  it('selects the newest complete pair and never a pair without its manifest', () => {
    const names = [...pair(R1), ...pair(R2), `export-${R3}.xml`, `export-${R3}.manifest.json.part`]
    expect(selectLatestRunFiles(names, '/grins-feed')).toEqual({
      runId: R2,
      xmlName: `export-${R2}.xml`,
      manifestName: `export-${R2}.manifest.json`,
      xmlPath: `/grins-feed/export-${R2}.xml`,
      manifestPath: `/grins-feed/export-${R2}.manifest.json`,
    })
  })

  it('ignores .part files, foreign and malformed names', () => {
    const names = ['export.xml', 'export.manifest.json', 'probe-x.txt', `export-${R3}.xml.part`, `export-${R3}.manifest.json`,
      'export-20261017T12Z-1.xml', 'export-20261017T12Z-1.manifest.json', `EXPORT-${R2}.xml`, `export-${R2}.MANIFEST.json`, ...pair(R1)]
    expect(selectLatestRunFiles(names, '').runId).toBe(R1)
    expect(selectLatestRunFiles(names.map(n => `/grins-feed/${n}`), '').runId).toBe(R1)
  })

  it('fails closed when no complete pair exists', () => {
    expect(() => selectLatestRunFiles([], '')).toThrow('no_complete_export')
    expect(() => selectLatestRunFiles([`export-${R1}.xml`, 'export.xml', 'export.manifest.json'], '')).toThrow('no_complete_export')
    expect(isRunFileName(`export-${R1}.xml`)).toBe(true)
    expect(isRunFileName('export.xml')).toBe(false)
  })

  it('requires the manifest to name exactly the selected run and XML file', () => {
    const selection = selectLatestRunFiles(pair(R2), '/grins-feed')
    expect(runFilesManifestFailures(JSON.stringify({ runId: R2, xmlFileName: `export-${R2}.xml` }), selection)).toEqual([])
    expect(runFilesManifestFailures(JSON.stringify({ runId: R1, xmlFileName: `export-${R2}.xml` }), selection)).toHaveLength(1)
    expect(runFilesManifestFailures(JSON.stringify({ runId: R2, xmlFileName: 'export.xml' }), selection)).toHaveLength(1)
    expect(runFilesManifestFailures('{', selection)).toEqual(['manifest is not valid JSON'])
  })
})
