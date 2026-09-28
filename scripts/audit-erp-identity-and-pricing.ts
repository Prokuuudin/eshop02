/**
 * READ-ONLY audit. Writes JSON reports only; never writes to the database.
 *
 *  1. externalId links made by SKU-only matching (first-wave EXACT_SAFE /
 *     LEADING_ZERO_EXACT_SAFE, second-wave CASE_ONLY_SAFE, fifth-wave normalized SKU):
 *     CONFIRMED / SUSPICIOUS / WRONG / UNVERIFIABLE from EAN, title, brand, volume,
 *     retail price and variant evidence.
 *  2. Active nopCommerce grouped parents without a trustworthy externalId whose variants
 *     exist in the ERP feed (A: same price2, B: different price2, C: ambiguous).
 *  3. Active linked Products whose ERP price2 is 0 (legacy price kept by the sync guard).
 *
 * Env: NOP_MSSQL_SERVER, NOP_MSSQL_DATABASE (legacy nopCommerce backup), optional NOP_SQLCMD
 * (sqlcmd binary, default `sqlcmd` on PATH). Reads ./export.xml and the committed wave
 * allowlists. Output goes to --out, outside the repository.
 *
 * Run: npx tsx scripts/audit-erp-identity-and-pricing.ts --out <dir>
 */
import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { XMLParser } from 'fast-xml-parser'
import { config } from 'dotenv'

config({ path: '.env.local' })

const requireEnv = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value }
const outArg = process.argv.indexOf('--out')
const OUT: string = outArg > 0 && process.argv[outArg + 1] ? process.argv[outArg + 1] : (() => { throw new Error('--out <dir> is required') })()

type ErpItem = { sku: string; code: string; title: string; capacity: number; price1: number; price2: number; price3: number; price4: number; quantity: number }
type NopItem = { id: string; sku: string; gtin: string; name: string; price: number; parent: string; deleted: boolean; published: boolean }

function loadErp(): Map<string, ErpItem> {
  const parser = new XMLParser({ ignoreAttributes: false, isArray: name => name === 'item', parseTagValue: false, processEntities: false })
  const items = (parser.parse(readFileSync('export.xml', 'utf8')) as { root: { item: Array<Record<string, unknown>> } }).root.item
  const num = (value: unknown) => { const n = Number(String(value ?? '').trim()); return Number.isFinite(n) ? n : 0 }
  return new Map(items.map(item => {
    const sku = String(item.sku ?? '').trim()
    return [sku, { sku, code: String(item.code ?? '').trim(), title: String(item.title ?? '').replace(/&amp;quot;|&quot;/g, '"').replace(/&amp;/g, '&'), capacity: num(item.capacity), price1: num(item.price1), price2: num(item.price2), price3: num(item.price3), price4: num(item.price4), quantity: num(item.quantity) }]
  }))
}

function loadNop(): Map<string, NopItem> {
  const out = execFileSync(process.env.NOP_SQLCMD ?? 'sqlcmd', ['-S', requireEnv('NOP_MSSQL_SERVER'), '-d', requireEnv('NOP_MSSQL_DATABASE'), '-C', '-W', '-s', '\t', '-h', '-1', '-f', '65001', '-Q',
    "SET NOCOUNT ON; SELECT Id, ISNULL(Sku,''), ISNULL(Gtin,''), REPLACE(REPLACE(ISNULL(Name,''),CHAR(9),' '),CHAR(10),' '), Price, ParentGroupedProductId, Deleted, Published FROM Product"],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const map = new Map<string, NopItem>()
  for (const line of out.split(/\r?\n/)) {
    const [id, sku, gtin, name, price, parent, deleted, published] = line.split('\t').map(value => value?.trim() ?? '')
    if (!/^\d+$/.test(id)) continue
    map.set(id, { id, sku, gtin, name, price: Math.round(Number(price) * 1.21 * 100) / 100, parent, deleted: deleted === '1', published: published === '1' })
  }
  return map
}

const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const STOP = new Set(['the', 'and', 'for', 'with', 'ar', 'un', 'par', 'new', 'pro', 'professional', 'ml', 'gr', 'pcs', 'gab', 'matu', 'hair', 'wiht'])
function tokens(value: string, exclude: Set<string> = new Set()): Set<string> {
  return new Set(fold(value).split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !/^\d+$/.test(token) && !STOP.has(token) && !exclude.has(token)))
}
function volumesMl(value: string): number[] {
  const out: number[] = []
  for (const match of fold(value).matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|l|g|gr|kg|мл|л|г)\b/g)) {
    const n = Number(match[1].replace(',', '.'))
    const unit = match[2]
    out.push(unit === 'l' || unit === 'л' || unit === 'kg' ? n * 1000 : n)
  }
  return out
}
const isRealEan = (value: string) => /^\d{8,14}$/.test(value) && !/^2/.test(value.padStart(13, '0'))

