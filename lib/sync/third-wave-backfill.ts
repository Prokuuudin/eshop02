import { createHash } from 'crypto'
import { XMLParser } from 'fast-xml-parser'

export const THIRD_WAVE_ALLOWLIST_SHA256 = 'c5a6c734884c395ad503b033a677166dec9d406b22922da98d4cdd73a9e662b6'
export const THIRD_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const THIRD_WAVE_BASELINE_FINGERPRINT = '863e02ba2ee90649cec5413fec7c3094'
export const THIRD_WAVE_SIZE = 42
export type ThirdWaveEntry = { productId: string; productSku: string; xmlSku: string; externalIdToSet: string; matchType: 'DUPLICATE_SAFE'; selectedEvidence: unknown; rejectedDuplicateProductIds: string[] }
export type ThirdWaveAllowlist = { schemaVersion: 1; wave: 'third-wave-duplicate-safe'; xmlSha256: string; baselineFingerprint: string; entryCount: number; entries: ThirdWaveEntry[] }
export type ThirdWaveProduct = { id: string; sku: string | null; externalId: string | null; isDeleted: boolean }
export const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

export function validateThirdWave(content: Buffer, xml: string, products: ThirdWaveProduct[], claimedExternalIds: string[]): ThirdWaveAllowlist {
  if (sha256(content) !== THIRD_WAVE_ALLOWLIST_SHA256) throw new Error('THIRD_WAVE_ALLOWLIST_SHA_MISMATCH')
  if (sha256(xml) !== THIRD_WAVE_XML_SHA256) throw new Error('THIRD_WAVE_XML_SHA_MISMATCH')
  const allowlist = JSON.parse(content.toString()) as ThirdWaveAllowlist, errors: string[] = []
  if (allowlist.schemaVersion !== 1 || allowlist.wave !== 'third-wave-duplicate-safe') errors.push('schema/wave mismatch')
  if (allowlist.xmlSha256 !== THIRD_WAVE_XML_SHA256 || allowlist.baselineFingerprint !== THIRD_WAVE_BASELINE_FINGERPRINT) errors.push('source binding mismatch')
  if (allowlist.entryCount !== THIRD_WAVE_SIZE || allowlist.entries.length !== THIRD_WAVE_SIZE) errors.push(`scope must be ${THIRD_WAVE_SIZE}`)
  if (new Set(allowlist.entries.map(x => x.productId)).size !== THIRD_WAVE_SIZE) errors.push('duplicate Product ids')
  if (new Set(allowlist.entries.map(x => x.externalIdToSet)).size !== THIRD_WAVE_SIZE) errors.push('duplicate externalIds')
  const parsed = new XMLParser({ parseTagValue: false, processEntities: false, isArray: name => name === 'item' }).parse(xml) as { root?: { item?: Array<{ sku?: string }> } }
  const xmlCounts = new Map<string, number>(); for (const x of parsed.root?.item ?? []) { const sku = String(x.sku ?? '').trim(); xmlCounts.set(sku, (xmlCounts.get(sku) ?? 0) + 1) }
  const byId = new Map(products.map(x => [x.id, x])), claimed = new Set(claimedExternalIds)
  for (const entry of allowlist.entries) {
    const product = byId.get(entry.productId)
    if (!product) { errors.push(`missing Product ${entry.productId}`); continue }
    if (product.isDeleted || product.externalId !== null || product.sku !== entry.productSku) errors.push(`current Product gate failed ${entry.productId}`)
    if (entry.matchType !== 'DUPLICATE_SAFE' || entry.productSku !== entry.xmlSku || entry.externalIdToSet !== entry.xmlSku) errors.push(`identity mismatch ${entry.productId}`)
    if (xmlCounts.get(entry.xmlSku) !== 1) errors.push(`XML SKU not unique ${entry.xmlSku}`)
    if (claimed.has(entry.externalIdToSet)) errors.push(`externalId already claimed ${entry.externalIdToSet}`)
    if (!entry.rejectedDuplicateProductIds.length) errors.push(`missing rejected duplicates ${entry.productId}`)
  }
  if (errors.length) throw new Error(`Third-wave validation failed:\n- ${errors.join('\n- ')}`)
  return allowlist
}
