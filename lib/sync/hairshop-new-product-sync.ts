import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'

const localizedTextSchema = z.object({
  default: z.string().max(200_000).optional(),
  ru: z.string().max(200_000).optional(),
  lv: z.string().max(200_000).optional(),
  en: z.string().max(200_000).optional(),
}).strict()

const hairshopImageUrlSchema = z.string().url().max(1_000).refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:'
    && url.hostname.toLowerCase() === 'hairshop.lv'
    && url.pathname.startsWith('/content/images/')
}, 'Only HTTPS hairshop.lv image URLs are accepted')

export const hairshopNewProductCandidateSchema = z.object({
  legacyProductId: z.number().int().positive(),
  sku: z.string().trim().min(1).max(200),
  ean: z.string().trim().max(100).nullable(),
  published: z.literal(true),
  titles: localizedTextSchema,
  descriptions: localizedTextSchema,
  metaTitles: localizedTextSchema.optional(),
  metaDescriptions: localizedTextSchema.optional(),
  categoryNames: z.array(z.string().trim().min(1).max(500)).max(50),
  manufacturerName: z.string().trim().max(500).nullable(),
  images: z.array(hairshopImageUrlSchema).max(50),
  createdOnUtc: z.string().datetime({ offset: true }),
  updatedOnUtc: z.string().datetime({ offset: true }),
}).strict()

export const hairshopCatalogSyncRequestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/u),
  mode: z.enum(['dry-run', 'apply']),
  products: z.array(hairshopNewProductCandidateSchema).min(1).max(100),
}).strict()

export type HairshopNewProductCandidate = z.infer<typeof hairshopNewProductCandidateSchema>
export type HairshopCatalogSyncRequest = z.infer<typeof hairshopCatalogSyncRequestSchema>

export type ExistingProductIdentity = {
  id: string
  externalId: string | null
  sku: string | null
  barcode: string | null
  isDeleted: boolean
}

export type HairshopSyncDecision = {
  legacyProductId: number
  sku: string
  ean: string | null
  targetProductId: string
  status: 'would_create' | 'created' | 'already_exists' | 'conflict'
  reasons: string[]
  matchedProductIds: string[]
  warnings: string[]
}

export const MANUAL_REVIEW_SKUS = new Set(['2468BR', '2368BR'])

export function normalizeSku(value: string | null | undefined): string {
  return String(value ?? '').trim().normalize('NFKC').toLocaleUpperCase('en-US')
}

export function normalizeEan(value: string | null | undefined): string {
  return String(value ?? '').trim().normalize('NFKC').toLocaleUpperCase('en-US').replace(/[\s-]+/gu, '')
}

export function targetProductId(legacyProductId: number): string {
  return `nop390-${legacyProductId}`
}

function normalizeCategoryName(value: string): string {
  return value.normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  { category: 'equipment', terms: ['instrument', 'equipment', 'tool', 'fen', 'dryer', 'airstyler', 'masina', 'machine', 'mebel', 'furniture', 'elektro'] },
  { category: 'nails', terms: ['nagu', 'nail', 'manikur', 'pedikur', 'gel lak', 'uv gel', 'nogt'] },
  { category: 'face', terms: ['sejai', 'face', 'make up', 'dekorativ', 'kosmetika lic', 'brov', 'resnic'] },
  { category: 'body', terms: ['kermen', 'body', 'vaks', 'solarij', 'parfim', 'perfum', 'smarza', 'ella', 'oil', 'rokam', 'kajam'] },
  { category: 'hair', terms: ['matu', 'hair', 'sampun', 'shampoo', 'kondicion', 'volos', 'barbershop'] },
]

export function mapLegacyCategory(categoryNames: string[]): { category: string; warning?: string } {
  const normalized = categoryNames.map(normalizeCategoryName)
  for (const rule of CATEGORY_RULES) {
    if (normalized.some(name => rule.terms.some(term => name.includes(term)))) {
      return { category: rule.category }
    }
  }
  return { category: 'uncategorized', warning: 'CATEGORY_UNRESOLVED' }
}

