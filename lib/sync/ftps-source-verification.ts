// Read-only verification and comparison of GrinS export.xml sources during the
// FTPS source migration (old Hairshop.lv-fed FTPS → independent Hairshop Pro FTPS).
// Never touches the database. Contract checks reuse the production parser and the
// scheduled-sync structural checks so a "PASS" here means the same thing there.
import { createHash } from 'crypto'
import type { FtpsConfig, FtpsDownload } from './ftps-client'
import { GRINS_WAREHOUSE_INDEX_TO_ID, grinsWarehouseIdForIndex } from './grins-warehouse-map'
import { auditGrinsXml, parseGrinsXml, readGrinsXmlItems, type GrinsRawItem, type GrinsXmlAudit } from './grins-xml-parser'
import { PREFLIGHT_THRESHOLDS, structuralFailures } from './sync-preflight'
import { HAIRSHOP_STOCK_WAREHOUSE_IDS } from './sync-rules'

const PRICE_FIELDS = ['price1', 'price2', 'price3', 'price4'] as const
/** Elements Hairshop Pro reads from every <item>. */
export const REQUIRED_ITEM_FIELDS = ['sku', ...PRICE_FIELDS, 'quantity', 'warehouses'] as const
/** XML warehouse indexes ("1".."9") whose stock Hairshop Pro sells from (10000, 10001, 10002, 10005). */
export const PRO_WAREHOUSE_INDEXES: readonly string[] = GRINS_WAREHOUSE_INDEX_TO_ID
  .map((id, i) => (id !== null && (HAIRSHOP_STOCK_WAREHOUSE_IDS as readonly string[]).includes(id) ? String(i + 1) : null))
  .filter((index): index is string => index !== null)

const SAMPLE = 10
const sample = <T>(values: T[]) => values.slice(0, SAMPLE)

export const sha256 = (content: string): string => createHash('sha256').update(content, 'utf-8').digest('hex')

type ValueKind = 'integer' | 'decimal' | 'empty' | 'invalid'

function rawText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

/** Decimal text → canonical string ("7.00" → "7", "-0" → "0"); null when not a plain decimal. No float math. */
export function canonicalDecimal(value: unknown): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(rawText(value))
  if (!match) return null
  const [, sign, whole, fraction = ''] = match
  const int = whole.replace(/^0+(?=\d)/u, '')
  const frac = fraction.replace(/0+$/u, '')
  const body = frac ? `${int}.${frac}` : int
  return sign && body !== '0' ? `-${body}` : body
}

function valueKind(value: unknown): ValueKind {
  const text = rawText(value)
  if (!text) return 'empty'
  if (/^-?\d+$/u.test(text)) return 'integer'
  if (/^-?\d+\.\d+$/u.test(text)) return 'decimal'
  return 'invalid'
}

function warehouseMap(item: GrinsRawItem): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const w of item.warehouses?.warehouse ?? []) map.set(rawText(w['@_id']), w['#text'])
  return map
}

// ─── Single-source verification ─────────────────────────────────────────────

export interface ExportVerification {
  verdict: 'PASS' | 'FAIL'
  failures: string[]
  warnings: string[]
  summary: {
    sizeBytes: number
    sha256: string
    validXml: boolean
    validationError?: string
    itemCount: number
    uniqueSkus: number
    emptySkus: number
    duplicateSkus: number
    duplicateSkuSample: string[]
    leadingZeroSkus: number
    leadingZeroSkuSample: string[]
    invalidPrices: number
    invalidPriceSample: GrinsXmlAudit['invalidPrices']
    negativePrices: number
    invalidStocks: number
    invalidStockSample: GrinsXmlAudit['invalidStocks']
    negativeStocks: number
    warehouseIndexes: string[]
    warehouseIds: string[]
    missingWarehouseIndexes: string[]
    unexpectedWarehouseIndexes: string[]
    itemsMissingField: Record<string, number>
    itemsMissingProWarehouse: number
    itemsMissingProWarehouseSample: string[]
    price2Zero: number
    price2ZeroRatio: number
  }
}

