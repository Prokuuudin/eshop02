import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { config } from 'dotenv'
import { XMLParser } from 'fast-xml-parser'

config({ path: '.env.local' })

type XmlItem = {
  sku?: string
  code?: string
  title?: string
  capacity?: string
  price1?: string
  price2?: string
  price3?: string
  price4?: string
  quantity?: string
}

const norm = (value: unknown) => String(value ?? '').trim()
const fold = (value: unknown) => norm(value).toLocaleLowerCase('en-US')
const words = (value: unknown) => new Set(fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/u).filter(Boolean))
const similarity = (a: unknown, b: unknown) => {
  const aa = words(a), bb = words(b)
  if (!aa.size || !bb.size) return 0
  let common = 0
  for (const token of aa) if (bb.has(token)) common++
  return (2 * common) / (aa.size + bb.size)
}
const strippedZero = (sku: string) => sku.replace(/^0+(?=\d)/u, '')
const money = (value: unknown) => Number(value ?? 0)
const iso = (value: Date) => value.toISOString()

async function main() {
  const { prisma } = await import('../lib/prisma')
  const fingerprint = async () => (await prisma.$queryRawUnsafe<Array<{ count: number; fingerprint: string; externalIds: number }>>(
    `SELECT COUNT(*)::int count,
            md5(COALESCE(string_agg(row_to_json(p)::text, '' ORDER BY p.id), '')) fingerprint,
            COUNT(*) FILTER (WHERE "externalId" IS NOT NULL)::int "externalIds"
       FROM "Product" p`,
  ))[0]

  try {
    const before = { product: await fingerprint(), syncRuns: await prisma.syncRun.count() }
    const xmlText = readFileSync('export.xml', 'utf8')
    const parsed = new XMLParser({ parseTagValue: false, processEntities: false, isArray: name => name === 'item' }).parse(xmlText)
    const xmlItems: XmlItem[] = parsed.root?.item ?? []
    const products = await prisma.product.findMany({
      select: {
        id: true, sku: true, title: true, titleEn: true, titleLv: true, isActive: true, isDeleted: true,
        price: true, stock: true, category: true, brand: true, barcode: true, createdAt: true, updatedAt: true,
        image: true, images: true, manufacturerName: true, externalId: true,
      },
    })

    const live = products.filter(p => !p.isDeleted)
    const xmlBySku = new Map<string, XmlItem[]>()
    const xmlByFold = new Map<string, XmlItem[]>()
    for (const item of xmlItems) {
      const sku = norm(item.sku)
      if (!sku) continue
      xmlBySku.set(sku, [...(xmlBySku.get(sku) ?? []), item])
      xmlByFold.set(fold(sku), [...(xmlByFold.get(fold(sku)) ?? []), item])
    }
    const dbBySku = new Map<string, typeof live>()
    const dbByFold = new Map<string, typeof live>()
    for (const product of live) {
      const sku = norm(product.sku)
      if (!sku) continue
      dbBySku.set(sku, [...(dbBySku.get(sku) ?? []), product])
      dbByFold.set(fold(sku), [...(dbByFold.get(fold(sku)) ?? []), product])
    }

    const presentDuplicateSkus = [...dbBySku]
      .filter(([sku, rows]) => rows.length > 1 && xmlBySku.has(sku))
      .map(([sku]) => sku)
      .sort()

    const productView = (p: (typeof products)[number]) => ({
      id: p.id, sku: p.sku, name: p.title, titleEn: p.titleEn, titleLv: p.titleLv,
      isActive: p.isActive, isDeleted: p.isDeleted, status: p.isDeleted ? 'deleted' : p.isActive ? 'active' : 'inactive',
      price: money(p.price), stock: p.stock, category: p.category, brand: p.brand, barcode: p.barcode,
      createdAt: iso(p.createdAt), updatedAt: iso(p.updatedAt), hasImages: Boolean(p.image || p.images.length),
      manufacturerName: p.manufacturerName, externalId: p.externalId,
    })
    const xmlView = (x: XmlItem) => ({
      sku: norm(x.sku), name: norm(x.title), brand: null, barcode: norm(x.code) || null,
      capacity: norm(x.capacity) || null,
      prices: { price1: money(x.price1), price2: money(x.price2), price3: money(x.price3), price4: money(x.price4) },
      stock: money(x.quantity),
    })

    const duplicateGroups = presentDuplicateSkus.map(sku => {
      const xml = xmlBySku.get(sku)![0]
      const rows = dbBySku.get(sku)!
      const scored = rows.map(p => {
        const titleScore = Math.max(similarity(xml.title, p.title), similarity(xml.title, p.titleEn), similarity(xml.title, p.titleLv))
        const barcodeMatch = Boolean(norm(xml.code) && norm(p.barcode) && norm(xml.code) === norm(p.barcode))
        const priceMatch = Math.abs(money(xml.price2) - money(p.price)) < 0.005
        const brandMention = Boolean(p.brand && fold(xml.title).includes(fold(p.brand)))
        return { p, titleScore, barcodeMatch, priceMatch, brandMention, score: (barcodeMatch ? 100 : 0) + titleScore * 30 + (priceMatch ? 15 : 0) + (brandMention ? 5 : 0) }
      }).sort((a, b) => b.score - a.score)
      const best = scored[0], second = scored[1]
      const uniqueBarcode = scored.filter(x => x.barcodeMatch).length === 1
      let confidence: 'HIGH' | 'MEDIUM' | 'AMBIGUOUS' = 'AMBIGUOUS'
      let proposedProductId: string | null = null
      let reason = 'Недостаточно независимых признаков для однозначного выбора.'
      if (best && uniqueBarcode && (best.titleScore >= 0.25 || best.priceMatch)) {
        confidence = 'HIGH'; proposedProductId = best.p.id
        reason = `Уникальное точное совпадение barcode/EAN${best.priceMatch ? ', цены' : ''}${best.titleScore >= 0.25 ? ' и названия' : ''}.`
      } else if (best && best.titleScore >= 0.65 && best.priceMatch && best.score - (second?.score ?? 0) >= 8) {
        confidence = 'MEDIUM'; proposedProductId = best.p.id
        reason = 'Лучшее совпадение названия и цены заметно сильнее альтернативы, но нет уникального EAN.'
      }
      const statuses = new Set(rows.map(p => p.isActive ? 'active' : 'inactive'))
      const sameTitles = new Set(rows.map(p => fold(p.title))).size === 1
      const classification = statuses.size > 1 ? 'active + inactive duplicate'
        : rows.every(p => p.isActive) ? (sameTitles ? 'practically identical active records' : 'two active records / possible variants')
          : (sameTitles ? 'practically identical inactive records' : 'inactive records / possible variants')
      return {
        issueType: 'DUPLICATE_SKU_IN_GRINS', sku, xml: xmlView(xml), products: rows.map(productView), classification,
        proposedProductId, confidence, reason,
        evidence: scored.map(x => ({ productId: x.p.id, barcodeMatch: x.barcodeMatch, priceMatch: x.priceMatch, titleSimilarity: Number(x.titleScore.toFixed(3)), brandMention: x.brandMention })),
      }
    })

    const caseOnly = [...dbByFold.entries()].flatMap(([key, rows]) => {
      const feeds = xmlByFold.get(key) ?? []
      if (!feeds.length) return []
      return rows.filter(p => !xmlBySku.has(norm(p.sku))).map(p => {
        const alternatives = feeds.filter(x => norm(x.sku) !== norm(p.sku))
        const xml = alternatives.length === 1 ? alternatives[0] : feeds[0]
        const exactDbConflict = (dbBySku.get(norm(xml.sku)) ?? []).length
        const barcodeMatch = Boolean(norm(xml.code) && norm(p.barcode) && norm(xml.code) === norm(p.barcode))
        const titleScore = Math.max(similarity(xml.title, p.title), similarity(xml.title, p.titleEn), similarity(xml.title, p.titleLv))
        const brandMention = Boolean(p.brand && fold(xml.title).includes(fold(p.brand)))
        const priceMatch = Math.abs(money(xml.price2) - money(p.price)) < 0.005
        const safe = feeds.length === 1 && rows.length === 1 && exactDbConflict === 0 && (barcodeMatch || (titleScore >= 0.65 && priceMatch))
        return {
          issueType: safe ? 'CASE_SAFE_CANDIDATE' : 'CASE_REVIEW', xml: xmlView(xml), product: productView(p),
          proposedProductId: safe ? p.id : null, confidence: safe ? (barcodeMatch ? 'HIGH' : 'MEDIUM') : 'AMBIGUOUS',
          reason: safe ? `${barcodeMatch ? 'EAN совпадает; ' : ''}единственная пара после case-folding, конфликтующей точной DB-записи нет${priceMatch ? ', цена совпадает' : ''}.`
            : `Только регистр совпадает, но подтверждение недостаточно (feed variants=${feeds.length}, DB variants=${rows.length}, exact DB conflicts=${exactDbConflict}, title similarity=${titleScore.toFixed(3)}).`,
          evidence: { differsOnlyByCase: fold(p.sku) === fold(xml.sku) && norm(p.sku) !== norm(xml.sku), barcodeMatch, priceMatch, titleSimilarity: Number(titleScore.toFixed(3)), brandMention, exactDbConflict },
        }
      })
    }).sort((a, b) => a.xml.sku.localeCompare(b.xml.sku))

    const leadingZero = live.filter(p => {
      const sku = norm(p.sku)
      return /^0\d/u.test(sku) && (dbBySku.get(sku)?.length === 1) && (xmlBySku.get(sku)?.length === 1)
    }).map(p => {
      const sku = norm(p.sku), xml = xmlBySku.get(sku)![0], without = strippedZero(sku)
      const dbAlternatives = dbBySku.get(without) ?? [], xmlAlternatives = xmlBySku.get(without) ?? []
      const safe = dbAlternatives.length === 0 && xmlAlternatives.length === 0
      return {
        issueType: safe ? 'LEADING_ZERO_SAFE_CANDIDATE' : 'LEADING_ZERO_REVIEW', xml: xmlView(xml), product: productView(p),
        proposedProductId: safe ? p.id : null, confidence: safe ? 'HIGH' : 'AMBIGUOUS',
        reason: safe ? 'SKU строго равны как строки; вариант без ведущих нулей отсутствует с обеих сторон.' : `Есть вариант без ведущих нулей: ${without}.`,
        evidence: { exactStringEquality: sku === norm(xml.sku), withoutLeadingZeros: without, dbAlternativeIds: dbAlternatives.map(x => x.id), xmlAlternativeSkus: xmlAlternatives.map(x => norm(x.sku)) },
      }
    }).sort((a, b) => a.xml.sku.localeCompare(b.xml.sku))

    const duplicateIds = new Set(duplicateGroups.flatMap(g => g.products.map(p => p.id)))
    const caseIds = new Set(caseOnly.map(x => x.product.id))
    const leadingIds = new Set(leadingZero.map(x => x.product.id))
    const intersections = {
      duplicateAndCaseOnly: [...duplicateIds].filter(id => caseIds.has(id)),
      duplicateAndLeadingZero: [...duplicateIds].filter(id => leadingIds.has(id)),
      caseOnlyAndLeadingZero: [...caseIds].filter(id => leadingIds.has(id)),
      allThree: [...duplicateIds].filter(id => caseIds.has(id) && leadingIds.has(id)),
    }
    const uniqueReviewIds = new Set([...duplicateIds, ...caseIds, ...leadingIds])
    const noSkuAll = products.filter(p => !norm(p.sku))
    const noSku = {
      totalIncludingDeleted: noSkuAll.length, nonDeletedTotal: noSkuAll.filter(p => !p.isDeleted).length,
      active: noSkuAll.filter(p => p.isActive && !p.isDeleted).length,
      inactive: noSkuAll.filter(p => !p.isActive && !p.isDeleted).length, deleted: noSkuAll.filter(p => p.isDeleted).length,
      withBarcode: noSkuAll.filter(p => norm(p.barcode)).length, withoutBarcode: noSkuAll.filter(p => !norm(p.barcode)).length,
      nonDeletedWithBarcode: noSkuAll.filter(p => !p.isDeleted && norm(p.barcode)).length,
      nonDeletedWithoutBarcode: noSkuAll.filter(p => !p.isDeleted && !norm(p.barcode)).length,
      deletedWithBarcode: noSkuAll.filter(p => p.isDeleted && norm(p.barcode)).length,
    }
    const after = { product: await fingerprint(), syncRuns: await prisma.syncRun.count() }
    const summary = {
      duplicateGroups: duplicateGroups.length,
      duplicateRows: duplicateGroups.reduce((n, g) => n + g.products.length, 0),
      duplicateConfidence: { HIGH: duplicateGroups.filter(x => x.confidence === 'HIGH').length, MEDIUM: duplicateGroups.filter(x => x.confidence === 'MEDIUM').length, AMBIGUOUS: duplicateGroups.filter(x => x.confidence === 'AMBIGUOUS').length },
      caseOnly: caseOnly.length, caseSafeCandidate: caseOnly.filter(x => x.issueType === 'CASE_SAFE_CANDIDATE').length, caseReview: caseOnly.filter(x => x.issueType === 'CASE_REVIEW').length,
      leadingZero: leadingZero.length, leadingZeroSafeCandidate: leadingZero.filter(x => x.issueType === 'LEADING_ZERO_SAFE_CANDIDATE').length, leadingZeroReview: leadingZero.filter(x => x.issueType === 'LEADING_ZERO_REVIEW').length,
      uniqueReviewProducts: uniqueReviewIds.size,
      potentiallyPromotable: duplicateGroups.filter(x => x.confidence !== 'AMBIGUOUS').length + caseOnly.filter(x => x.issueType === 'CASE_SAFE_CANDIDATE').length + leadingZero.filter(x => x.issueType === 'LEADING_ZERO_SAFE_CANDIDATE').length,
      manualDecisionRequired: duplicateGroups.filter(x => x.confidence === 'AMBIGUOUS').length + caseOnly.filter(x => x.issueType === 'CASE_REVIEW').length + leadingZero.filter(x => x.issueType === 'LEADING_ZERO_REVIEW').length,
      originalSafeCandidates: 3348,
      originalSafeReduced: false,
    }
    const reviewRows = [
      ...duplicateGroups.flatMap(group => group.products.map(product => ({
        issueType: group.issueType, xmlSku: group.xml.sku, xmlName: group.xml.name,
        productId: product.id, productSku: product.sku, productName: product.name, productStatus: product.status,
        proposedProductId: group.proposedProductId, confidence: group.confidence, reason: group.reason,
      }))),
      ...caseOnly.map(item => ({
        issueType: item.issueType, xmlSku: item.xml.sku, xmlName: item.xml.name,
        productId: item.product.id, productSku: item.product.sku, productName: item.product.name, productStatus: item.product.status,
        proposedProductId: item.proposedProductId, confidence: item.confidence, reason: item.reason,
      })),
      ...leadingZero.map(item => ({
        issueType: item.issueType, xmlSku: item.xml.sku, xmlName: item.xml.name,
        productId: item.product.id, productSku: item.product.sku, productName: item.product.name, productStatus: item.product.status,
        proposedProductId: item.proposedProductId, confidence: item.confidence, reason: item.reason,
      })),
    ]
    const report = {
      generatedAt: new Date().toISOString(), source: { file: 'export.xml', sha256: createHash('sha256').update(xmlText).digest('hex') },
      readOnly: true, summary, intersections, noSku, before, after, reviewRows, duplicateGroups, caseOnly, leadingZero,
    }
    writeFileSync('external-id-review-audit.json', JSON.stringify(report, null, 2) + '\n')

    const lines: string[] = ['# ExternalId REVIEW audit', '', `Generated: ${report.generatedAt}`, '', '## Summary', '', '```json', JSON.stringify({ summary, intersections, noSku, before, after }, null, 2), '```', '', '## Duplicate SKU groups', '']
    for (const g of duplicateGroups) {
      lines.push(`### SKU: ${g.sku}`, '', `GrinS: ${g.xml.name || '(no title)'} | EAN ${g.xml.barcode ?? '—'} | prices ${Object.values(g.xml.prices).join('/')} | stock ${g.xml.stock}`, '', 'Hairshoppro:')
      for (const p of g.products) lines.push(`- ${p.id} | ${p.status} | ${p.name} | ${p.brand}/${p.category} | EAN ${p.barcode ?? '—'} | price ${p.price} | stock ${p.stock} | images ${p.hasImages} | ${p.createdAt} / ${p.updatedAt}`)
      lines.push('', `Classification: ${g.classification}`, `Proposed: ${g.proposedProductId ?? 'none'}`, `Confidence: ${g.confidence}`, `Reason: ${g.reason}`, '')
    }
    lines.push('## Case-only', '', ...caseOnly.map(x => `- ${x.product.sku} ↔ ${x.xml.sku} | ${x.issueType} | ${x.confidence} | ${x.proposedProductId ?? 'none'} | ${x.reason}`), '', '## Leading zero', '', ...leadingZero.map(x => `- ${x.product.sku} ↔ ${x.xml.sku} | ${x.issueType} | ${x.confidence} | ${x.proposedProductId ?? 'none'} | ${x.reason}`), '')
    writeFileSync('external-id-review-audit.md', lines.join('\n'))
    console.log(JSON.stringify({ summary, intersections, noSku, before, after, outputs: ['external-id-review-audit.json', 'external-id-review-audit.md'] }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