function preferred(values: HairshopNewProductCandidate['titles']): string {
  return values.ru?.trim()
    || values.default?.trim()
    || values.lv?.trim()
    || values.en?.trim()
    || ''
}

function identityMatches(candidate: HairshopNewProductCandidate, existing: ExistingProductIdentity[]): ExistingProductIdentity[] {
  const sku = normalizeSku(candidate.sku)
  const ean = normalizeEan(candidate.ean)
  const id = targetProductId(candidate.legacyProductId)
  return existing.filter(product => product.id === id
    || normalizeSku(product.sku) === sku
    || normalizeSku(product.externalId) === sku
    || (ean !== '' && normalizeEan(product.barcode) === ean))
}

export function planHairshopNewProducts(
  candidates: HairshopNewProductCandidate[],
  existing: ExistingProductIdentity[],
): { decisions: HairshopSyncDecision[]; insertable: HairshopNewProductCandidate[] } {
  const skuCounts = new Map<string, number>()
  const eanCounts = new Map<string, number>()
  const idCounts = new Map<number, number>()
  for (const candidate of candidates) {
    const sku = normalizeSku(candidate.sku)
    const ean = normalizeEan(candidate.ean)
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
    if (ean) eanCounts.set(ean, (eanCounts.get(ean) ?? 0) + 1)
    idCounts.set(candidate.legacyProductId, (idCounts.get(candidate.legacyProductId) ?? 0) + 1)
  }

  const insertable: HairshopNewProductCandidate[] = []
  const decisions = candidates.map(candidate => {
    const sku = normalizeSku(candidate.sku)
    const ean = normalizeEan(candidate.ean)
    const targetId = targetProductId(candidate.legacyProductId)
    const matches = identityMatches(candidate, existing)
    const matchedIds = [...new Set(matches.map(product => product.id))].sort()
    const reasons: string[] = []
    const category = mapLegacyCategory(candidate.categoryNames)
    const warnings = [
      ...(category.warning ? [category.warning] : []),
      ...(!candidate.manufacturerName ? ['MANUFACTURER_MISSING'] : []),
      ...(candidate.images.length === 0 ? ['IMAGES_MISSING'] : []),
      ...(!candidate.titles.ru ? ['RU_TITLE_FALLBACK_USED'] : []),
      ...(!candidate.titles.lv ? ['LV_TITLE_MISSING'] : []),
      ...(!candidate.titles.en ? ['EN_TITLE_MISSING'] : []),
    ]

    if (MANUAL_REVIEW_SKUS.has(sku)) reasons.push('EXPLICIT_MANUAL_REVIEW_SKU')
    if ((skuCounts.get(sku) ?? 0) > 1) reasons.push('DUPLICATE_SOURCE_SKU')
    if (ean && (eanCounts.get(ean) ?? 0) > 1) reasons.push('DUPLICATE_SOURCE_EAN')
    if ((idCounts.get(candidate.legacyProductId) ?? 0) > 1) reasons.push('DUPLICATE_SOURCE_LEGACY_ID')

    const targetMatch = matches.find(product => product.id === targetId)
    if (matches.some(product => product.isDeleted)) reasons.push('SOFT_DELETED_IDENTITY_CLAIM')
    if (matchedIds.length > 1) reasons.push('AMBIGUOUS_EXISTING_IDENTITIES')
    if (targetMatch && (
      normalizeSku(targetMatch.sku) !== sku
      || (targetMatch.externalId !== null && normalizeSku(targetMatch.externalId) !== sku)
      || (ean !== '' && targetMatch.barcode !== null && normalizeEan(targetMatch.barcode) !== ean)
    )) reasons.push('TARGET_IDENTITY_CONFLICT')

    if (reasons.length > 0) {
      return {
        legacyProductId: candidate.legacyProductId,
        sku: candidate.sku,
        ean: candidate.ean,
        targetProductId: targetId,
        status: 'conflict' as const,
        reasons: [...new Set(reasons)],
        matchedProductIds: matchedIds,
        warnings,
      }
    }

    if (matchedIds.length === 1) {
      return {
        legacyProductId: candidate.legacyProductId,
        sku: candidate.sku,
        ean: candidate.ean,
        targetProductId: targetId,
        status: 'already_exists' as const,
        reasons: [targetMatch ? 'EXACT_LEGACY_PRODUCT_ALREADY_IMPORTED' : 'EXISTING_SKU_OR_EAN_MATCH'],
        matchedProductIds: matchedIds,
        warnings,
      }
    }

    insertable.push(candidate)
    return {
      legacyProductId: candidate.legacyProductId,
      sku: candidate.sku,
      ean: candidate.ean,
      targetProductId: targetId,
      status: 'would_create' as const,
      reasons: ['IDENTITY_ABSENT'],
      matchedProductIds: [],
      warnings,
    }
  })

  return { decisions, insertable }
}