export function verifyExport(xml: string, options: { minRows?: number } = {}): ExportVerification {
  const minRows = options.minRows ?? PREFLIGHT_THRESHOLDS.feedMinRows
  const audit = auditGrinsXml(xml)
  const items = audit.validXml ? readGrinsXmlItems(xml) : []
  const itemsMissingField: Record<string, number> = Object.fromEntries(REQUIRED_ITEM_FIELDS.map(field => [field, 0]))
  const missingPro: string[] = []
  let price2Zero = 0

  for (const item of items) {
    for (const field of REQUIRED_ITEM_FIELDS) if (item[field] === undefined) itemsMissingField[field]++
    const warehouses = warehouseMap(item)
    if (PRO_WAREHOUSE_INDEXES.some(index => !warehouses.has(index))) missingPro.push(rawText(item.sku))
    const price2 = canonicalDecimal(item.price2)
    if (price2 === '0' || price2?.startsWith('-')) price2Zero++
  }

  const failures = structuralFailures(audit)
  if (audit.validXml && audit.itemCount > 0 && audit.itemCount < minRows) failures.push(`feed has ${audit.itemCount} rows (< minimum ${minRows})`)
  for (const [field, count] of Object.entries(itemsMissingField)) {
    if (count > 0) failures.push(`${count} items have no <${field}> element`)
  }
  if (missingPro.length > 0) failures.push(`${missingPro.length} items lack a Hairshop Pro warehouse (${PRO_WAREHOUSE_INDEXES.join(', ')})`)

  const price2ZeroRatio = items.length ? price2Zero / items.length : 0
  const warnings: string[] = []
  if (audit.negativePrices.length) warnings.push(`${audit.negativePrices.length} negative price values`)
  if (audit.negativeStocks.length) warnings.push(`${audit.negativeStocks.length} negative stock values`)
  if (audit.caseCollisionGroups.length) warnings.push(`${audit.caseCollisionGroups.length} case-only SKU collision groups`)
  if (audit.whitespaceSkus.length) warnings.push(`${audit.whitespaceSkus.length} SKUs contain surrounding whitespace (parser trims them)`)
  if (price2ZeroRatio > PREFLIGHT_THRESHOLDS.priceZeroHard) failures.push(`price2=0 for ${(price2ZeroRatio * 100).toFixed(2)}% of rows (scheduled preflight HARD limit ${PREFLIGHT_THRESHOLDS.priceZeroHard * 100}%)`)
  else if (price2ZeroRatio > PREFLIGHT_THRESHOLDS.priceZeroWarn) warnings.push(`price2=0 for ${(price2ZeroRatio * 100).toFixed(2)}% of rows`)

  return {
    verdict: failures.length ? 'FAIL' : 'PASS',
    failures,
    warnings,
    summary: {
      sizeBytes: Buffer.byteLength(xml, 'utf-8'),
      sha256: sha256(xml),
      validXml: audit.validXml,
      ...(audit.validationError && { validationError: audit.validationError }),
      itemCount: audit.itemCount,
      uniqueSkus: audit.uniqueSkus,
      emptySkus: audit.emptySkus,
      duplicateSkus: audit.duplicateSkus.length,
      duplicateSkuSample: sample(audit.duplicateSkus),
      leadingZeroSkus: audit.leadingZeroSkus.length,
      leadingZeroSkuSample: sample(audit.leadingZeroSkus),
      invalidPrices: audit.invalidPrices.length,
      invalidPriceSample: sample(audit.invalidPrices),
      negativePrices: audit.negativePrices.length,
      invalidStocks: audit.invalidStocks.length,
      invalidStockSample: sample(audit.invalidStocks),
      negativeStocks: audit.negativeStocks.length,
      warehouseIndexes: audit.warehouseIndexes,
      warehouseIds: audit.warehouseIds,
      missingWarehouseIndexes: audit.missingWarehouseIndexes,
      unexpectedWarehouseIndexes: audit.unexpectedWarehouseIndexes,
      itemsMissingField,
      itemsMissingProWarehouse: missingPro.length,
      itemsMissingProWarehouseSample: sample(missingPro),
      price2Zero,
      price2ZeroRatio,
    },
  }
}

// ─── Hairshop Pro exporter manifest (freshness) ──────────────────────────────

