import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { XMLParser } from 'fast-xml-parser'
import { classifyNormalizedIdentity, extractMeasures, nameSimilarity, normalizedKey, typedNormalizedRelation, type IdentityClassification, type NormalizationType } from '../lib/sync/normalized-sku-matching'
import { selectedStock } from '../lib/sync/sync-rules'
import { GRINS_WAREHOUSE_INDEX_TO_ID } from '../lib/sync/grins-warehouse-map'

config({ path: '.env.local' })

type Warehouse = { '@_id': string; '#text'?: string }
type XmlItem = { sku?: string; code?: string; title?: string; price1?: string; price2?: string; price3?: string; price4?: string; warehouses?: { warehouse?: Warehouse[] } }
const EXPECTED_XML_SHA = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
const DEFERRED_SKUS = new Set(['24006256', '97388150', 'BA02', 'DKIRI', 'KJMN0352', 'NIA308001', 'NIA407001', 'SS-40/3', 'K18', 'K86'])
const MANUAL_REJECTED_IDS = new Set(['21352', '21623', '19018', '21283', '21624', '22129', '21420', '19015'])
const value = (input: unknown) => String(input ?? '').trim()
const number = (input: unknown) => Number(input ?? 0) || 0
const sha256 = (input: string | Buffer) => createHash('sha256').update(input).digest('hex')
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '\ufeff'
  const columns = [...new Set(rows.flatMap(Object.keys))]
  const escape = (input: unknown) => `"${String(input ?? '').replace(/"/g, '""')}"`
  return `\ufeff${[columns.map(escape).join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n')}\n`
}
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(key => [key, values.filter(value => value === key).length]))
const brandEvidence = (brand: string, xmlName: string) => {
  const tokens = brand.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/u).filter(token => token.length >= 3)
  const haystack = xmlName.toLocaleLowerCase('en-US')
  return { available: Boolean(tokens.length), compatible: tokens.length ? tokens.some(token => haystack.includes(token)) : null, tokens }
}

