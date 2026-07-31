import { XMLParser } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from './grins-warehouse-map'
import type { ErpProduct } from './erp-adapter'

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

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

export function parseGrinsXml(xml: string): ErpProduct[] {
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
      price: price2,
      stock: toNumber(item.quantity),
      prices: { price1, price2, price3, price4 },
      warehouseQuantities,
    }
  })
}
