import { createHash } from 'crypto'
import { XMLParser } from 'fast-xml-parser'

export const SECOND_WAVE_TOTAL = 30
export const SECOND_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const SECOND_WAVE_ALLOWLIST_SHA256 = 'e9e1671ed152334a6cd517392c9464ae858fc538165cc0a74984cc846de2ea23'
export type SecondWaveEntry = { productId: string; productSku: string; xmlSku: string; externalIdToSet: string; matchType: 'CASE_ONLY_SAFE'; evidence: Record<string, unknown> }
export type SecondWaveAllowlist = { schemaVersion: 1; wave: 'second-wave-case-only'; xmlSha256: string; entryCount: number; entries: SecondWaveEntry[] }
export type SecondWaveProduct = { id: string; sku: string | null; externalId: string | null; isDeleted: boolean }

export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')
const fold = (value: string): string => value.toLocaleLowerCase('en-US')

export function validateSecondWave(allowlistContent: string | Buffer, xml: string, products: SecondWaveProduct[]): SecondWaveAllowlist {
  if (sha256(allowlistContent) !== SECOND_WAVE_ALLOWLIST_SHA256) throw new Error('Second-wave validation failed: allowlist SHA mismatch')
  if (sha256(xml) !== SECOND_WAVE_XML_SHA256) throw new Error('Second-wave validation failed: XML SHA mismatch')
  const errors: string[] = []
  const allowlist = JSON.parse(allowlistContent.toString()) as SecondWaveAllowlist
  if (allowlist.schemaVersion !== 1 || allowlist.wave !== 'second-wave-case-only') errors.push('allowlist schema/wave mismatch')
  if (allowlist.xmlSha256 !== SECOND_WAVE_XML_SHA256) errors.push('allowlist XML SHA mismatch')
  if (allowlist.entryCount !== SECOND_WAVE_TOTAL || allowlist.entries.length !== SECOND_WAVE_TOTAL) errors.push(`scope must be ${SECOND_WAVE_TOTAL}`)
  if (new Set(allowlist.entries.map(x => x.productId)).size !== SECOND_WAVE_TOTAL) errors.push('duplicate Product ids')
  if (new Set(allowlist.entries.map(x => x.externalIdToSet)).size !== SECOND_WAVE_TOTAL) errors.push('duplicate externalIds')
  const parsed = new XMLParser({ parseTagValue: false, processEntities: false, isArray: name => name === 'item' }).parse(xml) as { root?: { item?: Array<{ sku?: string }> } }
  const xmlCounts = new Map<string, number>(); for (const item of parsed.root?.item ?? []) { const sku = String(item.sku ?? ''); xmlCounts.set(sku, (xmlCounts.get(sku) ?? 0) + 1) }
  const byId = new Map(products.map(p => [p.id, p]))
  for (const entry of allowlist.entries) {
    const product = byId.get(entry.productId)
    if (!product) { errors.push(`missing Product ${entry.productId}`); continue }
    if (product.isDeleted) errors.push(`soft-deleted Product ${entry.productId}`)
    if (product.externalId !== null) errors.push(`externalId already set ${entry.productId}`)
    if (product.sku !== entry.productSku) errors.push(`Product SKU changed ${entry.productId}`)
    if (entry.matchType !== 'CASE_ONLY_SAFE' || entry.externalIdToSet !== entry.xmlSku || entry.productSku === entry.xmlSku || fold(entry.productSku) !== fold(entry.xmlSku)) errors.push(`not case-only ${entry.productId}`)
    if (xmlCounts.get(entry.xmlSku) !== 1) errors.push(`XML SKU not unique ${entry.productId}`)
    if (['k18', 'k86'].includes(entry.productSku)) errors.push(`explicit REVIEW entry ${entry.productId}`)
  }
  if (errors.length) throw new Error(`Second-wave validation failed:\n- ${errors.join('\n- ')}`)
  return allowlist
}