/** Default name the Hairshop Pro exporter publishes next to export.xml (tools/grins-pro-exporter). */
export const EXPORT_MANIFEST_NAME = 'export.manifest.json'
const MANIFEST_MAX_AGE_HOURS = 36
const MANIFEST_FUTURE_TOLERANCE_MS = 10 * 60_000

export interface ManifestVerification {
  verdict: 'PASS' | 'FAIL'
  failures: string[]
  generatedAt?: string
  ageHours?: number
  productCount?: number
  xmlSha256?: string
  exporterVersion?: string
  warehousePolicy?: string
}

/** Manifest path next to the export: "dir/export.xml" → "dir/export.manifest.json". */
export function manifestPathFor(remotePath: string): string {
  const slash = remotePath.lastIndexOf('/')
  return slash < 0 ? EXPORT_MANIFEST_NAME : `${remotePath.slice(0, slash + 1)}${EXPORT_MANIFEST_NAME}`
}

/**
 * Proves the downloaded export.xml is the one the exporter last published (SHA + size + count)
 * and that it is fresh (generatedAt within maxAgeHours). A stale or mismatching manifest means
 * "yesterday's file downloaded again" or "manifest step failed" — never treat that as new data.
 */
export function verifyExportManifest(xml: string, manifestText: string, now: Date, options: { maxAgeHours?: number } = {}): ManifestVerification {
  const maxAgeHours = options.maxAgeHours ?? MANIFEST_MAX_AGE_HOURS
  const failures: string[] = []
  let m: Record<string, unknown>
  try {
    m = JSON.parse(manifestText) as Record<string, unknown>
  } catch {
    return { verdict: 'FAIL', failures: ['manifest is not valid JSON'] }
  }
  if (m.schemaVersion !== 1) failures.push(`unsupported manifest schemaVersion ${String(m.schemaVersion)}`)
  if (m.xmlSha256 !== sha256(xml)) failures.push('manifest xmlSha256 does not match the downloaded export.xml')
  if (m.xmlSizeBytes !== Buffer.byteLength(xml, 'utf-8')) failures.push('manifest xmlSizeBytes does not match the downloaded export.xml')
  const items = readGrinsXmlItems(xml).length
  if (m.productCount !== items) failures.push(`manifest productCount ${String(m.productCount)} != ${items} items in export.xml`)
  if (m.warehousePolicy !== '10000-10007') failures.push(`unexpected warehousePolicy ${String(m.warehousePolicy)}`)
  const generatedAt = typeof m.generatedAt === 'string' && /Z$/u.test(m.generatedAt) ? new Date(m.generatedAt) : null
  let ageHours: number | undefined
  if (!generatedAt || Number.isNaN(generatedAt.getTime())) failures.push('manifest generatedAt is missing or not a UTC ISO timestamp')
  else {
    ageHours = (now.getTime() - generatedAt.getTime()) / 3_600_000
    if (generatedAt.getTime() - now.getTime() > MANIFEST_FUTURE_TOLERANCE_MS) failures.push('manifest generatedAt is in the future')
    else if (ageHours > maxAgeHours) failures.push(`export is stale: generated ${ageHours.toFixed(1)} h ago (> ${maxAgeHours} h)`)
  }
  return {
    verdict: failures.length ? 'FAIL' : 'PASS',
    failures,
    generatedAt: typeof m.generatedAt === 'string' ? m.generatedAt : undefined,
    ...(ageHours !== undefined && { ageHours: Math.round(ageHours * 100) / 100 }),
    productCount: typeof m.productCount === 'number' ? m.productCount : undefined,
    xmlSha256: typeof m.xmlSha256 === 'string' ? m.xmlSha256 : undefined,
    exporterVersion: typeof m.exporterVersion === 'string' ? m.exporterVersion : undefined,
    warehousePolicy: typeof m.warehousePolicy === 'string' ? m.warehousePolicy : undefined,
  }
}

/** `--manifest` (download export.manifest.json next to the FTPS export) or `--manifest-file <path>`. */
export function parseManifestOption(argv: string[]): { kind: 'none' } | { kind: 'remote' } | { kind: 'file'; path: string } {
  const i = argv.indexOf('--manifest-file')
  if (i >= 0) {
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) throw new Error('--manifest-file requires a value')
    return { kind: 'file', path: v }
  }
  return argv.includes('--manifest') ? { kind: 'remote' } : { kind: 'none' }
}

