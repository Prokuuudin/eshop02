import { createHash } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { config } from 'dotenv'
import { XMLParser } from 'fast-xml-parser'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from '../lib/sync/grins-warehouse-map'

config({ path: '.env.local' })

type RawWarehouse = { '@_id': string; '#text'?: string }
type RawXml = { sku?: string; title?: string; code?: string; price1?: string; price2?: string; price3?: string; price4?: string; warehouses?: { warehouse?: RawWarehouse[] } }
const AMBIGUOUS_SKUS = new Set(['24006256', '97388150', 'BA02', 'DKIRI', 'KJMN0352', 'NIA308001', 'NIA407001', 'SS-40/3'])
const norm = (value: unknown): string => String(value ?? '').trim()
const fold = (value: unknown): string => norm(value).toLocaleLowerCase('en-US')
const num = (value: unknown): number => Number(value ?? 0) || 0
const words = (value: unknown): Set<string> => new Set(fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/u).filter(Boolean))
const similarity = (a: unknown, b: unknown): number => { const aa = words(a), bb = words(b); if (!aa.size || !bb.size) return 0; let common = 0; for (const x of aa) if (bb.has(x)) common++; return (2 * common) / (aa.size + bb.size) }
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const stripZero = (value: string): string => value.replace(/^0+(?=\d)/u, '')

