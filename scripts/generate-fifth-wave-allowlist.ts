import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { typedNormalizedRelation } from '../lib/sync/normalized-sku-matching'

config({ path: '.env.local' })
const EXPECTED_XML_SHA = '26c001368c79f9cfb9100d1cf67c0a0c479fe181f11e0b15c5944888f6517cad'
const EXPECTED_FINGERPRINT = '5cce6d1caafdaf2721c9632a441445e2'
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

async function main() {
  const { prisma } = await import('../lib/prisma')
  try {
    const [auditText, xml] = await Promise.all([readFile('fifth-wave-normalized-sku-audit.json', 'utf8'), readFile('export.xml', 'utf8')])
    if (sha256(xml) !== EXPECTED_XML_SHA) throw new Error('XML_SHA_DRIFT')
    const audit = JSON.parse(auditText) as { generatedAt: string; before: { productCount: number; externalIdCount: number; syncRunCount: number; fingerprint: string }; candidates: Array<Record<string, unknown> & { classification: string; productId: string; localSku: string; xmlSku: string; normalizationType: string; normalizedKey: string; productName: string; xmlName: string; productBarcode: string; xmlEan: string; productMeasures: string[]; brand: string; active: boolean; softDeleted: boolean; existingExternalId: string | null }> }
    const safe = audit.candidates.filter(candidate => candidate.classification === 'FIFTH_WAVE_SAFE_CANDIDATE')
    if (safe.length !== 24) throw new Error(`SAFE_SCOPE_DRIFT:${safe.length}`)
    if (audit.before.productCount !== 6378 || audit.before.externalIdCount !== 3526 || audit.before.syncRunCount !== 6 || audit.before.fingerprint !== EXPECTED_FINGERPRINT) throw new Error('AUDIT_BASELINE_DRIFT')
    const ids = safe.map(candidate => candidate.productId)
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, externalId: true, barcode: true, title: true, titleEn: true, titleLv: true, brand: true, category: true, description: true, technicalSpecs: true, specVolume: true, specType: true, image: true, images: true, isActive: true, isDeleted: true, createdAt: true, price: true, stock: true } })
    if (products.length !== 24) throw new Error(`PRODUCT_SCOPE_DRIFT:${products.length}`)
    const byId = new Map(products.map(product => [product.id, product]))
    const entries = safe.map(candidate => {
      const product = byId.get(candidate.productId)
      if (!product) throw new Error(`PRODUCT_MISSING:${candidate.productId}`)
      const relation = typedNormalizedRelation(product.sku ?? '', candidate.xmlSku)
      if (!relation || relation.type !== candidate.normalizationType || relation.normalizedKey !== candidate.normalizedKey) throw new Error(`NORMALIZATION_DRIFT:${candidate.productId}`)
      if (product.externalId !== null || product.isDeleted || product.sku !== candidate.localSku || product.title !== candidate.productName || (product.barcode ?? '') !== candidate.productBarcode) throw new Error(`PRODUCT_IDENTITY_DRIFT:${candidate.productId}`)
      return {
        productId: product.id,
        productSku: product.sku,
        xmlSku: candidate.xmlSku,
        externalIdToSet: candidate.xmlSku,
        normalizationType: candidate.normalizationType,
        normalizedKey: candidate.normalizedKey,
        productName: product.title,
        xmlName: candidate.xmlName,
        productBarcode: product.barcode,
        xmlEan: candidate.xmlEan || null,
        identityEvidence: { productMeasures: candidate.productMeasures, xmlMeasures: candidate.xmlMeasures, nameSimilarity: candidate.nameSimilarity, brandCompatible: (candidate.brandEvidence as { compatible: boolean | null }).compatible, structuralIdentityConfirmed: true },
        baseline: { externalId: null, isActive: product.isActive, isDeleted: product.isDeleted, brand: product.brand, category: product.category, title: product.title, titleEn: product.titleEn, titleLv: product.titleLv, description: product.description ?? '', technicalSpecs: product.technicalSpecs, specVolume: product.specVolume, specType: product.specType, image: product.image ?? '', images: product.images, createdAt: product.createdAt.toISOString(), price: Number(product.price), stock: product.stock },
      }
    })
    if (new Set(entries.map(entry => entry.productId)).size !== 24 || new Set(entries.map(entry => entry.externalIdToSet)).size !== 24 || new Set(entries.map(entry => entry.normalizedKey)).size !== 24) throw new Error('ALLOWLIST_UNIQUENESS_FAILED')
    const allowlist = { schemaVersion: 1, wave: 'fifth-wave-normalized-sku-safe', executable: true, generatedAt: new Date().toISOString(), sourceAudit: 'fifth-wave-normalized-sku-audit/v1', entryCount: 24, baseline: { productCount: 6378, externalIdCount: 3526, active: 2229, inactive: 4149, syncRunCount: 6, fingerprint: EXPECTED_FINGERPRINT }, xmlSha256: EXPECTED_XML_SHA, entries }
    await writeFile('fifth-wave-normalized-sku-allowlist.json', `${JSON.stringify(allowlist, null, 2)}\n`)
    console.log(JSON.stringify({ output: 'fifth-wave-normalized-sku-allowlist.json', entries: entries.length }, null, 2))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