// ─── FTPS source check (connection + download + verification) ────────────────

export interface SourceCheckResult {
  connection: { ok: boolean; host: string; port: number; remotePath: string; error?: string; tls?: FtpsDownload['tls']; modifiedAt?: string; remoteSizeBytes?: number }
  /** Downloaded content; absent when the connection/download failed. */
  content?: string
  verification?: ExportVerification
}

export async function checkFtpsSource(
  config: FtpsConfig,
  download: (config: FtpsConfig) => Promise<FtpsDownload>,
  options: { minRows?: number } = {},
): Promise<SourceCheckResult> {
  const target = { host: config.host, port: config.port ?? 21, remotePath: config.remotePath }
  let result: FtpsDownload
  try {
    result = await download(config)
  } catch (err) {
    return { connection: { ok: false, ...target, error: err instanceof Error ? err.message : String(err) } }
  }
  return {
    connection: { ok: true, ...target, tls: result.tls, modifiedAt: result.modifiedAt, remoteSizeBytes: result.remoteSizeBytes },
    content: result.content,
    verification: verifyExport(result.content, options),
  }
}

/** Primary and candidate must be different sources; identical host+path+user means the migration env is wrong. */
export function sameSourceWarning(primary: FtpsConfig | null, candidate: FtpsConfig): string | null {
  if (!primary) return null
  const same = primary.host.toLowerCase() === candidate.host.toLowerCase()
    && (primary.port ?? 21) === (candidate.port ?? 21)
    && primary.remotePath === candidate.remotePath
    && primary.user === candidate.user
  return same ? 'candidate FTPS points to the same host/port/path/user as the primary (production) source' : null
}

// ─── OLD vs NEW comparison ───────────────────────────────────────────────────

interface ValueDiff { sku: string; old: string; new: string }
interface FormatChange { sku: string; field: string; old: string; new: string }

export interface ExportComparison {
  verdict: 'PASS' | 'REVIEW' | 'FAIL'
  failures: string[]
  reviewReasons: string[]
  old: { sha256: string; sizeBytes: number; itemCount: number; uniqueSkus: number; duplicateSkus: string[]; leadingZeroSkus: number; price2Zero: number }
  new: { sha256: string; sizeBytes: number; itemCount: number; uniqueSkus: number; duplicateSkus: string[]; leadingZeroSkus: number; price2Zero: number }
  skus: {
    common: number
    onlyInOld: string[]
    onlyInNew: string[]
    /** OLD "0680.11" absent from NEW while "680.11" is present — leading zeros lost. */
    leadingZeroLost: Array<{ old: string; new: string }>
    /** Only the letter case differs between OLD and NEW. */
    caseChanged: Array<{ old: string; new: string }>
  }
  fields: {
    presence: Record<string, { old: number; new: number }>
    onlyInOld: string[]
    onlyInNew: string[]
    requiredMissingInNew: Record<string, number>
  }
  prices: Record<(typeof PRICE_FIELDS)[number], ValueDiff[]>
  price2Zero: { becameZero: string[]; becameNonZero: string[]; zeroInBoth: number }
  stock: {
    proWarehouses: Record<string, ValueDiff[]>
    otherWarehousesChanged: number
    /** Product.stock as production computes it (sum of Pro warehouses). */
    sellableStock: ValueDiff[]
  }
  formatChanges: FormatChange[]
  kindChanges: Record<string, number>
}

function index(items: GrinsRawItem[]): { bySku: Map<string, GrinsRawItem>; duplicates: string[] } {
  const bySku = new Map<string, GrinsRawItem>()
  const duplicates = new Set<string>()
  for (const item of items) {
    const sku = rawText(item.sku)
    if (!sku) continue
    if (bySku.has(sku)) duplicates.add(sku)
    else bySku.set(sku, item)
  }
  return { bySku, duplicates: [...duplicates].sort() }
}

function fieldPresence(items: GrinsRawItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) for (const key of Object.keys(item)) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}