async function main() {
  const { prisma } = await import('../lib/prisma')
  const state = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; externalIdCount: number; active: number; inactive: number; syncRunCount: number; fingerprint: string }>>(`SELECT COUNT(*)::int count, COUNT("externalId")::int "externalIdCount", COUNT(*) FILTER (WHERE "isActive")::int active, COUNT(*) FILTER (WHERE NOT "isActive")::int inactive, (SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount", md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint FROM "Product" p`))[0]
  try {
    const before = await state(), xmlText = await readFile('export.xml', 'utf8'), xmlSha256 = sha256(xmlText)
    const oldAudit = JSON.parse(await readFile('external-id-review-audit.json', 'utf8')) as { duplicateGroups: Array<{ sku: string; confidence: string; proposedProductId: string | null }> }
    const oldBySku = new Map(oldAudit.duplicateGroups.map(x => [x.sku, x]))
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, processEntities: false, isArray: name => name === 'item' || name === 'warehouse' }).parse(xmlText) as { root?: { item?: RawXml[] } }
    const xmlItems = parsed.root?.item ?? [], xmlBySku = new Map<string, RawXml[]>(), xmlByFold = new Map<string, RawXml[]>()
    for (const item of xmlItems) { const sku = norm(item.sku); xmlBySku.set(sku, [...(xmlBySku.get(sku) ?? []), item]); xmlByFold.set(fold(sku), [...(xmlByFold.get(fold(sku)) ?? []), item]) }
    const products = await prisma.product.findMany({ select: { id: true, sku: true, externalId: true, title: true, titleEn: true, titleLv: true, barcode: true, price: true, stock: true, isActive: true, isDeleted: true, createdAt: true, updatedAt: true, category: true, brand: true } })
    const dbBySku = new Map<string, typeof products>(), dbByFold = new Map<string, typeof products>()
    for (const p of products) { if (!norm(p.sku)) continue; dbBySku.set(norm(p.sku), [...(dbBySku.get(norm(p.sku)) ?? []), p]); dbByFold.set(fold(p.sku), [...(dbByFold.get(fold(p.sku)) ?? []), p]) }
    const duplicateSkus = [...dbBySku].filter(([sku, rows]) => rows.filter(x => !x.isDeleted).length > 1 && xmlBySku.has(sku)).map(([sku]) => sku).sort()
    const groups = duplicateSkus.map(sku => {
      const rows = dbBySku.get(sku)!, xmlRows = xmlBySku.get(sku)!, xml = xmlRows[0]
      const evidence = rows.map(p => ({ productId: p.id, exactBarcodeMatch: Boolean(norm(xml.code) && norm(p.barcode) === norm(xml.code)), titleSimilarity: Number(Math.max(similarity(xml.title, p.title), similarity(xml.title, p.titleEn), similarity(xml.title, p.titleLv)).toFixed(3)), price2Match: Math.abs(num(p.price) - num(xml.price2)) < 0.005 }))
      const barcodeMatches = evidence.filter(x => x.exactBarcodeMatch), proposed = barcodeMatches.length === 1 ? rows.find(x => x.id === barcodeMatches[0].productId) : undefined
      const otherExtClaimants = products.filter(p => p.externalId === sku && p.id !== proposed?.id)
      const caseConflicts = (dbByFold.get(fold(sku)) ?? []).filter(p => norm(p.sku) !== sku)
      const xmlCaseConflicts = (xmlByFold.get(fold(sku)) ?? []).filter(x => norm(x.sku) !== sku)
      const zeroConflicts = products.filter(p => norm(p.sku) !== sku && stripZero(norm(p.sku)) === stripZero(sku))
      const selectedEvidence = proposed ? evidence.find(x => x.productId === proposed.id)! : null
      const safeReasons = [xmlRows.length === 1, barcodeMatches.length === 1, Boolean(proposed && !proposed.isDeleted && proposed.externalId === null), Boolean(selectedEvidence && selectedEvidence.titleSimilarity >= 0.25), otherExtClaimants.length === 0, caseConflicts.length === 0, xmlCaseConflicts.length === 0, zeroConflicts.length === 0]
      const safe = safeReasons.every(Boolean) && !AMBIGUOUS_SKUS.has(sku)
      const practicallyIdentical = new Set(rows.filter(x => !x.isDeleted).map(x => `${fold(x.title)}|${norm(x.barcode)}|${x.isActive}`)).size === 1
      const status = safe ? 'DUPLICATE_SAFE' : (AMBIGUOUS_SKUS.has(sku) || practicallyIdentical || barcodeMatches.length !== 1 ? 'AMBIGUOUS_DUPLICATE' : 'MANUAL_REVIEW')
      const rejected = rows.filter(x => x.id !== proposed?.id).map(p => {
        const ev = evidence.find(x => x.productId === p.id)!
        const classification = p.isDeleted ? 'soft-deleted duplicate' : !p.isActive ? (ev.exactBarcodeMatch ? 'inactive conflicting duplicate' : 'inactive/legacy duplicate with a different or empty EAN') : (ev.exactBarcodeMatch ? 'active conflicting duplicate' : 'active duplicate with a different or empty EAN; may be another product/variant')
        return { productId: p.id, classification, reasonNotSelected: ev.exactBarcodeMatch ? 'EAN does not uniquely resolve the group' : 'EAN does not match the XML EAN', evidence: ev }
      })
      const warehouses: Record<string, number> = {}; for (const w of xml.warehouses?.warehouse ?? []) { const id = GRINS_WAREHOUSE_INDEX_TO_ID[Number(w['@_id']) - 1]; if (id) warehouses[id] = num(w['#text']) }
      return {
        xmlSku: sku, status, proposedProductId: safe ? proposed!.id : null,
        reason: safe ? 'One non-deleted, unlinked Product has the group’s only exact XML EAN match; its title supports the same model, while every other duplicate has a different/empty EAN and no conflicting normalized identity exists.' : `Fail-closed: ${xmlRows.length !== 1 ? 'XML SKU is not unique; ' : ''}${barcodeMatches.length !== 1 ? `exact EAN matches=${barcodeMatches.length}; ` : ''}${selectedEvidence && selectedEvidence.titleSimilarity < 0.25 ? 'title evidence is weak; ' : ''}${AMBIGUOUS_SKUS.has(sku) ? 'previous ambiguous group remains explicitly deferred; ' : ''}${practicallyIdentical ? 'local records are practically identical; ' : ''}${otherExtClaimants.length ? 'externalId already claimed; ' : ''}${caseConflicts.length || xmlCaseConflicts.length || zeroConflicts.length ? 'normalized identity conflict; ' : ''}`.trim(),
        xml: { sku, title: norm(xml.title), barcode: norm(xml.code) || null, prices: { price1: num(xml.price1), price2: num(xml.price2), price3: num(xml.price3), price4: num(xml.price4) }, warehouses, allowedStock: ['10000', '10001', '10002', '10005'].reduce((sum, id) => sum + Math.max(0, warehouses[id] ?? 0), 0) },
        products: rows.map(p => ({ id: p.id, sku: p.sku, externalId: p.externalId, title: p.title, titleEn: p.titleEn, titleLv: p.titleLv, barcode: p.barcode, price: num(p.price), stock: p.stock, isActive: p.isActive, isDeleted: p.isDeleted, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), category: p.category, brand: p.brand })),
        selectedEvidence: safe ? selectedEvidence : null, rejectedDuplicates: rejected, conflicts: { otherExternalIdClaimantIds: otherExtClaimants.map(x => x.id), caseFoldProductIds: caseConflicts.map(x => x.id), caseFoldXmlSkus: xmlCaseConflicts.map(x => norm(x.sku)), leadingZeroProductIds: zeroConflicts.map(x => x.id) },
        previous: oldBySku.get(sku) ?? null,
      }
    })
    const safeGroups = groups.filter(x => x.status === 'DUPLICATE_SAFE')
    const entries = safeGroups.map(g => ({ productId: g.proposedProductId!, productSku: g.xmlSku, xmlSku: g.xmlSku, externalIdToSet: g.xmlSku, matchType: 'DUPLICATE_SAFE' as const, selectedEvidence: g.selectedEvidence, rejectedDuplicateProductIds: g.rejectedDuplicates.map(x => x.productId) }))
    const allowlist = { schemaVersion: 1, wave: 'third-wave-duplicate-safe', xmlSha256, baselineFingerprint: before.fingerprint, generatedAt: new Date().toISOString(), entryCount: entries.length, entries }
    const allowlistText = `${JSON.stringify(allowlist, null, 2)}\n`, allowlistSha256 = sha256(allowlistText)
    const previousHigh = oldAudit.duplicateGroups.filter(x => x.confidence === 'HIGH'), previousAmbiguous = oldAudit.duplicateGroups.filter(x => x.confidence === 'AMBIGUOUS')
    const summary = { duplicateGroups: groups.length, productRows: groups.reduce((n, x) => n + x.products.length, 0), duplicateSafe: safeGroups.length, manualReview: groups.filter(x => x.status === 'MANUAL_REVIEW').length, ambiguousDuplicate: groups.filter(x => x.status === 'AMBIGUOUS_DUPLICATE').length, activeActive: groups.filter(x => x.products.filter(p => !p.isDeleted).every(p => p.isActive)).length, inactiveInactive: groups.filter(x => x.products.filter(p => !p.isDeleted).every(p => !p.isActive)).length }
    const reconciliation = { previousHigh: previousHigh.length, remainedSafe: previousHigh.filter(x => groups.some(g => g.xmlSku === x.sku && g.status === 'DUPLICATE_SAFE')).length, downgraded: previousHigh.filter(x => !groups.some(g => g.xmlSku === x.sku && g.status === 'DUPLICATE_SAFE')).map(x => x.sku), changedProposedProductId: previousHigh.filter(x => { const g = groups.find(y => y.xmlSku === x.sku); return g?.status === 'DUPLICATE_SAFE' && g.proposedProductId !== x.proposedProductId }).map(x => ({ sku: x.sku, before: x.proposedProductId, after: groups.find(y => y.xmlSku === x.sku)?.proposedProductId })), newSafe: safeGroups.filter(g => oldBySku.get(g.xmlSku)?.confidence !== 'HIGH').map(g => g.xmlSku), previousAmbiguous: previousAmbiguous.map(x => ({ sku: x.sku, currentStatus: groups.find(g => g.xmlSku === x.sku)?.status ?? 'NOT_PRESENT', reason: groups.find(g => g.xmlSku === x.sku)?.reason ?? 'Group no longer present' })) }
    const after = await state()
    const report = { generatedAt: allowlist.generatedAt, readOnly: true, source: { file: 'export.xml', xmlSha256 }, baseline: before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), summary, reconciliation, allowlist: { file: 'third-wave-duplicate-safe-allowlist.json', sha256: allowlistSha256, entries: entries.length }, groups }
    await Promise.all([writeFile('third-wave-duplicate-audit.json', `${JSON.stringify(report, null, 2)}\n`), writeFile('third-wave-duplicate-safe-allowlist.json', allowlistText)])
    const md = ['# Third-wave duplicate audit', '', `Generated: ${report.generatedAt}`, `XML SHA-256: ${xmlSha256}`, `Baseline fingerprint: ${before.fingerprint}`, '', '## Summary', '', '```json', JSON.stringify({ summary, reconciliation, unchanged: report.unchanged, allowlist: report.allowlist }, null, 2), '```', '', ...groups.flatMap(g => [`## ${g.xmlSku} — ${g.status}`, '', `${g.reason}`, '', `XML: ${g.xml.title} | EAN ${g.xml.barcode ?? '—'} | price2 ${g.xml.prices.price2} | allowed stock ${g.xml.allowedStock}`, '', ...g.products.map(p => `- ${p.id} | ${p.isActive ? 'active' : 'inactive'}${p.isDeleted ? '/deleted' : ''} | ext ${p.externalId ?? 'null'} | EAN ${p.barcode ?? '—'} | ${p.title}`), '', `Selected: ${g.proposedProductId ?? 'none'}`, ...g.rejectedDuplicates.map(x => `- Rejected ${x.productId}: ${x.classification}; ${x.reasonNotSelected}`), ''])]
    await writeFile('third-wave-duplicate-audit.md', `${md.join('\n')}\n`)
    console.log(JSON.stringify({ baseline: before, after, unchanged: report.unchanged, xmlSha256, summary, reconciliation, allowlist: report.allowlist }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
