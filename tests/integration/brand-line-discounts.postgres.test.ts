import { createHash, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { evaluatePromoCampaigns, PROMO_CAMPAIGNS_KEY, type PromoCampaign } from '@/lib/promo-campaigns'
import { evaluatePromoCode, recomputeOrderPricing, resolveLineItems, type ResolvedLineItem } from '@/lib/server-pricing'

if (!process.env.DATABASE_URL
  || !new URL(process.env.DATABASE_URL).hostname.startsWith('ep-empty-feather-aqiutjd0')) {
  throw new Error('Refusing to run stage-5 integration tests outside the approved Neon branch')
}

const TAXONOMY_TABLES = new Set([
  'BrandLine', 'BrandLineReviewItem', 'CatalogSourceCategory', 'CatalogSourceCategoryMapping',
  'CatalogSourceManufacturer', 'CatalogSourceManufacturerBrand', 'CatalogSourceProductCategory',
  'CatalogSourceProductManufacturer', 'ProductBrandLine', 'TaxonomySnapshotBatch', 'TaxonomySnapshotSession',
])

type FingerprintRow = { row_count: bigint; fingerprint: string }

async function commercialFingerprint(): Promise<{ tables: number; sha256: string }> {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name::text AS table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY table_name`
  const names = rows.map(row => row.table_name).filter(name => !TAXONOMY_TABLES.has(name))
  expect(names).toHaveLength(44)
  const evidence: string[] = []
  for (const name of names) {
    // Names come from information_schema, then are quoted again defensively.
    const quoted = `"${name.replaceAll('"', '""')}"`
    const [row] = await prisma.$queryRawUnsafe<FingerprintRow[]>(
      `SELECT count(*)::bigint AS row_count, md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) AS fingerprint FROM ${quoted} t`,
    )
    evidence.push(`${name}:${row.row_count.toString()}:${row.fingerprint}`)
  }
  return { tables: names.length, sha256: createHash('sha256').update(evidence.join('\n')).digest('hex') }
}

type Candidate = {
  productId: string
  childId: string
  parentId: string
  brand: string
}

const purchasableSql = `p."isActive" AND NOT p."isDeleted" AND p.price > 0
  AND (p."externalId" IS NULL OR NOT p."erpPriceMissing"
    OR (p."manualPriceApproved" AND p."manualApprovedPrice" = p.price))`

async function candidates(tx: ExtendedTransactionClient): Promise<{ primary: Candidate; sibling: Candidate; manualProductId: string }> {
  const [primary] = await tx.$queryRawUnsafe<Candidate[]>(`
    SELECT pbl."productId", bl.id AS "childId", bl."parentId", p.brand
    FROM "ProductBrandLine" pbl
    JOIN "BrandLine" bl ON bl.id = pbl."brandLineId"
    JOIN "Product" p ON p.id = pbl."productId"
    WHERE pbl.status = 'active' AND bl.status = 'active' AND bl."parentId" IS NOT NULL AND ${purchasableSql}
    ORDER BY pbl."productId" LIMIT 1`)
  if (!primary) throw new Error('The restored snapshot has no purchasable nested BrandLine product')

  const [sibling] = await tx.$queryRawUnsafe<Candidate[]>(`
    SELECT pbl."productId", bl.id AS "childId", bl."parentId", p.brand
    FROM "ProductBrandLine" pbl
    JOIN "BrandLine" bl ON bl.id = pbl."brandLineId"
    JOIN "Product" p ON p.id = pbl."productId"
    WHERE pbl.status = 'active' AND bl.status = 'active' AND bl."parentId" = $1
      AND bl.id <> $2 AND ${purchasableSql}
    ORDER BY pbl."productId" LIMIT 1`, primary.parentId, primary.childId)
  if (!sibling) throw new Error('The restored snapshot has no second child series for the selected parent')

  const [manual] = await tx.$queryRawUnsafe<Array<{ id: string }>>(`
    SELECT p.id
    FROM "Product" p
    WHERE p.brand = $1 AND ${purchasableSql}
      AND NOT EXISTS (
        SELECT 1 FROM "ProductBrandLine" x
        WHERE x."productId" = p.id AND x."brandLineId" = $2
      )
    ORDER BY p.id LIMIT 1`, primary.brand, primary.childId)
  if (!manual) throw new Error('The restored snapshot has no product for a manual membership fixture')
  return { primary, sibling, manualProductId: manual.id }
}

