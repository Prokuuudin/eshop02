import { readFile, writeFile } from 'node:fs/promises'

async function main() {
const audit = JSON.parse(await readFile('fourth-wave-ean-audit.json', 'utf8')) as {
  generatedAt: string
  baseline: { before: { productCount:number; externalIdCount:number; fingerprint:string }; xmlSha256:string }
  candidates: Array<Record<string, unknown> & { classification:string; productId:string; barcode:string; xmlEan:string; xmlSku:string; productName:string; xmlName:string }>
}
const safe = audit.candidates.filter(candidate => candidate.classification === 'FOURTH_WAVE_SAFE_CANDIDATE')
if (safe.length !== 61) throw new Error(`SAFE_SCOPE_DRIFT:${safe.length}`)
const entries = safe.map(candidate => ({
  productId: candidate.productId,
  productBarcode: candidate.barcode,
  xmlEan: candidate.xmlEan,
  xmlSku: candidate.xmlSku,
  externalIdToSet: candidate.xmlSku,
  matchType: 'UNIQUE_EAN_SAFE',
  productName: candidate.productName,
  xmlName: candidate.xmlName,
  identityEvidence: {
    productBarcodeUnique: true,
    xmlEanUnique: true,
    xmlSkuUnique: true,
    nameVariantConfirmed: true,
  },
  protectedProductBaseline: {
    isActive: candidate.active,
    title: candidate.productName,
    brand: candidate.productBrand,
    category: candidate.productCategory,
    description: candidate.description,
    technicalSpecs: candidate.technicalSpecs,
    image: candidate.image,
    imageCount: candidate.imageCount,
    createdAt: candidate.createdAt,
  },
}))
const allowlist = {
  schemaVersion: 1,
  wave: 'fourth-wave-unique-ean-safe',
  generatedAt: audit.generatedAt,
  sourceAudit: 'fourth-wave-ean-audit/v1',
  matchType: 'UNIQUE_EAN_SAFE',
  entryCount: entries.length,
  baseline: {
    productCount: audit.baseline.before.productCount,
    externalIdCount: audit.baseline.before.externalIdCount,
    fingerprint: audit.baseline.before.fingerprint,
  },
  xmlSha256: audit.baseline.xmlSha256,
  entries,
}
await writeFile('fourth-wave-ean-allowlist.json', JSON.stringify(allowlist, null, 2) + '\n')
console.log(JSON.stringify({ output:'fourth-wave-ean-allowlist.json', entries:entries.length }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
