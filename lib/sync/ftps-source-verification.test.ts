import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Verification/comparison must be database-free: importing Prisma at all is a failure.
vi.mock('@/lib/prisma', () => {
  throw new Error('ftps-source-verification must not import Prisma')
})

import {
  canonicalDecimal,
  checkFtpsSource,
  compareExports,
  manifestPathFor,
  parseManifestOption,
  parseVerifyTarget,
  sameSourceWarning,
  summarizeComparison,
  verifyExport,
  verifyExportManifest,
  sha256,
} from './ftps-source-verification'

const sampleXml = readFileSync(join(__dirname, '..', '..', 'export_sample.xml'), 'utf-8')

interface ItemSpec {
  sku: string
  price1?: string; price2?: string; price3?: string; price4?: string
  quantity?: string
  /** index ("1".."9") → raw value; default all nine = "0". */
  warehouses?: Record<string, string> | null
  omit?: string[]
}

function item(spec: ItemSpec): string {
  const omit = new Set(spec.omit ?? [])
  const field = (name: string, value: string) => (omit.has(name) ? '' : `<${name}>${value}</${name}>`)
  const wh = spec.warehouses === null || omit.has('warehouses')
    ? ''
    : `<warehouses>${Object.entries(spec.warehouses ?? Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), '0'])))
      .map(([id, v]) => `<warehouse id="${id}">${v}</warehouse>`).join('')}</warehouses>`
  return `<item>${field('sku', spec.sku)}<code /><title>t</title>${field('price1', spec.price1 ?? '10')}${field('price2', spec.price2 ?? '8')}${field('price3', spec.price3 ?? '0')}${field('price4', spec.price4 ?? '0')}${field('quantity', spec.quantity ?? '0')}${wh}</item>`
}

const xml = (...items: ItemSpec[]) => `<?xml version="1.0" encoding="utf-8"?><root>${items.map(item).join('')}</root>`
const allWh = (overrides: Record<string, string> = {}) => ({ ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), '1'])), ...overrides })
const opts = { minRows: 1 }

describe('canonicalDecimal', () => {
  it('normalizes equal values without float math and rejects non-decimals', () => {
    expect(canonicalDecimal('7.00')).toBe('7')
    expect(canonicalDecimal(' 07.50 ')).toBe('7.5')
    expect(canonicalDecimal('-0.0')).toBe('0')
    expect(canonicalDecimal('6.4575')).toBe('6.4575')
    expect(canonicalDecimal('7,5')).toBeNull()
    expect(canonicalDecimal('')).toBeNull()
  })
})

