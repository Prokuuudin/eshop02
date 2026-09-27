import { createHash } from 'crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export const FIRST_WAVE_XML_SHA256 = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
export const FIRST_WAVE_ALLOWLIST_SHA256 = 'a8995cc87ec8e845aec09e6661640c185ae065d16a4ab12d91a3d1c171590176'
export const FIRST_WAVE_TOTAL = 3393
export const FIRST_WAVE_EXACT = 3348
export const FIRST_WAVE_LEADING_ZERO = 45

export type FirstWaveMatchType = 'EXACT_SAFE' | 'LEADING_ZERO_EXACT_SAFE'
export type FirstWaveEntry = {
  productId: string
  productSku: string
  xmlSku: string
  externalIdToSet: string
  matchType: FirstWaveMatchType
}
export type FirstWaveAllowlist = {
  schemaVersion: 1
  xmlSha256: string
  catalogFingerprint: string
  entries: FirstWaveEntry[]
}
export type CurrentProduct = { id: string; sku: string | null; externalId: string | null; isDeleted: boolean }
export type ValidationPolicy = { xmlSha256: string; total: number; exact: number; leadingZero: number }
export const FIRST_WAVE_POLICY: ValidationPolicy = {
  xmlSha256: FIRST_WAVE_XML_SHA256, total: FIRST_WAVE_TOTAL, exact: FIRST_WAVE_EXACT, leadingZero: FIRST_WAVE_LEADING_ZERO,
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export function requireAllowlistForApply(apply: boolean, allowlistPath?: string): void {
  if (apply && !allowlistPath) throw new Error('--apply requires --allowlist')
}

export function assertImmutableAllowlist(content: string | Buffer): void {
  if (sha256(content) !== FIRST_WAVE_ALLOWLIST_SHA256) throw new Error('Allowlist SHA-256 mismatch')
}

/** Extracts SKU as an opaque string. It intentionally never trims or parses numbers. */
export function rawXmlSkuCounts(xml: string): Map<string, number> {
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid XML')
  const parsed = new XMLParser({ parseTagValue: false, processEntities: false, isArray: name => name === 'item' }).parse(xml)
  const counts = new Map<string, number>()
  for (const item of parsed.root?.item ?? []) {
    const sku = String(item.sku ?? '')
    counts.set(sku, (counts.get(sku) ?? 0) + 1)
  }
  return counts
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>(), duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    else seen.add(value)
  }
  return [...duplicate]
}

export function validateFirstWave(
  allowlist: FirstWaveAllowlist,
  xml: string,
  products: CurrentProduct[],
  excludedProductIds: Set<string> = new Set(),
  policy: ValidationPolicy = FIRST_WAVE_POLICY,
): { exact: number; leadingZero: number } {
  const errors: string[] = []
  if (allowlist.schemaVersion !== 1) errors.push('unsupported allowlist schemaVersion')
  const actualXmlSha = sha256(xml)
  if (allowlist.xmlSha256 !== policy.xmlSha256 || actualXmlSha !== allowlist.xmlSha256) errors.push('XML SHA-256 mismatch')
  if (allowlist.entries.length !== policy.total) errors.push(`expected ${policy.total} entries, got ${allowlist.entries.length}`)
  const duplicateIds = duplicates(allowlist.entries.map(entry => entry.productId))
  const duplicateExternalIds = duplicates(allowlist.entries.map(entry => entry.externalIdToSet))
  if (duplicateIds.length) errors.push(`duplicate productId: ${duplicateIds.join(', ')}`)
  if (duplicateExternalIds.length) errors.push(`duplicate externalIdToSet: ${duplicateExternalIds.join(', ')}`)

  const exact = allowlist.entries.filter(entry => entry.matchType === 'EXACT_SAFE').length
  const leadingZero = allowlist.entries.filter(entry => entry.matchType === 'LEADING_ZERO_EXACT_SAFE').length
  if (exact !== policy.exact) errors.push(`expected ${policy.exact} EXACT_SAFE, got ${exact}`)
  if (leadingZero !== policy.leadingZero) errors.push(`expected ${policy.leadingZero} LEADING_ZERO_EXACT_SAFE, got ${leadingZero}`)
  if (exact + leadingZero !== allowlist.entries.length) errors.push('unsupported matchType present')

  const xmlCounts = rawXmlSkuCounts(xml)
  const productById = new Map(products.map(product => [product.id, product]))
  for (const entry of allowlist.entries) {
    const product = productById.get(entry.productId)
    if (!product) { errors.push(`missing Product ${entry.productId}`); continue }
    if (product.isDeleted) errors.push(`soft-deleted Product ${entry.productId}`)
    if (product.externalId !== null) errors.push(`externalId already set for Product ${entry.productId}`)
    if (product.sku === null || product.sku === '') errors.push(`empty SKU for Product ${entry.productId}`)
    if (product.sku !== entry.productSku) errors.push(`current SKU mismatch for Product ${entry.productId}`)
    if (entry.productSku !== entry.xmlSku || entry.xmlSku !== entry.externalIdToSet) errors.push(`non-exact SKU mapping for Product ${entry.productId}`)
    if (xmlCounts.get(entry.xmlSku) !== 1) errors.push(`XML SKU is not unique for Product ${entry.productId}`)
    if (entry.matchType === 'LEADING_ZERO_EXACT_SAFE' && !/^0\d/u.test(entry.productSku)) errors.push(`leading-zero matchType without leading zero for Product ${entry.productId}`)
    if (entry.matchType === 'EXACT_SAFE' && /^0\d/u.test(entry.productSku)) errors.push(`leading-zero SKU misclassified for Product ${entry.productId}`)
    if (excludedProductIds.has(entry.productId)) errors.push(`excluded REVIEW Product ${entry.productId}`)
  }
  if (errors.length) throw new Error(`First-wave validation failed:\n- ${errors.join('\n- ')}`)
  return { exact, leadingZero }
}

export type AtomicStore = {
  transaction<T>(operation: (tx: AtomicTransaction) => Promise<T>): Promise<T>
}
export type AtomicTransaction = {
  getProducts(ids: string[]): Promise<CurrentProduct[]>
  updateExternalIds(entries: FirstWaveEntry[]): Promise<number>
}

/** The transaction must roll back when this function throws. */
export async function applyFirstWaveAtomic(
  store: AtomicStore,
  allowlist: FirstWaveAllowlist,
  xml: string,
  excludedProductIds: Set<string> = new Set(),
  policy: ValidationPolicy = FIRST_WAVE_POLICY,
): Promise<number> {
  return store.transaction(async tx => {
    const products = await tx.getProducts(allowlist.entries.map(entry => entry.productId))
    validateFirstWave(allowlist, xml, products, excludedProductIds, policy)
    const updated = await tx.updateExternalIds(allowlist.entries)
    if (updated !== allowlist.entries.length) throw new Error(`Atomic update count mismatch: expected ${allowlist.entries.length}, got ${updated}`)
    return updated
  })
}
