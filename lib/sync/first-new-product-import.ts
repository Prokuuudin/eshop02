/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { createHash } from 'node:crypto'
import { selectedStock } from './sync-rules'

export const FIRST_IMPORT_XML_SHA = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const FIRST_IMPORT_BASELINE = {
  productCount: 6378, externalIdCount: 3580, unlinkedCount: 2798,
  active: 2229, inactive: 4149, syncRunCount: 8,
  fingerprint: '4d9c28b1184c337e4565beef472379b5',
} as const
export const FIRST_IMPORT_ALLOWLIST_SHA = '95426fbcc9d3bb21ef8aabfa3e6e934d147ff85ff85609a1242f42b90e941c5a'

export type ImportEntry = {
  plannedProductId: string
  xmlSku: string
  externalId: string
  barcode: string | null
  sourceName: string
  productTitle: string
  price2: string
  allowedStock: number
  warehouseQuantities: Record<string, number>
  prices: { price1: string; price2: string; price3: string; price4: string }
  imageReferences: string[]
  brand: ''
  category: 'uncategorized'
  titleEn: null
  titleLv: null
  description: null
  isActive: false
  classification: 'NEW_PRODUCT_HIGH_CONFIDENCE_IN_STOCK'
  identityEvidence: string[]
}
export type ImportAllowlist = {
  schemaVersion: 1
  wave: 'first-new-product-import'
  executable: true
  entryCount: number
  xmlSha256: string
  baseline: typeof FIRST_IMPORT_BASELINE
  entries: ImportEntry[]
}
export type ExistingIdentity = { id: string; externalId: string | null; sku: string | null; barcode: string | null }
export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

export function assertImportBaseline(value: Record<string, unknown>): void {
  for (const [key, expected] of Object.entries(FIRST_IMPORT_BASELINE))
    if (value[key] !== expected) throw new Error(`NEW_PRODUCT_IMPORT_BASELINE_DRIFT:${JSON.stringify(value)}`)
}

export function parseImportAllowlist(content: string | Buffer, expectedSha = FIRST_IMPORT_ALLOWLIST_SHA): ImportAllowlist {
  if (expectedSha === 'TO_BE_BOUND' || sha256(content) !== expectedSha) throw new Error('NEW_PRODUCT_IMPORT_ALLOWLIST_SHA_MISMATCH')
  const value = JSON.parse(content.toString()) as ImportAllowlist
  if (!value.executable || value.wave !== 'first-new-product-import' || value.entryCount !== value.entries.length)
    throw new Error('NEW_PRODUCT_IMPORT_ALLOWLIST_METADATA_MISMATCH')
  if (value.xmlSha256 !== FIRST_IMPORT_XML_SHA || JSON.stringify(value.baseline) !== JSON.stringify(FIRST_IMPORT_BASELINE))
    throw new Error('NEW_PRODUCT_IMPORT_BINDING_MISMATCH')
  const unique = (values: string[]) => new Set(values).size === values.length
  if (!unique(value.entries.map(e => e.xmlSku)) || !unique(value.entries.map(e => e.externalId)) || !unique(value.entries.map(e => e.plannedProductId)))
    throw new Error('NEW_PRODUCT_IMPORT_DUPLICATE_ALLOWLIST_ENTRY')
  return value
}

export function validateEntry(entry: ImportEntry): void {
  if (entry.externalId !== entry.xmlSku || entry.productTitle !== entry.xmlSku) throw new Error(`IMPORT_IDENTITY_INVALID:${entry.xmlSku}`)
  if (!(Number(entry.price2) > 0)) throw new Error(`IMPORT_PRICE_INVALID:${entry.xmlSku}`)
  if (entry.allowedStock <= 0 || entry.allowedStock !== selectedStock(entry.warehouseQuantities)) throw new Error(`IMPORT_STOCK_INVALID:${entry.xmlSku}`)
  if (entry.isActive !== false || entry.brand !== '' || entry.category !== 'uncategorized') throw new Error(`IMPORT_PENDING_STATE_INVALID:${entry.xmlSku}`)
  if (entry.classification !== 'NEW_PRODUCT_HIGH_CONFIDENCE_IN_STOCK') throw new Error(`IMPORT_CLASSIFICATION_INVALID:${entry.xmlSku}`)
}

export function prepareImportPlan(allowlist: ImportAllowlist, existing: ExistingIdentity[]) {
  const externalIds = new Set(existing.flatMap(p => p.externalId ? [p.externalId] : []))
  const skus = new Set(existing.flatMap(p => p.sku ? [p.sku] : []))
  const barcodes = new Set(existing.flatMap(p => p.barcode ? [p.barcode] : []))
  let existingIdConflicts = 0, existingExternalIdConflicts = 0, existingSkuConflicts = 0, barcodeConflicts = 0, invalidRequiredFields = 0, alreadyImported = 0
  const insertable: ImportEntry[] = []
  for (const entry of allowlist.entries) {
    try { validateEntry(entry) } catch { invalidRequiredFields++; continue }
    const exact = existing.find(p => p.id === entry.plannedProductId && p.externalId === entry.externalId && p.sku === entry.xmlSku && p.barcode === entry.barcode)
    if (exact) { alreadyImported++; continue }
    const idConflict = existing.some(p => p.id === entry.plannedProductId), externalConflict = externalIds.has(entry.externalId), skuConflict = skus.has(entry.xmlSku), barcodeConflict = Boolean(entry.barcode && barcodes.has(entry.barcode))
    if (idConflict) existingIdConflicts++
    if (externalConflict) existingExternalIdConflicts++
    if (skuConflict) existingSkuConflicts++
    if (barcodeConflict) barcodeConflicts++
    if (!idConflict && !externalConflict && !skuConflict && !barcodeConflict) insertable.push(entry)
  }
  const conflicts = existingIdConflicts + existingExternalIdConflicts + existingSkuConflicts + barcodeConflicts + invalidRequiredFields
  return {
    insertable,
    metrics: {
      candidates: allowlist.entries.length, wouldInsert: insertable.length, alreadyImported, conflicts, skipped: allowlist.entries.length - insertable.length - alreadyImported,
      existingIdConflicts, existingExternalIdConflicts, existingSkuConflicts, barcodeConflicts, hiddenDuplicateConflicts: 0,
      invalidRequiredFields, invalidPrices: 0, invalidStocks: 0,
      brandUnresolved: allowlist.entries.filter(e => !e.brand).length,
      categoryUnresolved: allowlist.entries.filter(e => e.category === 'uncategorized').length,
      contentIncomplete: allowlist.entries.filter(e => !e.description || !e.titleEn || !e.titleLv).length,
      imageMissing: allowlist.entries.filter(e => e.imageReferences.length === 0).length,
      imageInvalid: 0, predictedErpRecords: insertable.length, predictedProductInserts: insertable.length,
      updates: 0, deactivations: 0, databaseWrites: 0,
    },
  }
}