function campaign(id: string, overrides: Partial<PromoCampaign>): PromoCampaign {
  return {
    id,
    name: id,
    description: '',
    type: 'discount',
    discountPercent: 10,
    startDate: '2020-01-01',
    endDate: '2099-12-31',
    active: true,
    targetCategories: [],
    targetSubcategories: [],
    targetBrands: [],
    targetBrandLineIds: [],
    minOrderAmount: 0,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const cents = (value: number): number => Math.round(value * 100) / 100
const rollback = new Error('intentional stage-5 rollback')

afterAll(async () => { await prisma.$disconnect() })

describe('BrandLine discounts against the restored Neon snapshot', () => {
  it('covers hierarchy, overrides, campaigns, checkout and preserves all 44 commercial tables', async () => {
    const before = await commercialFingerprint()
    let failure: unknown
    try {
      await prisma.$transaction(async tx => {
        const { primary, sibling, manualProductId } = await candidates(tx)
        const items = await resolveLineItems([
          { id: primary.productId, quantity: 1 },
          { id: sibling.productId, quantity: 1 },
          { id: manualProductId, quantity: 1 },
        ], tx)
        expect(items.every(item => item.fromCatalog)).toBe(true)
        const [primaryItem, siblingItem, manualItem] = items as [ResolvedLineItem, ResolvedLineItem, ResolvedLineItem]
        const createPromo = async (suffix: string, data: Record<string, unknown>) => {
          const code = `IT${suffix}${randomUUID().replaceAll('-', '').slice(0, 12)}`.toUpperCase()
          await tx.promoCode.create({ data: {
            id: randomUUID(), code, discount: 10, discountType: 'percentage', discountValue: 10,
            ...data,
          } })
          return code
        }

        const brandCode = await createPromo('BRAND', { appliesTo: 'brands', brands: [primary.brand] })
        expect(await evaluatePromoCode(brandCode, items, {}, tx)).toMatchObject({
          valid: true,
          eligibleAmount: cents(primaryItem.price + siblingItem.price + manualItem.price),
        })

        const parentCode = await createPromo('PARENT', { appliesTo: 'brand_lines', brandLineIds: [primary.parentId] })
        expect(await evaluatePromoCode(parentCode, items, {}, tx)).toMatchObject({
          eligibleAmount: cents(primaryItem.price + siblingItem.price),
        })

        const childCode = await createPromo('CHILD', { appliesTo: 'brand_lines', brandLineIds: [primary.childId] })
        expect(await evaluatePromoCode(childCode, items, {}, tx)).toMatchObject({ eligibleAmount: primaryItem.price })

        const overlapCode = await createPromo('OVERLAP', {
          appliesTo: 'brand_lines', brandLineIds: [primary.parentId, primary.childId],
        })
        expect(await evaluatePromoCode(overlapCode, [primaryItem], {}, tx)).toMatchObject({
          eligibleAmount: primaryItem.price,
          discount: cents(primaryItem.price * 0.1),
        })

        const rulesCode = await createPromo('RULES', {
          appliesTo: 'rules', brands: [primary.brand], brandLineIds: [primary.childId],
        })
        expect(await evaluatePromoCode(rulesCode, items, {}, tx)).toMatchObject({ eligibleAmount: primaryItem.price })

        await tx.productBrandLine.update({
          where: { productId_brandLineId: { productId: primary.productId, brandLineId: primary.childId } },
          data: { status: 'excluded', origin: 'admin' },
        })
        expect(await evaluatePromoCode(childCode, [primaryItem], {}, tx)).toMatchObject({
          valid: false, reason: 'no_eligible_items', eligibleAmount: 0,
        })
        await tx.productBrandLine.update({
          where: { productId_brandLineId: { productId: primary.productId, brandLineId: primary.childId } },
          data: { status: 'active' },
        })

        await tx.productBrandLine.create({ data: {
          productId: manualProductId, brandLineId: primary.childId, origin: 'admin', status: 'active',
        } })
        expect(await evaluatePromoCode(childCode, [manualItem], {}, tx)).toMatchObject({
          valid: true, eligibleAmount: manualItem.price,
        })

        const legacyCode = await createPromo('LEGACY', { appliesTo: 'all' })
        expect(await evaluatePromoCode(legacyCode, [primaryItem], {}, tx)).toMatchObject({
          valid: true, eligibleAmount: primaryItem.price,
        })

        const lineCampaigns = [
          campaign('parent-10', { discountPercent: 10, targetBrandLineIds: [primary.parentId] }),
          campaign('child-50', { discountPercent: 50, targetBrandLineIds: [primary.childId] }),
          campaign('line-shipping', { type: 'free_shipping', discountPercent: 0, targetBrandLineIds: [primary.parentId] }),
        ]
        await tx.keyValueSetting.upsert({
          where: { key: PROMO_CAMPAIGNS_KEY },
          create: { key: PROMO_CAMPAIGNS_KEY, value: lineCampaigns },
          update: { value: lineCampaigns },
        })
        expect(await evaluatePromoCampaigns([primaryItem], tx)).toMatchObject({
          campaignId: 'child-50', discount: cents(primaryItem.price * 0.5), freeShipping: true,
        })

        const checkoutPromo = await createPromo('CHECKOUT', {
          appliesTo: 'brand_lines', brandLineIds: [primary.parentId], discount: 60, discountValue: 60,
        })
        const checkout = await recomputeOrderPricing({
          items: [{ id: primary.productId, quantity: 1 }], promoCode: checkoutPromo,
          deliveryMethod: 'courier', userBonusBalance: null,
        }, tx)
        expect(checkout).toMatchObject({
          discount: cents(primaryItem.price * 0.6), promoApplied: true, campaignApplied: true, delivery: 0,
        })

        await tx.keyValueSetting.update({
          where: { key: PROMO_CAMPAIGNS_KEY },
          data: { value: [campaign('legacy-brand', { discountPercent: 5, targetBrands: [primary.brand] })] },
        })
        expect(await evaluatePromoCampaigns([primaryItem], tx)).toMatchObject({
          campaignId: 'legacy-brand', discount: cents(primaryItem.price * 0.05), freeShipping: false,
        })

        throw rollback
      }, { maxWait: 30_000, timeout: 300_000 })
    } catch (error) {
      if (error !== rollback) failure = error
    }
    const after = await commercialFingerprint()
    expect(after).toEqual(before)
    if (failure) throw failure
  })
})