describe('verifyExport', () => {
  it('accepts the real sample feed structure and reports size, SHA-256 and warehouses', () => {
    const result = verifyExport(sampleXml, opts)
    // The 23-row sample is price2=0-heavy (5/23); that ratio gate is the only failure.
    expect(result.failures).toEqual([expect.stringMatching(/^price2=0 for 21\.74%/u)])
    expect(result.summary.itemCount).toBe(23)
    expect(result.summary.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(result.summary.sizeBytes).toBe(Buffer.byteLength(sampleXml, 'utf-8'))
    expect(result.summary.warehouseIndexes).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(result.summary.leadingZeroSkuSample).toContain('0680.11')
  })

  it('fails below the production minimum row count by default', () => {
    expect(verifyExport(sampleXml).failures.join()).toMatch(/minimum 14000/u)
  })

  it('fails on malformed XML', () => {
    const result = verifyExport('<root><item><sku>A</sku></root>', opts)
    expect(result.verdict).toBe('FAIL')
    expect(result.summary.validXml).toBe(false)
  })

  it('fails on duplicate and empty SKUs', () => {
    const result = verifyExport(xml({ sku: 'A', warehouses: allWh() }, { sku: 'A', warehouses: allWh() }, { sku: ' ', warehouses: allWh() }), opts)
    expect(result.verdict).toBe('FAIL')
    expect(result.summary.duplicateSkuSample).toEqual(['A'])
    expect(result.summary.emptySkus).toBe(1)
  })

  it('fails when price2 or the warehouses block is missing', () => {
    const result = verifyExport(xml({ sku: 'A', omit: ['price2'], warehouses: allWh() }, { sku: 'B', warehouses: null }), opts)
    expect(result.verdict).toBe('FAIL')
    expect(result.summary.itemsMissingField.price2).toBe(1)
    expect(result.summary.itemsMissingField.warehouses).toBe(1)
    expect(result.failures.join()).toMatch(/no <price2>/u)
  })

  it('fails when an item lacks a Hairshop Pro warehouse even if the index exists elsewhere', () => {
    const partial = Object.fromEntries(Object.entries(allWh()).filter(([id]) => id !== '6'))
    const result = verifyExport(xml({ sku: 'A', warehouses: allWh() }, { sku: 'B', warehouses: partial }), opts)
    expect(result.summary.itemsMissingProWarehouse).toBe(1)
    expect(result.summary.itemsMissingProWarehouseSample).toEqual(['B'])
    expect(result.verdict).toBe('FAIL')
  })

  it('fails on invalid prices/stocks and warns on negative values', () => {
    const invalid = verifyExport(xml({ sku: 'A', price2: '7,5', warehouses: allWh({ '2': 'x' }) }), opts)
    expect(invalid.summary.invalidPrices).toBe(1)
    expect(invalid.summary.invalidStocks).toBe(1)
    expect(invalid.verdict).toBe('FAIL')
    const negative = verifyExport(xml({ sku: 'A', price3: '-1', warehouses: allWh({ '1': '-2' }) }), opts)
    expect(negative.verdict).toBe('PASS')
    expect(negative.summary.negativePrices).toBe(1)
    expect(negative.summary.negativeStocks).toBe(1)
    expect(negative.warnings.join()).toMatch(/negative/u)
  })

  it('counts price2=0 and enforces the scheduled preflight HARD ratio', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ sku: `S${i}`, price2: i < 2 ? '0' : '5', warehouses: allWh() }))
    const result = verifyExport(xml(...items), opts)
    expect(result.summary.price2Zero).toBe(2)
    expect(result.verdict).toBe('FAIL')
    expect(result.failures.join()).toMatch(/price2=0 for 20\.00%/u)
  })
})

