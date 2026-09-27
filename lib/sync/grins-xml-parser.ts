import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from './grins-warehouse-map'
import type { ErpProduct } from './erp-adapter'
import { getSyncRules, selectedStock, type SyncRules } from './sync-rules'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'item' || name === 'warehouse',
  // SKU must be preserved as an opaque string — never coerced to a number. Without this,
  // fast-xml-parser's default `strnum` numeric coercion mangles leading-zero SKUs (e.g.
  // "0680.11", present in export_sample.xml) into `680.11` before we ever see the value.
  // Numeric fields (price1-4, quantity, per-warehouse #text) are unaffected: they still
  // go through toNumber()/parseFloat below, which works fine on string input.
  parseTagValue: false,
  // Defense-in-depth: this parses an 8.5MB vendor-controlled file fetched over FTPS: no
  // reason to let it use XML entity expansion for anything.
  processEntities: false,
})

interface RawWarehouse {
  '@_id': string | number
  '#text'?: string | number
}

interface RawItem {
  sku: string | number
  title?: string
  price1?: string | number
  price2?: string | number
  price3?: string | number
  price4?: string | number
  quantity?: string | number
  warehouses?: { warehouse?: RawWarehouse[] }
}

interface RawRoot {
  root?: { item?: RawItem[] }
}

export interface GrinsXmlAudit {
  validXml: boolean
  validationError?: string
  itemCount: number
  uniqueSkus: number
  emptySkus: number
  duplicateSkus: string[]
  duplicateExternalIds: string[]
  whitespaceSkus: string[]
  caseCollisionGroups: string[][]
  leadingZeroSkus: string[]
  invalidPrices: Array<{ sku: string; field: string; value: string }>
  negativePrices: Array<{ sku: string; field: string; value: number }>
  invalidStocks: Array<{ sku: string; field: string; value: string }>
  negativeStocks: Array<{ sku: string; field: string; value: number }>
  warehouseIndexes: string[]
  warehouseIds: string[]
  missingWarehouseIndexes: string[]
  unexpectedWarehouseIndexes: string[]
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function auditGrinsXml(xml: string): GrinsXmlAudit {
  const validation = XMLValidator.validate(xml)
  if (validation !== true) {
    return {
      validXml: false,
      validationError: validation.err.msg,
      itemCount: 0, uniqueSkus: 0, emptySkus: 0,
      duplicateSkus: [], duplicateExternalIds: [], whitespaceSkus: [], caseCollisionGroups: [], leadingZeroSkus: [],
      invalidPrices: [], negativePrices: [], invalidStocks: [], negativeStocks: [],
      warehouseIndexes: [], warehouseIds: [], missingWarehouseIndexes: [], unexpectedWarehouseIndexes: [],
    }
  }

  const parsed = parser.parse(xml) as RawRoot
  const items = parsed.root?.item ?? []
  const skuCounts = new Map<string, number>()
  const caseGroups = new Map<string, Set<string>>()
  const whitespaceSkus = new Set<string>()
  const leadingZeroSkus = new Set<string>()
  const invalidPrices: GrinsXmlAudit['invalidPrices'] = []
  const negativePrices: GrinsXmlAudit['negativePrices'] = []
  const invalidStocks: GrinsXmlAudit['invalidStocks'] = []
  const negativeStocks: GrinsXmlAudit['negativeStocks'] = []
  const warehouseIndexes = new Set<string>()
  let emptySkus = 0

  for (const item of items) {
    const rawSku = String(item.sku ?? '')
    const sku = rawSku.trim()
    if (!sku) emptySkus++
    else {
      skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
      const folded = sku.toLocaleLowerCase('en-US')
      const group = caseGroups.get(folded) ?? new Set<string>()
      group.add(sku)
      caseGroups.set(folded, group)
      if (/^0\d/u.test(sku)) leadingZeroSkus.add(sku)
    }
    if (rawSku !== sku) whitespaceSkus.add(rawSku)

    for (const field of ['price1', 'price2', 'price3', 'price4'] as const) {
      const value = numericValue(item[field])
      if (value === null) invalidPrices.push({ sku, field, value: String(item[field] ?? '') })
      else if (value < 0) negativePrices.push({ sku, field, value })
    }
    const quantity = numericValue(item.quantity)
    if (quantity === null) invalidStocks.push({ sku, field: 'quantity', value: String(item.quantity ?? '') })
    else if (quantity < 0) negativeStocks.push({ sku, field: 'quantity', value: quantity })

    for (const warehouse of item.warehouses?.warehouse ?? []) {
      const index = String(warehouse['@_id'] ?? '').trim()
      warehouseIndexes.add(index)
      const value = numericValue(warehouse['#text'])
      if (value === null) invalidStocks.push({ sku, field: `warehouse:${index}`, value: String(warehouse['#text'] ?? '') })
      else if (value < 0) negativeStocks.push({ sku, field: `warehouse:${index}`, value })
    }
  }

  const expectedIndexes = GRINS_WAREHOUSE_INDEX_TO_ID.map((_, index) => String(index + 1))
  const duplicateSkus = [...skuCounts.entries()].filter(([, count]) => count > 1).map(([sku]) => sku).sort()
  const foundIndexes = [...warehouseIndexes].sort((a, b) => Number(a) - Number(b))
  return {
    validXml: true,
    itemCount: items.length,
    uniqueSkus: skuCounts.size,
    emptySkus,
    duplicateSkus,
    duplicateExternalIds: duplicateSkus,
    whitespaceSkus: [...whitespaceSkus].sort(),
    caseCollisionGroups: [...caseGroups.values()].filter(group => group.size > 1).map(group => [...group].sort()),
    leadingZeroSkus: [...leadingZeroSkus].sort(),
    invalidPrices,
    negativePrices,
    invalidStocks,
    negativeStocks,
    warehouseIndexes: foundIndexes,
    warehouseIds: foundIndexes.map(index => GRINS_WAREHOUSE_INDEX_TO_ID[Number(index) - 1]).filter((id): id is string => Boolean(id)),
    missingWarehouseIndexes: expectedIndexes.filter(index => !warehouseIndexes.has(index)),
    unexpectedWarehouseIndexes: foundIndexes.filter(index => !expectedIndexes.includes(index)),
  }
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

export function parseGrinsXml(xml: string, rules: SyncRules = getSyncRules()): ErpProduct[] {
  const parsed = parser.parse(xml) as RawRoot
  const items = parsed.root?.item ?? []

  return items.map((item): ErpProduct => {
    const sku = String(item.sku ?? '').trim()

    const warehouseQuantities: Record<string, number> = {}
    const rawWarehouses = item.warehouses?.warehouse ?? []
    for (const w of rawWarehouses) {
      const idx = parseInt(String(w['@_id']), 10)
      const realId = GRINS_WAREHOUSE_INDEX_TO_ID[idx - 1]
      if (realId) warehouseQuantities[realId] = toNumber(w['#text'])
    }

    const price1 = toNumber(item.price1)
    const price2 = toNumber(item.price2)
    const price3 = toNumber(item.price3)
    const price4 = toNumber(item.price4)

    return {
      externalId: sku,
      sku,
      // Feed title is a nopCommerce search-index mashup of brand + LV + EN, never a
      // display name (confirmed 2026-07-23) — seed brand-new pending rows with the
      // SKU itself instead, admin fills in the real title before publishing.
      title: sku,
      price: { price1, price2, price3, price4 }[rules.primaryPriceTier],
      stock: selectedStock(warehouseQuantities),
      prices: { price1, price2, price3, price4 },
      warehouseQuantities,
    }
  })
}