// Word-prefix matches on folded text (so 'bon' cannot hit 'Bonacure').
const SERVICE_WORDS = ['katalog', 'catalog', 'tester', 'paraug', 'sample', 'stend', 'display', 'davan', 'gift', 'komplekt', 'pakalpojum', 'piegad', 'kupon', 'voucher', 'reklam', 'buklet', 'plakat', 'maisin', 'iepakojum', 'aksesuar', 'depozit']
const hasServiceWord = (text: string) => SERVICE_WORDS.filter(word => new RegExp(`(^|[^a-z0-9])${word}`).test(fold(text)))

async function main() {
  const { prisma } = await import('@/lib/prisma')
  try {
    const erp = loadErp()
    const nop = loadNop()
    type Row = { id: string; sku: string | null; externalId: string | null; barcode: string | null; title: string; titleEn: string | null; titleLv: string | null; metaTitle: string | null; brand: string; category: string; specVolume: string | null; price: string; oldPrice: string | null; stock: number; isActive: boolean; isDeleted: boolean; variantGroups: string | null }
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, sku, "externalId", barcode, title, "titleEn", "titleLv", "metaTitle", brand, category, "specVolume", price::text price, "oldPrice"::text "oldPrice", stock, "isActive", "isDeleted", "technicalSpecs"->>'__variantGroupsJson' "variantGroups" FROM "Product"`)
    const byId = new Map(rows.map(row => [row.id, row]))

    // ── 1. SKU-only links ────────────────────────────────────────────────
    const sources: Array<{ file: string; wave: string }> = [
      { file: 'first-wave-external-id-allowlist.json', wave: 'first' },
      { file: 'second-wave-case-only-allowlist.json', wave: 'second' },
      { file: 'fifth-wave-normalized-sku-allowlist.json', wave: 'fifth' },
    ]
    const links: Array<{ productId: string; externalId: string; wave: string; matchType: string }> = []
    for (const { file, wave } of sources) {
      const entries = (JSON.parse(readFileSync(file, 'utf8')) as { entries: Array<Record<string, string>> }).entries
      for (const entry of entries) links.push({ productId: entry.productId, externalId: entry.externalIdToSet, wave, matchType: entry.matchType ?? entry.normalizationType ?? 'SKU' })
    }

    const identity = new Map<string, { classification: string; signals: string[] }>()
    const linkReport = links.map(link => {
      const product = byId.get(link.productId)
      const item = erp.get(link.externalId)
      const source = nop.get(link.productId)
      const signals: string[] = []
      const support: string[] = [], strong: string[] = [], weak: string[] = []
      if (!product) return { ...link, classification: 'UNVERIFIABLE', signals: ['product_missing'] }
      if (product.externalId !== link.externalId) signals.push(`current_externalId=${product.externalId}`)
      if (!item) return { ...link, classification: 'UNVERIFIABLE', signals: [...signals, 'erp_item_missing_in_export'] }

      const localCodes = [product.barcode ?? '', source?.gtin ?? ''].filter(Boolean)
      if (item.code && localCodes.length) {
        if (localCodes.some(code => code === item.code)) (isRealEan(item.code) ? support : weak).push(isRealEan(item.code) ? 'ean_match' : 'internal_code_match_only')
        else if (isRealEan(item.code) && localCodes.some(isRealEan)) strong.push(`ean_conflict(${localCodes.join('/')}≠${item.code})`)
      }
      const brandTokens = tokens(product.brand)
      const erpTitle = fold(item.title)
      const brandPresent = [...brandTokens].some(token => erpTitle.includes(token))
      if (brandTokens.size && !brandPresent) weak.push('brand_absent_in_erp_title')
      const localText = [source?.name ?? '', product.titleEn ?? '', product.titleLv ?? '', product.metaTitle ?? ''].join(' ')
      const a = tokens(localText, brandTokens), b = tokens(item.title, brandTokens)
      const overlap = [...b].filter(token => a.has(token)).length
      const similarity = b.size && a.size ? overlap / Math.min(a.size, b.size) : null
      if (similarity === null || b.size < 1) weak.push('erp_title_uninformative')
      else if (similarity >= 0.4) support.push(`title_overlap=${similarity.toFixed(2)}`)
      else if (overlap === 0 && b.size >= 2) strong.push(`title_no_overlap(erp:${[...b].slice(0, 4).join(',')})`)
      else weak.push(`title_low_overlap=${similarity.toFixed(2)}`)
      const localVol = [...volumesMl(product.specVolume ?? ''), ...volumesMl(source?.name ?? '')]
      const erpVol = volumesMl(item.title)
      if (localVol.length && erpVol.length) {
        if (localVol.some(v => erpVol.some(w => Math.abs(v - w) <= Math.max(1, v * 0.02)))) support.push('volume_match')
        else strong.push(`volume_conflict(${localVol[0]}≠${erpVol[0]})`)
      }
      if (source && source.price > 0 && item.price1 > 0) {
        const ratio = Math.max(source.price, item.price1) / Math.min(source.price, item.price1)
        if (ratio > 2.5) weak.push(`retail_price_conflict(nop ${source.price} vs price1 ${item.price1})`)
        else if (ratio <= 1.35) support.push('retail_price_close')
      }
      // Pricing trait, not identity evidence — reported, never used for classification.
      const info: string[] = []
      if (item.price1 === 0 && item.price2 === 0) info.push('erp_all_prices_zero')
      const localIsService = hasServiceWord(localText).length > 0
      if (!localIsService && /katalog|catalog/.test(erpTitle)) strong.push('erp_item_is_catalog')
      let multiVariant = false
      if (product.variantGroups && product.variantGroups.includes('"options"')) {
        const options = (() => { try { return (JSON.parse(product.variantGroups) as Array<{ options: unknown[] }>).reduce((n, g) => n + g.options.length, 0) } catch { return 0 } })()
        if (options >= 2) { multiVariant = true; weak.push(`multi_variant_card(${options} options → one ERP sku)`) }
      }
      const eanMatch = support.includes('ean_match')
      const titleMatch = support.some(s => s.startsWith('title_overlap'))
      const volumeConflict = strong.some(s => s.startsWith('volume_conflict'))
      const titleNone = strong.some(s => s.startsWith('title_no_overlap'))
      let classification: string
      if (!eanMatch && titleNone && (strong.length >= 2 || weak.length >= 1)) classification = 'WRONG'
      else if (eanMatch && !volumeConflict && !multiVariant) classification = 'CONFIRMED'
      else if (titleMatch && strong.length === 0 && !multiVariant && (brandPresent || support.length >= 2)) classification = 'CONFIRMED'
      else if (strong.length || weak.length) classification = 'SUSPICIOUS'
      else classification = 'UNVERIFIABLE'
      if (eanMatch && volumeConflict) signals.push('note:same_ean_volume_drift')
      signals.push(...info.map(s => `info:${s}`))
      identity.set(link.productId, { classification, signals: [...support.map(s => `+${s}`), ...strong.map(s => `!!${s}`), ...weak.map(s => `!${s}`)] })
      return {
        ...link, classification, isActive: product.isActive, isDeleted: product.isDeleted,
        product: { title: product.title, nopName: source?.name, brand: product.brand, category: product.category, barcode: product.barcode, nopGtin: source?.gtin, price: product.price },
        erp: { title: item.title, code: item.code, capacity: item.capacity, price1: item.price1, price2: item.price2, stock: item.quantity },
        signals: [...signals, ...support.map(s => `+${s}`), ...strong.map(s => `!!${s}`), ...weak.map(s => `!${s}`)],
      }
    })
    const count = (list: Array<{ classification: string; isActive?: boolean }>) => {
      const out: Record<string, { total: number; active: number }> = {}
      for (const row of list) { out[row.classification] ??= { total: 0, active: 0 }; out[row.classification].total++; if (row.isActive) out[row.classification].active++ }
      return out
    }

    // ── 2. Grouped parents ───────────────────────────────────────────────
    const childrenOf = new Map<string, NopItem[]>()
    for (const item of nop.values()) if (item.parent !== '0' && !item.deleted) childrenOf.set(item.parent, [...(childrenOf.get(item.parent) ?? []), item])
    const parentReport = [...childrenOf].flatMap(([parentId, children]) => {
      const parent = byId.get(parentId)
      if (!parent || parent.isDeleted || !parent.isActive) return []
      const parentIdentity = identity.get(parentId)?.classification
      const parentTrusted = parent.externalId && erp.has(parent.externalId) && parentIdentity !== 'WRONG' && parentIdentity !== 'SUSPICIOUS'
      if (parentTrusted) return []
      const variants = children.map(child => {
        const row = byId.get(child.id)
        const item = row?.externalId ? erp.get(row.externalId) : undefined
        return { productId: child.id, nopSku: child.sku, nopName: child.name.slice(0, 70), externalId: row?.externalId ?? null, erpSku: item?.sku ?? null, price2: item?.price2 ?? null, isActive: row?.isActive ?? null, isDeleted: row?.isDeleted ?? null, identity: identity.get(child.id)?.classification ?? (row?.externalId ? 'linked_other_wave' : 'unlinked') }
      })
      const mapped = variants.filter(v => v.erpSku && !v.isDeleted && v.identity !== 'WRONG' && v.identity !== 'SUSPICIOUS')
      if (mapped.length === 0) return []
      const prices = [...new Set(mapped.map(v => v.price2))]
      const ambiguous = mapped.length !== variants.length || mapped.some(v => !(Number(v.price2) > 0))
      const group = ambiguous ? 'C' : prices.length === 1 ? 'A' : 'B'
      return [{ group, parentId, sku: parent.sku, externalId: parent.externalId, parentIdentity: parentIdentity ?? null, title: parent.title, price: parent.price, oldPrice: parent.oldPrice, variantOptionsInCard: parent.variantGroups ? 'yes' : 'no', variants, uniformPrice2: prices.length === 1, price2Values: prices, ambiguityReason: ambiguous ? (mapped.length !== variants.length ? 'not_all_variants_mapped' : 'variant_price2_zero') : null }]
    })
    // Attribute-variant cards (options inside one Product, no child Products) with an
    // untrustworthy link: listed as C — their ERP variants cannot be mapped without guessing.
    const attributeCards = rows.filter(row => row.isActive && !row.isDeleted && row.variantGroups && ['WRONG', 'SUSPICIOUS'].includes(identity.get(row.id)?.classification ?? '') && !childrenOf.has(row.id))
      .map(row => ({ group: 'C', parentId: row.id, sku: row.sku, externalId: row.externalId, parentIdentity: identity.get(row.id)?.classification, title: row.title, price: row.price, oldPrice: row.oldPrice, variantOptionsInCard: 'yes', variants: [], uniformPrice2: null, price2Values: [], ambiguityReason: 'attribute_variants_without_erp_mapping' }))

    // ── 3. price2 = 0, active, linked ────────────────────────────────────
    const zeroReport = rows.filter(row => row.isActive && !row.isDeleted && row.externalId && erp.has(row.externalId) && !(erp.get(row.externalId)!.price2 > 0)).map(row => {
      const item = erp.get(row.externalId!)!
      const source = nop.get(row.id)
      const text = fold(`${item.title} ${row.title} ${row.titleLv ?? ''}`)
      const flags = hasServiceWord(text).map(word => `keyword:${word}`)
      if (item.price1 === 0 && item.price2 === 0 && item.price3 <= 0.01) flags.push('erp_all_prices_zero_or_placeholder')
      if (item.quantity === 0) flags.push('erp_stock_zero')
      const idc = identity.get(row.id)
      if (idc && idc.classification !== 'CONFIRMED') flags.push(`identity:${idc.classification}`)
      const group = idc && ['WRONG', 'SUSPICIOUS'].includes(idc.classification) ? 'possible_wrong_link'
        : flags.some(f => f.startsWith('keyword:')) ? 'service_or_non_sale_item'
        : item.price1 > 0 ? 'retail_only_price_in_erp'
        : 'no_erp_price_at_all'
      return { group, id: row.id, sku: row.sku, externalId: row.externalId, title: row.title, erpTitle: item.title, category: row.category, price: row.price, oldPrice: row.oldPrice, legacyHairshopPrice: source?.price ?? null, erp: { price1: item.price1, price2: item.price2, price3: item.price3, price4: item.price4, stock: item.quantity }, stock: row.stock, identity: idc?.classification ?? 'not_sku_only_link', flags }
    })

    const summary = {
      generatedAt: new Date().toISOString(),
      skuOnlyLinks: { total: linkReport.length, byWave: Object.fromEntries(sources.map(s => [s.wave, count(linkReport.filter(r => r.wave === s.wave))])), all: count(linkReport) },
      parents: { A: parentReport.filter(p => p.group === 'A').length, B: parentReport.filter(p => p.group === 'B').length, C: parentReport.filter(p => p.group === 'C').length + attributeCards.length, C_attributeCards: attributeCards.length },
      price2Zero: { activeLinked: zeroReport.length, byGroup: zeroReport.reduce<Record<string, number>>((acc, r) => { acc[r.group] = (acc[r.group] ?? 0) + 1; return acc }, {}) },
    }
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, 'sku-only-links.json'), JSON.stringify(linkReport, null, 1))
    writeFileSync(join(OUT, 'parent-variants.json'), JSON.stringify([...parentReport, ...attributeCards], null, 1))
    writeFileSync(join(OUT, 'price2-zero-active.json'), JSON.stringify(zeroReport, null, 1))
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1))
    console.log(JSON.stringify(summary, null, 1))
    console.log(`\nReports in ${OUT}. No database writes were made.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exit(1) })