export function compareExports(oldXml: string, newXml: string, options: { maxMissingRatio?: number } = {}): ExportComparison {
  const maxMissingRatio = options.maxMissingRatio ?? 1 - PREFLIGHT_THRESHOLDS.feedMinRatio
  const failures: string[] = []
  const oldAudit = auditGrinsXml(oldXml)
  const newAudit = auditGrinsXml(newXml)
  if (!oldAudit.validXml) failures.push(`OLD XML invalid: ${oldAudit.validationError}`)
  if (!newAudit.validXml) failures.push(`NEW XML invalid: ${newAudit.validationError}`)
  const oldItems = oldAudit.validXml ? readGrinsXmlItems(oldXml) : []
  const newItems = newAudit.validXml ? readGrinsXmlItems(newXml) : []
  const oldIdx = index(oldItems)
  const newIdx = index(newItems)

  // Effective Product.price / Product.stock exactly as the production parser computes them.
  const oldStock = new Map(oldAudit.validXml ? parseGrinsXml(oldXml).map(p => [p.externalId, p.stock]) : [])
  const newStock = new Map(newAudit.validXml ? parseGrinsXml(newXml).map(p => [p.externalId, p.stock]) : [])

  const onlyInOld = [...oldIdx.bySku.keys()].filter(sku => !newIdx.bySku.has(sku)).sort()
  const onlyInNew = [...newIdx.bySku.keys()].filter(sku => !oldIdx.bySku.has(sku)).sort()
  const onlyNewSet = new Set(onlyInNew)
  const onlyNewByLower = new Map(onlyInNew.map(sku => [sku.toLocaleLowerCase('en-US'), sku]))
  const leadingZeroLost = onlyInOld
    .filter(sku => /^0/u.test(sku) && onlyNewSet.has(sku.replace(/^0+/u, '')))
    .map(sku => ({ old: sku, new: sku.replace(/^0+/u, '') }))
  const caseChanged = onlyInOld
    .filter(sku => onlyNewByLower.has(sku.toLocaleLowerCase('en-US')))
    .map(sku => ({ old: sku, new: onlyNewByLower.get(sku.toLocaleLowerCase('en-US'))! }))

  const oldFields = fieldPresence(oldItems)
  const newFields = fieldPresence(newItems)
  const presence: Record<string, { old: number; new: number }> = {}
  for (const field of new Set([...oldFields.keys(), ...newFields.keys()])) presence[field] = { old: oldFields.get(field) ?? 0, new: newFields.get(field) ?? 0 }
  const requiredMissingInNew: Record<string, number> = {}
  for (const field of REQUIRED_ITEM_FIELDS) {
    const missing = newItems.length - (newFields.get(field) ?? 0)
    if (missing > 0) requiredMissingInNew[field] = missing
  }

  const prices = Object.fromEntries(PRICE_FIELDS.map(field => [field, [] as ValueDiff[]])) as ExportComparison['prices']
  const proWarehouses: Record<string, ValueDiff[]> = Object.fromEntries(PRO_WAREHOUSE_INDEXES.map(i => [String(grinsWarehouseIdForIndex(Number(i))), [] as ValueDiff[]]))
  const sellableStock: ValueDiff[] = []
  const formatChanges: FormatChange[] = []
  const kindChanges: Record<string, number> = {}
  const becameZero: string[] = []
  const becameNonZero: string[] = []
  let zeroInBoth = 0
  let otherWarehousesChanged = 0
  let common = 0

  const compareField = (sku: string, field: string, oldRaw: unknown, newRaw: unknown): boolean => {
    const oldText = rawText(oldRaw), newText = rawText(newRaw)
    const oldKind = valueKind(oldRaw), newKind = valueKind(newRaw)
    if (oldKind !== newKind && !(oldKind === 'integer' && newKind === 'decimal') && !(oldKind === 'decimal' && newKind === 'integer')) {
      const key = `${field}: ${oldKind} → ${newKind}`
      kindChanges[key] = (kindChanges[key] ?? 0) + 1
    }
    const oldValue = canonicalDecimal(oldRaw), newValue = canonicalDecimal(newRaw)
    if (oldValue !== null && oldValue === newValue) {
      if (oldText !== newText) formatChanges.push({ sku, field, old: oldText, new: newText })
      return false
    }
    return oldText !== newText
  }

  for (const [sku, oldItem] of oldIdx.bySku) {
    const newItem = newIdx.bySku.get(sku)
    if (!newItem) continue
    common++
    for (const field of PRICE_FIELDS) {
      if (compareField(sku, field, oldItem[field], newItem[field])) prices[field].push({ sku, old: rawText(oldItem[field]), new: rawText(newItem[field]) })
    }
    const oldZero = canonicalDecimal(oldItem.price2) === '0', newZero = canonicalDecimal(newItem.price2) === '0'
    if (oldZero && newZero) zeroInBoth++
    else if (newZero) becameZero.push(sku)
    else if (oldZero) becameNonZero.push(sku)

    compareField(sku, 'quantity', oldItem.quantity, newItem.quantity)
    const oldWh = warehouseMap(oldItem), newWh = warehouseMap(newItem)
    for (const i of new Set([...oldWh.keys(), ...newWh.keys()])) {
      if (!compareField(sku, `warehouse:${i}`, oldWh.get(i), newWh.get(i))) continue
      if (PRO_WAREHOUSE_INDEXES.includes(i)) proWarehouses[String(grinsWarehouseIdForIndex(Number(i)))].push({ sku, old: rawText(oldWh.get(i)), new: rawText(newWh.get(i)) })
      else otherWarehousesChanged++
    }
    const before = oldStock.get(sku), after = newStock.get(sku)
    if (before !== after) sellableStock.push({ sku, old: String(before), new: String(after) })
  }

  const fieldsOnlyInOld = [...oldFields.keys()].filter(f => !newFields.has(f)).sort()
  const fieldsOnlyInNew = [...newFields.keys()].filter(f => !oldFields.has(f)).sort()

  if (newAudit.validXml) failures.push(...structuralFailures(newAudit).map(f => `NEW: ${f}`))
  for (const [field, count] of Object.entries(requiredMissingInNew)) failures.push(`NEW: ${count} items have no <${field}>`)
  if (leadingZeroLost.length) failures.push(`${leadingZeroLost.length} SKUs lost leading zeros in NEW`)
  const missingRatio = oldIdx.bySku.size ? onlyInOld.length / oldIdx.bySku.size : 0
  if (missingRatio > maxMissingRatio) failures.push(`${onlyInOld.length} OLD SKUs (${(missingRatio * 100).toFixed(2)}%) are missing from NEW (> ${(maxMissingRatio * 100).toFixed(0)}%)`)

  const reviewReasons: string[] = []
  if (onlyInOld.length) reviewReasons.push(`${onlyInOld.length} SKUs only in OLD`)
  if (onlyInNew.length) reviewReasons.push(`${onlyInNew.length} SKUs only in NEW`)
  if (caseChanged.length) reviewReasons.push(`${caseChanged.length} SKUs differ only by case`)
  if (newIdx.duplicates.length) reviewReasons.push(`${newIdx.duplicates.length} duplicate SKUs in NEW`)
  if (fieldsOnlyInOld.length) reviewReasons.push(`elements missing from NEW: ${fieldsOnlyInOld.join(', ')}`)
  if (fieldsOnlyInNew.length) reviewReasons.push(`new elements in NEW: ${fieldsOnlyInNew.join(', ')}`)
  for (const field of PRICE_FIELDS) if (prices[field].length) reviewReasons.push(`${prices[field].length} ${field} differences`)
  if (becameZero.length) reviewReasons.push(`${becameZero.length} SKUs have price2=0 only in NEW`)
  if (becameNonZero.length) reviewReasons.push(`${becameNonZero.length} SKUs have price2=0 only in OLD`)
  for (const [id, diffs] of Object.entries(proWarehouses)) if (diffs.length) reviewReasons.push(`${diffs.length} stock differences in Pro warehouse ${id}`)
  if (sellableStock.length) reviewReasons.push(`${sellableStock.length} sellable stock (Product.stock) differences`)
  if (otherWarehousesChanged) reviewReasons.push(`${otherWarehousesChanged} stock differences in non-Pro warehouses (not used by Hairshop Pro)`)
  if (formatChanges.length) reviewReasons.push(`${formatChanges.length} value format changes with equal value`)
  if (Object.keys(kindChanges).length) reviewReasons.push(`value type changes: ${Object.entries(kindChanges).map(([k, n]) => `${k} ×${n}`).join('; ')}`)

  const side = (audit: GrinsXmlAudit, xml: string, items: GrinsRawItem[], duplicates: string[]) => ({
    sha256: sha256(xml),
    sizeBytes: Buffer.byteLength(xml, 'utf-8'),
    itemCount: audit.itemCount,
    uniqueSkus: audit.uniqueSkus,
    duplicateSkus: duplicates,
    leadingZeroSkus: audit.leadingZeroSkus.length,
    price2Zero: items.filter(item => canonicalDecimal(item.price2) === '0').length,
  })

  return {
    verdict: failures.length ? 'FAIL' : reviewReasons.length ? 'REVIEW' : 'PASS',
    failures,
    reviewReasons,
    old: side(oldAudit, oldXml, oldItems, oldIdx.duplicates),
    new: side(newAudit, newXml, newItems, newIdx.duplicates),
    skus: { common, onlyInOld, onlyInNew, leadingZeroLost, caseChanged },
    fields: { presence, onlyInOld: fieldsOnlyInOld, onlyInNew: fieldsOnlyInNew, requiredMissingInNew },
    prices,
    price2Zero: { becameZero, becameNonZero, zeroInBoth },
    stock: { proWarehouses, otherWarehousesChanged, sellableStock },
    formatChanges,
    kindChanges,
  }
}