export function buildHairshopProductCreateData(
  candidate: HairshopNewProductCandidate,
  runId: string,
): Prisma.ProductUncheckedCreateInput {
  const category = mapLegacyCategory(candidate.categoryNames).category
  const title = preferred(candidate.titles) || candidate.sku
  const description = preferred(candidate.descriptions) || null
  const metaTitle = candidate.metaTitles ? preferred(candidate.metaTitles) || null : null
  const metaDescription = candidate.metaDescriptions ? preferred(candidate.metaDescriptions) || null : null
  const images = [...new Set(candidate.images)]
  const technicalSpecs = {
    ...(candidate.descriptions.en?.trim() ? { __descriptionEn: candidate.descriptions.en.trim() } : {}),
    ...(candidate.descriptions.lv?.trim() ? { __descriptionLv: candidate.descriptions.lv.trim() } : {}),
  }

  return {
    id: targetProductId(candidate.legacyProductId),
    externalId: candidate.sku,
    sku: candidate.sku,
    barcode: candidate.ean || null,
    title,
    titleLv: candidate.titles.lv?.trim() || null,
    titleEn: candidate.titles.en?.trim() || null,
    description,
    technicalSpecs: Object.keys(technicalSpecs).length ? technicalSpecs : undefined,
    brand: candidate.manufacturerName || '',
    manufacturerName: candidate.manufacturerName || null,
    category,
    image: images[0] ?? null,
    images,
    metaTitle,
    metaDescription,
    ogImage: images[0] ?? null,
    ogAlt: title,
    price: 0,
    stock: 0,
    erpPriceMissing: true,
    manualPriceApproved: false,
    manualApprovedPrice: null,
    rating: 0,
    ratingCount: 0,
    reviewCount: 0,
    badges: [],
    relatedProductIds: [],
    oftenBoughtTogether: [],
    certificates: [],
    compatibleEquipment: [],
    isActive: true,
    isDeleted: false,
    isCustom: false,
    lastSyncRunId: `hairshop-catalog:${runId}`,
    createdAt: new Date(candidate.createdOnUtc),
  }
}

export function summarizeHairshopSync(decisions: HairshopSyncDecision[]): {
  candidates: number
  wouldCreate: number
  created: number
  alreadyExists: number
  conflicts: number
  databaseWrites: number
  productUpdates: 0
  priceUpdates: 0
  stockUpdates: 0
} {
  const count = (status: HairshopSyncDecision['status']) => decisions.filter(item => item.status === status).length
  const created = count('created')
  return {
    candidates: decisions.length,
    wouldCreate: count('would_create'),
    created,
    alreadyExists: count('already_exists'),
    conflicts: count('conflict'),
    databaseWrites: created,
    productUpdates: 0,
    priceUpdates: 0,
    stockUpdates: 0,
  }
}