describe('checkFtpsSource', () => {
  const config = { host: 'new.example', user: 'u', password: 'secret', remotePath: 'export.xml' }

  it('reports FTPS/TLS errors without content or verification', async () => {
    const result = await checkFtpsSource(config, async () => { throw new Error('self-signed certificate') })
    expect(result.connection).toEqual({ ok: false, host: 'new.example', port: 21, remotePath: 'export.xml', error: 'self-signed certificate' })
    expect(result.content).toBeUndefined()
    expect(result.verification).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('verifies downloaded content and passes TLS metadata through', async () => {
    const tls = { protocol: 'TLSv1.3', cipher: 'TLS_AES_256_GCM_SHA384', authorized: true }
    const content = xml({ sku: '0680.11', warehouses: allWh() })
    const result = await checkFtpsSource({ ...config, port: 2121 }, async () => ({ content, tls, modifiedAt: '2026-10-01T00:00:00.000Z' }), opts)
    expect(result.connection).toMatchObject({ ok: true, port: 2121, tls })
    expect(result.verification?.verdict).toBe('PASS')
  })
})

describe('sameSourceWarning', () => {
  const base = { host: 'ftp.example', user: 'u', password: 'p', remotePath: 'export.xml' }
  it('flags a candidate identical to the primary source', () => {
    expect(sameSourceWarning(base, { ...base, host: 'FTP.example', password: 'other' })).toMatch(/same host/u)
    expect(sameSourceWarning(base, { ...base, remotePath: 'pro/export.xml' })).toBeNull()
    expect(sameSourceWarning(null, base)).toBeNull()
  })
})

describe('parseVerifyTarget', () => {
  it('requires an explicit source and never defaults', () => {
    expect(() => parseVerifyTarget([])).toThrow(/--source candidate/u)
    expect(() => parseVerifyTarget(['--source', 'production'])).toThrow(/primary" or "candidate/u)
    expect(() => parseVerifyTarget(['--source'])).toThrow(/requires a value/u)
    expect(() => parseVerifyTarget(['--source', 'candidate', '--file', 'a.xml'])).toThrow(/not both/u)
    expect(parseVerifyTarget(['--source', 'candidate'])).toEqual({ kind: 'ftps', source: 'candidate' })
    expect(parseVerifyTarget(['--file', 'a.xml'])).toEqual({ kind: 'file', path: 'a.xml' })
  })
})

describe('compareExports', () => {
  it('returns PASS for identical exports', () => {
    const report = compareExports(sampleXml, sampleXml)
    expect(report.verdict).toBe('PASS')
    expect(report.skus.common).toBe(23)
    expect(report.old.sha256).toBe(report.new.sha256)
  })

  it('lists SKUs present in only one source', () => {
    const report = compareExports(
      xml({ sku: 'A', warehouses: allWh() }, { sku: 'B', warehouses: allWh() }),
      xml({ sku: 'A', warehouses: allWh() }, { sku: 'C', warehouses: allWh() }),
      { maxMissingRatio: 1 },
    )
    expect(report.skus.onlyInOld).toEqual(['B'])
    expect(report.skus.onlyInNew).toEqual(['C'])
    expect(report.verdict).toBe('REVIEW')
  })

  it('fails on mass SKU disappearance', () => {
    const old = xml(...Array.from({ length: 10 }, (_, i) => ({ sku: `S${i}`, warehouses: allWh() })))
    const next = xml(...Array.from({ length: 8 }, (_, i) => ({ sku: `S${i}`, warehouses: allWh() })))
    const report = compareExports(old, next)
    expect(report.verdict).toBe('FAIL')
    expect(report.failures.join()).toMatch(/2 OLD SKUs \(20\.00%\) are missing/u)
  })

  it('fails when leading zeros are lost and flags case-only changes', () => {
    const report = compareExports(
      xml({ sku: '0680.11', warehouses: allWh() }, { sku: 'abc', warehouses: allWh() }),
      xml({ sku: '680.11', warehouses: allWh() }, { sku: 'ABC', warehouses: allWh() }),
      { maxMissingRatio: 1 },
    )
    expect(report.skus.leadingZeroLost).toEqual([{ old: '0680.11', new: '680.11' }])
    expect(report.skus.caseChanged).toEqual([{ old: 'abc', new: 'ABC' }])
    expect(report.verdict).toBe('FAIL')
  })

  it('reports price2 differences and price2=0 transitions separately', () => {
    const report = compareExports(
      xml({ sku: 'A', price2: '7', warehouses: allWh() }, { sku: 'B', price2: '5', warehouses: allWh() }, { sku: 'C', price2: '0', warehouses: allWh() }),
      xml({ sku: 'A', price2: '7.50', warehouses: allWh() }, { sku: 'B', price2: '0', warehouses: allWh() }, { sku: 'C', price2: '3', warehouses: allWh() }),
    )
    expect(report.prices.price2.map(d => d.sku)).toEqual(['A', 'B', 'C'])
    expect(report.prices.price1).toEqual([])
    expect(report.price2Zero.becameZero).toEqual(['B'])
    expect(report.price2Zero.becameNonZero).toEqual(['C'])
    expect(report.verdict).toBe('REVIEW')
  })

  it('treats equal values with different formatting as a format change, not a price change', () => {
    const report = compareExports(xml({ sku: 'A', price1: '9', warehouses: allWh() }), xml({ sku: 'A', price1: '9.00', warehouses: allWh() }))
    expect(report.prices.price1).toEqual([])
    expect(report.formatChanges).toEqual([{ sku: 'A', field: 'price1', old: '9', new: '9.00' }])
    expect(report.verdict).toBe('REVIEW')
  })

  it('reports value type changes (e.g. comma decimals)', () => {
    const report = compareExports(xml({ sku: 'A', price2: '7.5', warehouses: allWh() }), xml({ sku: 'A', price2: '7,5', warehouses: allWh() }))
    expect(report.kindChanges['price2: decimal → invalid']).toBe(1)
    expect(report.verdict).toBe('FAIL') // NEW price is unparseable → structural failure
  })

  it('separates Pro warehouse stock differences from non-Pro warehouses', () => {
    const report = compareExports(
      xml({ sku: 'A', warehouses: allWh() }),
      xml({ sku: 'A', warehouses: allWh({ '2': '5', '4': '9' }) }),
    )
    expect(report.stock.proWarehouses['10001']).toEqual([{ sku: 'A', old: '1', new: '5' }])
    expect(report.stock.proWarehouses['10000']).toEqual([])
    expect(report.stock.otherWarehousesChanged).toBe(1)
    expect(report.stock.sellableStock).toEqual([{ sku: 'A', old: '4', new: '8' }])
  })

  it('fails when required elements are missing from NEW and lists structure changes', () => {
    const report = compareExports(
      xml({ sku: 'A', warehouses: allWh() }),
      xml({ sku: 'A', omit: ['price2', 'quantity'], warehouses: allWh() }),
    )
    expect(report.fields.onlyInOld).toEqual(['price2', 'quantity'])
    expect(report.fields.requiredMissingInNew).toEqual({ price2: 1, quantity: 1 })
    expect(report.verdict).toBe('FAIL')
  })

  it('reports duplicate SKUs in NEW and fails on malformed NEW XML', () => {
    const dup = compareExports(xml({ sku: 'A', warehouses: allWh() }), xml({ sku: 'A', warehouses: allWh() }, { sku: 'A', warehouses: allWh() }))
    expect(dup.new.duplicateSkus).toEqual(['A'])
    expect(dup.verdict).toBe('FAIL')
    const broken = compareExports(sampleXml, '<root><item>')
    expect(broken.verdict).toBe('FAIL')
    expect(broken.failures[0]).toMatch(/^NEW XML invalid/u)
  })

  it('summary keeps only counts and small samples', () => {
    const old = xml(...Array.from({ length: 30 }, (_, i) => ({ sku: `S${i}`, warehouses: allWh() })))
    const next = xml(...Array.from({ length: 30 }, (_, i) => ({ sku: `S${i}`, price2: '9', warehouses: allWh() })))
    const summary = summarizeComparison(compareExports(old, next))
    expect(summary.prices.price2.count).toBe(30)
    expect(summary.prices.price2.sample).toHaveLength(10)
  })
})

describe('Hairshop Pro export manifest', () => {
  const exportXml = xml({ sku: '0021P', warehouses: allWh({ '9': '0' }) }, { sku: 'A1' })
  const now = new Date('2026-10-06T08:00:00Z')
  const manifest = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    schemaVersion: 1, generatedAt: '2026-10-05T17:00:00Z', xmlSha256: sha256(exportXml),
    xmlSizeBytes: Buffer.byteLength(exportXml, 'utf-8'), productCount: 2, warehousePolicy: '10000-10007',
    exporterVersion: '1.0.0', ...overrides,
  })

  it('passes for the matching, fresh export', () => {
    const result = verifyExportManifest(exportXml, manifest(), now)
    expect(result.verdict).toBe('PASS')
    expect(result.ageHours).toBe(15)
  })

  it('fails when the export was not regenerated (stale): yesterday file downloaded again', () => {
    const result = verifyExportManifest(exportXml, manifest({ generatedAt: '2026-10-04T17:00:00Z' }), now)
    expect(result.verdict).toBe('FAIL')
    expect(result.failures.join()).toMatch(/stale/u)
  })

  it('fails when export.xml and manifest belong to different runs', () => {
    const result = verifyExportManifest(exportXml, manifest({ xmlSha256: 'f'.repeat(64), productCount: 3 }), now)
    expect(result.failures).toEqual(expect.arrayContaining([
      'manifest xmlSha256 does not match the downloaded export.xml',
      'manifest productCount 3 != 2 items in export.xml',
    ]))
  })

  it('rejects non-UTC timestamps, future timestamps, wrong policy and invalid JSON', () => {
    expect(verifyExportManifest(exportXml, manifest({ generatedAt: '2026-10-05T20:00:00+03:00' }), now).verdict).toBe('FAIL')
    expect(verifyExportManifest(exportXml, manifest({ generatedAt: '2026-10-06T09:00:00Z' }), now).failures).toContain('manifest generatedAt is in the future')
    expect(verifyExportManifest(exportXml, manifest({ warehousePolicy: 'all' }), now).verdict).toBe('FAIL')
    expect(verifyExportManifest(exportXml, '{', now).failures).toEqual(['manifest is not valid JSON'])
  })

  it('locates the manifest next to the export and parses the CLI option', () => {
    expect(manifestPathFor('export.xml')).toBe('export.manifest.json')
    expect(manifestPathFor('/pro/feed/export.xml')).toBe('/pro/feed/export.manifest.json')
    expect(parseManifestOption(['--source', 'candidate', '--manifest'])).toEqual({ kind: 'remote' })
    expect(parseManifestOption(['--file', 'a.xml', '--manifest-file', 'm.json'])).toEqual({ kind: 'file', path: 'm.json' })
    expect(parseManifestOption(['--file', 'a.xml'])).toEqual({ kind: 'none' })
    expect(() => parseManifestOption(['--manifest-file'])).toThrow()
  })
})
