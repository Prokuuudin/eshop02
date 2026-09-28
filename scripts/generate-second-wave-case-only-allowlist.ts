import { config } from 'dotenv'
config({ path: '.env.local' })
import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { XMLParser } from 'fast-xml-parser'
import { selectedStock } from '../lib/sync/sync-rules'

type XmlItem = { sku?: string; code?: string; title?: string; price2?: string | number; warehouses?: { warehouse?: Array<{ '@_id': string; '#text'?: string | number }> } }
const EXPECTED_XML_SHA = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
const fold = (value: unknown) => String(value ?? '').toLocaleLowerCase('en-US')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const xmlText = await readFile('export.xml', 'utf8'); if (hash(xmlText) !== EXPECTED_XML_SHA) throw new Error('XML_SHA_MISMATCH')
    const items = ((new XMLParser({ parseTagValue: false, processEntities: false, ignoreAttributes: false, attributeNamePrefix: '@_', isArray: name => name === 'item' || name === 'warehouse' }).parse(xmlText) as { root?: { item?: XmlItem[] } }).root?.item ?? [])
    const products = await prisma.product.findMany({ select: { id: true, sku: true, externalId: true, title: true, barcode: true, price: true, stock: true, isActive: true, isDeleted: true } })
    const xmlByFold = new Map<string, XmlItem[]>(); const xmlExact = new Map<string, XmlItem[]>(); for (const item of items) { const sku = String(item.sku ?? ''); xmlByFold.set(fold(sku), [...(xmlByFold.get(fold(sku)) ?? []), item]); xmlExact.set(sku, [...(xmlExact.get(sku) ?? []), item]) }
    const dbByFold = new Map<string, typeof products>(); const dbExact = new Map<string, typeof products>(); for (const p of products.filter(p => !p.isDeleted && p.sku)) { dbByFold.set(fold(p.sku), [...(dbByFold.get(fold(p.sku)) ?? []), p]); dbExact.set(p.sku!, [...(dbExact.get(p.sku!) ?? []), p]) }
    const oldAudit = JSON.parse(await readFile('external-id-review-audit.json', 'utf8')) as { duplicateGroups: Array<{ products: Array<{ id: string }> }>; caseOnly: Array<{ issueType: string; product: { id: string } }> }
    const duplicateIds = new Set<string>(oldAudit.duplicateGroups.flatMap(group => group.products.map(p => p.id))); const manualReviewIds = new Set<string>(oldAudit.caseOnly.filter(x => x.issueType === 'CASE_REVIEW').map(x => x.product.id))
    const allCaseOnly = products.filter(p => !p.isDeleted && p.sku && p.externalId === null).flatMap(product => {
      const productSku = product.sku!; const feeds = xmlByFold.get(fold(productSku)) ?? []; if (feeds.length !== 1) return []
      const xml = feeds[0], xmlSku = String(xml.sku ?? ''); if (xmlSku === productSku || fold(xmlSku) !== fold(productSku)) return []
      const foldedProducts = dbByFold.get(fold(productSku)) ?? []; const exactConflict = dbExact.get(xmlSku) ?? []
      const warehouses: Record<string, number> = {}; const ids = ['10000','10001','10002','10003','10004','10005','10006','10007','10010']; for (const w of xml.warehouses?.warehouse ?? []) warehouses[ids[Number(w['@_id']) - 1]] = Math.max(0, Number(w['#text'] ?? 0))
      const reasons: string[] = []
      if (foldedProducts.length !== 1) reasons.push(`DB_CASEFOLD_CLAIMANTS_${foldedProducts.length}`); if (exactConflict.length) reasons.push('EXACT_DB_CONFLICT'); if ((xmlExact.get(xmlSku)?.length ?? 0) !== 1) reasons.push('XML_NOT_UNIQUE'); if (duplicateIds.has(product.id)) reasons.push('DUPLICATE_HIGH_OVERLAP'); if (manualReviewIds.has(product.id)) reasons.push('MANUAL_REVIEW_OVERLAP'); if (['k18','k86'].includes(productSku)) reasons.push('EXPLICIT_CASE_REVIEW')
      return [{ productId: product.id, productSku, xmlSku, externalIdToSet: xmlSku, matchType: reasons.length ? 'CASE_REVIEW' : 'CASE_ONLY_SAFE', evidence: { productTitle: product.title, xmlTitle: String(xml.title ?? ''), productBarcode: product.barcode, xmlBarcode: String(xml.code ?? '') || null, currentPrice: Number(product.price), xmlPrice2: Number(xml.price2 ?? 0), currentStock: product.stock, xmlAllowedStock: selectedStock(warehouses), isActive: product.isActive, existingExternalId: product.externalId, differsOnlyByCase: true, productCasefoldClaimants: foldedProducts.length, xmlCasefoldClaimants: feeds.length, exactProductConflict: exactConflict.length, duplicateHighOverlap: duplicateIds.has(product.id), manualReviewOverlap: manualReviewIds.has(product.id), exclusionReasons: reasons } }]
    })
    const safe = allCaseOnly.filter(x => x.matchType === 'CASE_ONLY_SAFE'); const review = allCaseOnly.filter(x => x.matchType === 'CASE_REVIEW')
    const state = (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number; fingerprint: string }>>(`SELECT COUNT(*)::int count, COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE "isActive")::int active, COUNT(*) FILTER (WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint FROM "Product" p`))[0]
    const allowlist = { schemaVersion: 1, wave: 'second-wave-case-only', xmlSha256: EXPECTED_XML_SHA, generatedAt: new Date().toISOString(), expectedBaseline: state, entryCount: safe.length, entries: safe }
    const content = JSON.stringify(allowlist, null, 2) + '\n'; await writeFile('second-wave-case-only-allowlist.json', content, 'utf8'); await writeFile('second-wave-case-only-audit.json', JSON.stringify({ state, xmlSha256: EXPECTED_XML_SHA, totalCaseOnly: allCaseOnly.length, safe, review }, null, 2) + '\n', 'utf8')
    console.log(JSON.stringify({ state, totalCaseOnly: allCaseOnly.length, safe: safe.length, review: review.length, excluded: review.map(x => ({ productId: x.productId, productSku: x.productSku, xmlSku: x.xmlSku, reasons: x.evidence.exclusionReasons })), uniqueProductIds: new Set(safe.map(x => x.productId)).size, uniqueExternalIds: new Set(safe.map(x => x.externalIdToSet)).size, allowlistSha256: hash(content), outputs: ['second-wave-case-only-allowlist.json','second-wave-case-only-audit.json'] }, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