/** Terminal-sized view of a comparison: counts plus a few samples per category. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function summarizeComparison(report: ExportComparison) {
  return {
    verdict: report.verdict,
    failures: report.failures,
    reviewReasons: report.reviewReasons,
    old: report.old,
    new: { ...report.new },
    skus: {
      common: report.skus.common,
      onlyInOld: report.skus.onlyInOld.length,
      onlyInOldSample: sample(report.skus.onlyInOld),
      onlyInNew: report.skus.onlyInNew.length,
      onlyInNewSample: sample(report.skus.onlyInNew),
      leadingZeroLost: sample(report.skus.leadingZeroLost),
      caseChanged: sample(report.skus.caseChanged),
    },
    fields: { onlyInOld: report.fields.onlyInOld, onlyInNew: report.fields.onlyInNew, requiredMissingInNew: report.fields.requiredMissingInNew },
    prices: Object.fromEntries(Object.entries(report.prices).map(([field, diffs]) => [field, { count: diffs.length, sample: sample(diffs) }])),
    price2Zero: { becameZero: report.price2Zero.becameZero.length, becameZeroSample: sample(report.price2Zero.becameZero), becameNonZero: report.price2Zero.becameNonZero.length, becameNonZeroSample: sample(report.price2Zero.becameNonZero), zeroInBoth: report.price2Zero.zeroInBoth },
    stock: {
      proWarehouses: Object.fromEntries(Object.entries(report.stock.proWarehouses).map(([id, diffs]) => [id, { count: diffs.length, sample: sample(diffs) }])),
      sellableStock: { count: report.stock.sellableStock.length, sample: sample(report.stock.sellableStock) },
      otherWarehousesChanged: report.stock.otherWarehousesChanged,
    },
    formatChanges: { count: report.formatChanges.length, sample: sample(report.formatChanges) },
    kindChanges: report.kindChanges,
  }
}

// ─── CLI argument handling (kept here so it is unit-tested) ──────────────────

export type VerifyTarget = { kind: 'ftps'; source: 'primary' | 'candidate' } | { kind: 'file'; path: string }

/** `--source primary|candidate` or `--file <path>`; exactly one, no implicit default. */
export function parseVerifyTarget(argv: string[]): VerifyTarget {
  const value = (name: string) => {
    const i = argv.indexOf(name)
    if (i < 0) return undefined
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) throw new Error(`${name} requires a value`)
    return v
  }
  const source = value('--source')
  const file = value('--file')
  if (source && file) throw new Error('use either --source or --file, not both')
  if (file) return { kind: 'file', path: file }
  if (source === 'primary' || source === 'candidate') return { kind: 'ftps', source }
  if (source) throw new Error(`--source must be "primary" or "candidate", got "${source}"`)
  throw new Error('specify --source candidate (new FTPS), --source primary (current FTPS) or --file <export.xml>')
}