async function main() {
  const { prisma } = await import('../lib/prisma')
  const state = async () => (await prisma.$queryRawUnsafe<Array<Record<string, number | string>>>(`SELECT COUNT(*)::int "productCount",COUNT("externalId")::int "externalIdCount",COUNT(*) FILTER(WHERE "externalId" IS NOT NULL)::int "linkedCount",COUNT(*) FILTER(WHERE "externalId" IS NULL)::int "unlinkedCount",COUNT(*) FILTER(WHERE "isActive")::int active,COUNT(*) FILTER(WHERE NOT "isActive")::int inactive,COUNT(*) FILTER(WHERE "isDeleted")::int "softDeleted",COUNT(*) FILTER(WHERE NULLIF(BTRIM(COALESCE(sku,'')),'') IS NOT NULL)::int "withSku",COUNT(*) FILTER(WHERE NULLIF(BTRIM(COALESCE(sku,'')),'') IS NULL)::int "withoutSku",(SELECT COUNT(*)::int FROM "SyncRun") "syncRunCount",md5(COALESCE(string_agg(row_to_json(p)::text,'' ORDER BY p.id),'')) fingerprint FROM "Product" p`))[0]
  try {
    const before = await state()
    const [xmlText, previousText] = await Promise.all([readFile('export.xml', 'utf8'), readFile('remaining-products-audit.json', 'utf8')])
    const xmlSha = sha256(xmlText)
    if (xmlSha !== EXPECTED_XML_SHA) throw new Error(`XML_SHA_CHANGED:${xmlSha}`)
    if (before.productCount !== 6378 || before.externalIdCount !== 3526 || before.syncRunCount !== 6) throw new Error(`POST_FOURTH_WAVE_BASELINE_MISMATCH:${JSON.stringify(before)}`)
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, processEntities: false, isArray: name => name === 'item' || name === 'warehouse' }).parse(xmlText) as { root?: { item?: XmlItem[] } }
    const xmlItems = parsed.root?.item ?? []
    const products = await prisma.product.findMany({ select: { id: true, sku: true, externalId: true, title: true, titleEn: true, titleLv: true, barcode: true, brand: true, specVolume: true, specType: true, price: true, stock: true, isActive: true, isDeleted: true } })
    const previous = JSON.parse(previousText) as { localProducts?: Array<{ productId: string; classification: string; bestXmlSku: string }> }
    const previousRows = (previous.localProducts ?? []).filter(row => row.classification === 'NORMALIZED_SKU_CANDIDATE')
    const previousById = new Map(previousRows.map(row => [row.productId, row.bestXmlSku]))
    const linkedSkus = new Map<string, string[]>()
    for (const product of products) if (product.externalId) linkedSkus.set(product.externalId, [...(linkedSkus.get(product.externalId) ?? []), product.id])
    const unlinked = products.filter(product => !product.externalId)
    const types: NormalizationType[] = ['LEADING_ZERO_NORMALIZATION', 'DOT_NORMALIZATION', 'INTERNAL_SPACE_NORMALIZATION']
    const localIndexes = new Map<NormalizationType, Map<string, typeof products>>()
    const xmlIndexes = new Map<NormalizationType, Map<string, XmlItem[]>>()
    for (const type of types) {
      const localIndex = new Map<string, typeof products>()
      const xmlIndex = new Map<string, XmlItem[]>()
      for (const product of products) {
        const key = product.sku ? normalizedKey(type, product.sku) : null
        if (key) localIndex.set(key, [...(localIndex.get(key) ?? []), product])
      }
      for (const item of xmlItems) {
        const key = normalizedKey(type, value(item.sku))
        if (key) xmlIndex.set(key, [...(xmlIndex.get(key) ?? []), item])
      }
      localIndexes.set(type, localIndex)
      xmlIndexes.set(type, xmlIndex)
    }
    const localEans = new Map<string, number>(), xmlEans = new Map<string, number>()
    for (const product of products) if (value(product.barcode)) localEans.set(value(product.barcode), (localEans.get(value(product.barcode)) ?? 0) + 1)
    for (const item of xmlItems) if (value(item.code)) xmlEans.set(value(item.code), (xmlEans.get(value(item.code)) ?? 0) + 1)
    const rows: Array<Record<string, unknown> & { productId: string; xmlSku: string; normalizationType: NormalizationType; classification: IdentityClassification }> = []
    for (const product of unlinked) {
      const localSku = value(product.sku)
      if (!localSku) continue
      for (const item of xmlItems) {
        const xmlSku = value(item.sku)
        const relation = typedNormalizedRelation(localSku, xmlSku)
        if (!relation) continue
        const localMatches = localIndexes.get(relation.type)?.get(relation.normalizedKey) ?? []
        const xmlMatches = xmlIndexes.get(relation.type)?.get(relation.normalizedKey) ?? []
        const exactLocalXmlSku = products.filter(candidate => value(candidate.sku) === xmlSku)
        const competingUnlinked = unlinked.filter(candidate => candidate.id !== product.id && value(candidate.sku) && typedNormalizedRelation(value(candidate.sku), xmlSku))
        const localEan = value(product.barcode), xmlEan = value(item.code), xmlName = value(item.title), localName = [product.title, product.titleEn, product.titleLv].filter(Boolean).join(' | ')
        const deferredIntersection = DEFERRED_SKUS.has(xmlSku.toLocaleUpperCase('en-US')) || MANUAL_REJECTED_IDS.has(product.id)
        const existingExternalIdClaimants = linkedSkus.get(xmlSku)?.length ?? 0
        let result = classifyNormalizedIdentity({ relation, localNormalizedCount: localMatches.length, xmlNormalizedCount: xmlMatches.length, exactLocalXmlSkuCount: exactLocalXmlSku.length, existingExternalIdClaimants, competingUnlinkedProducts: competingUnlinked.length, deferredIntersection, alreadyResolved: existingExternalIdClaimants > 0, localEan, xmlEan, localEanCount: localEans.get(localEan) ?? 0, xmlEanCount: xmlEans.get(xmlEan) ?? 0, localName, xmlName })
        const brand = brandEvidence(product.brand, xmlName)
        if (result.classification === 'FIFTH_WAVE_SAFE_CANDIDATE' && brand.compatible === false) result = { classification: 'MANUAL_REVIEW', reasons: [...result.reasons, 'Stored Product.brand is not supported by XML name'] }
        const warehouses: Record<string, number> = {}
        for (const warehouse of item.warehouses?.warehouse ?? []) {
          const id = GRINS_WAREHOUSE_INDEX_TO_ID[Number(warehouse['@_id']) - 1]
          if (id) warehouses[id] = number(warehouse['#text'])
        }
        const xmlStock = selectedStock(warehouses), price2 = number(item.price2), futurePrice = price2 > 0 ? price2 : Number(product.price), similarity = nameSimilarity(localName, xmlName)
        const exactUniqueEan = Boolean(localEan && xmlEan && localEan === xmlEan && localEans.get(localEan) === 1 && xmlEans.get(xmlEan) === 1)
        const eanStatus = !localEan ? 'LOCAL_EAN_MISSING' : !xmlEan ? 'XML_EAN_MISSING' : localEan !== xmlEan ? 'EAN_CONFLICT' : exactUniqueEan ? 'EXACT_UNIQUE_EAN' : 'EAN_AMBIGUOUS'
        rows.push({ productId: product.id, localSku, xmlSku, normalizationType: relation.type, normalizedKey: relation.normalizedKey, productName: product.title, productTitleEn: product.titleEn ?? '', productTitleLv: product.titleLv ?? '', xmlName, productBarcode: localEan, xmlEan, eanStatus, brand: product.brand, brandEvidence: brand, productMeasures: extractMeasures(localName), xmlMeasures: extractMeasures(xmlName), nameSimilarity: Number(similarity.toFixed(3)), active: product.isActive, currentPrice: Number(product.price), xmlPrice1: number(item.price1), xmlPrice2: price2, currentStock: product.stock, xmlAllowedStock: xmlStock, softDeleted: product.isDeleted, existingExternalId: product.externalId, collisions: { localNormalizedCount: localMatches.length, localProductIds: localMatches.map(match => match.id), xmlNormalizedCount: xmlMatches.length, xmlSkus: xmlMatches.map(match => value(match.sku)), exactLocalXmlSkuProductIds: exactLocalXmlSku.map(match => match.id), existingExternalIdProductIds: linkedSkus.get(xmlSku) ?? [], competingUnlinkedProductIds: competingUnlinked.map(match => match.id), caseFoldCollision: products.some(candidate => value(candidate.sku).toLocaleLowerCase('en-US') === xmlSku.toLocaleLowerCase('en-US') && value(candidate.sku) !== xmlSku), deferredIntersection }, classification: result.classification, reasons: result.reasons, futurePricePreview: { price2, resultingPrice: futurePrice, wouldChange: futurePrice !== Number(product.price), changePercent: Number(product.price) > 0 ? Number((((futurePrice - Number(product.price)) / Number(product.price)) * 100).toFixed(2)) : null, absoluteChange: Number(Math.abs(futurePrice - Number(product.price)).toFixed(2)), zeroPriceRegression: Number(product.price) > 0 && futurePrice === 0 }, futureStockPreview: { resultingStock: xmlStock, wouldChange: xmlStock !== product.stock, positiveToZero: product.stock > 0 && xmlStock === 0, zeroToPositive: product.stock === 0 && xmlStock > 0, formulaMismatch: false } })
      }
    }
    const relevantRows = rows.filter(row => row.classification !== 'ALREADY_RESOLVED')
    const resolvedRows = rows.filter(row => row.classification === 'ALREADY_RESOLVED')
    const currentPairs = new Map(relevantRows.map(row => [row.productId, row.xmlSku]))
    const disappeared = previousRows.filter(row => !currentPairs.has(row.productId)).map(row => row.productId)
    const newlyAppeared = relevantRows.filter(row => !previousById.has(row.productId)).map(row => row.productId)
    const changedTarget = relevantRows.filter(row => previousById.has(row.productId) && previousById.get(row.productId) !== row.xmlSku).map(row => ({ productId: row.productId, previous: previousById.get(row.productId), current: row.xmlSku }))
    const alreadyResolved = resolvedRows.map(row => ({ productId: row.productId, xmlSku: row.xmlSku, claimantIds: (row.collisions as { existingExternalIdProductIds: string[] }).existingExternalIdProductIds }))
    const safe = rows.filter(row => row.classification === 'FIFTH_WAVE_SAFE_CANDIDATE')
    const safePrice = safe.map(row => row.futurePricePreview as { price2: number; wouldChange: boolean; changePercent: number | null; absoluteChange: number; zeroPriceRegression: boolean })
    const safeStock = safe.map(row => row.futureStockPreview as { resultingStock: number; wouldChange: boolean; positiveToZero: boolean; zeroToPositive: boolean; formulaMismatch: boolean })
    const summary = { baseline: before, xml: { records: xmlItems.length, sha256: xmlSha, uniqueSku: new Set(xmlItems.map(item => value(item.sku)).filter(Boolean)).size, duplicateSku: [...new Map(xmlItems.map(item => [value(item.sku), xmlItems.filter(other => value(other.sku) === value(item.sku)).length])).values()].filter(count => count > 1).length }, reconstruction: { previous: previousRows.length, reconstructedPairs: rows.length, current: relevantRows.length, byType: countBy(relevantRows.map(row => row.normalizationType)), disappeared, newlyAppeared, changedTarget, alreadyResolved }, classification: countBy(rows.map(row => row.classification)), evidenceQuality: { safeWithExactUniqueEan: safe.filter(row => row.eanStatus === 'EXACT_UNIQUE_EAN').length, safeWithoutLocalEan: safe.filter(row => row.eanStatus === 'LOCAL_EAN_MISSING').length, conflictingEan: relevantRows.filter(row => row.eanStatus === 'EAN_CONFLICT').length, normalizedKeyCollisions: relevantRows.filter(row => { const collision = row.collisions as { localNormalizedCount: number; xmlNormalizedCount: number }; return collision.localNormalizedCount !== 1 || collision.xmlNormalizedCount !== 1 }).length, intersectionWithExistingExternalIds: safe.filter(row => (row.collisions as { existingExternalIdProductIds: string[] }).existingExternalIdProductIds.length).length, alreadyResolvedExternalIdIntersections: resolvedRows.length, deferredIntersections: relevantRows.filter(row => (row.collisions as { deferredIntersection: boolean }).deferredIntersection).length }, safePreview: { price: { price2Positive: safePrice.filter(item => item.price2 > 0).length, price2Zero: safePrice.filter(item => item.price2 === 0).length, wouldChange: safePrice.filter(item => item.wouldChange).length, unchanged: safePrice.filter(item => !item.wouldChange).length, over50Percent: safePrice.filter(item => Math.abs(item.changePercent ?? 0) > 50).length, largeAbsoluteChanges: safePrice.filter(item => item.absoluteChange >= 20).length, zeroPriceRegressions: safePrice.filter(item => item.zeroPriceRegression).length }, stock: { wouldChange: safeStock.filter(item => item.wouldChange).length, unchanged: safeStock.filter(item => !item.wouldChange).length, positiveToZero: safeStock.filter(item => item.positiveToZero).length, zeroToPositive: safeStock.filter(item => item.zeroToPositive).length, resultingZero: safeStock.filter(item => item.resultingStock === 0).length, formulaMismatches: safeStock.filter(item => item.formulaMismatch).length } } }
    const after = await state()
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`DATABASE_CHANGED_DURING_AUDIT:${JSON.stringify({ before, after })}`)
    const report = { generatedAt: new Date().toISOString(), readOnly: true, executable: false, authorizedForApply: false, databaseWrites: 0, before, after, unchanged: true, summary, candidates: rows }
    const md = ['# Fifth-wave normalized SKU audit', '', `Generated: ${report.generatedAt}`, '', '**Read-only. Not executable. Not authorized for apply.**', '', '## Summary', '', '```json', JSON.stringify(summary, null, 2), '```', '', '## Manual review', '', ...rows.filter(row => row.classification === 'MANUAL_REVIEW').map(row => `- ${row.productId}: \`${row.localSku}\` → \`${row.xmlSku}\` — ${(row.reasons as string[]).join('; ')}`), '', '## Rejected', '', ...rows.filter(row => row.classification === 'REJECTED_MATCH').map(row => `- ${row.productId}: \`${row.localSku}\` → \`${row.xmlSku}\` — ${(row.reasons as string[]).join('; ')}`), ''].join('\n')
    const flat = rows.map(row => ({ productId: row.productId, localSku: row.localSku, xmlSku: row.xmlSku, normalizationType: row.normalizationType, normalizedKey: row.normalizedKey, productName: row.productName, xmlName: row.xmlName, productBarcode: row.productBarcode, xmlEan: row.xmlEan, eanStatus: row.eanStatus, nameSimilarity: row.nameSimilarity, classification: row.classification, reasons: (row.reasons as string[]).join('; ') }))
    await Promise.all([writeFile('fifth-wave-normalized-sku-audit.json', `${JSON.stringify(report, null, 2)}\n`), writeFile('fifth-wave-normalized-sku-audit.md', `${md}\n`), writeFile('fifth-wave-normalized-sku-all.csv', csv(flat)), writeFile('fifth-wave-normalized-sku-review.csv', csv(flat.filter(row => row.classification === 'MANUAL_REVIEW' || row.classification === 'REJECTED_MATCH'))), writeFile('fifth-wave-normalized-sku-safe-candidates.json', `${JSON.stringify({ generatedAt: report.generatedAt, executable: false, authorizedForApply: false, sourceXmlSha256: xmlSha, candidates: safe }, null, 2)}\n`)])
    console.log(JSON.stringify({ summary, before, after, unchanged: true, databaseWrites: 0, outputs: ['fifth-wave-normalized-sku-audit.json', 'fifth-wave-normalized-sku-audit.md', 'fifth-wave-normalized-sku-all.csv', 'fifth-wave-normalized-sku-review.csv', 'fifth-wave-normalized-sku-safe-candidates.json'] }, null, 2))
  } finally { await prisma.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
