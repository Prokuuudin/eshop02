import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCategoriesConfigFromStore } from '@/lib/categories-server-store'
import { filterEmptySubcategories } from '@/lib/filter-empty-subcategories'
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { brandSlug } from '@/lib/brand-slug'
import { readBannersData, type Banner } from '@/lib/banners-server-store'
import { sanitizeStoredLink } from '@/lib/safe-link'
import { mapDbToProduct } from '@/lib/product-overrides-store'
import { getProductSubcategory } from '@/lib/product-overrides-mapping'
import { isProductOnSale, type Product } from '@/data/products'
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'

export const STOREFRONT_CACHE_TAGS = {
  categories: 'storefront-categories',
  brands: 'storefront-brands',
  banners: 'storefront-banners',
  bestsellers: 'storefront-bestsellers',
  saleProducts: 'storefront-sale-products',
  locale: 'storefront-locale',
  bonus: 'storefront-bonus',
} as const

export const getCachedCategories = unstable_cache(async () => {
  const [config, products] = await Promise.all([
    getCategoriesConfigFromStore(),
    prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      select: { id: true, category: true },
    }).then((rows) => rows.map((row) => ({
      category: row.category,
      subcategory: getProductSubcategory(row.id),
    }))),
  ])
  return filterEmptySubcategories(config.categories, products)
}, ['storefront-categories-v1'], { revalidate: 600, tags: [STOREFRONT_CACHE_TAGS.categories] })

export const getCachedBrands = unstable_cache(async () => {
  const [config, activeProducts] = await Promise.all([
    getBrandsConfigFromStore(),
    prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      select: { brand: true },
      distinct: ['brand'],
    }),
  ])
  const activeBrandIds = new Set(activeProducts.map((product) => brandSlug(product.brand)))
  return config.brands.filter((brand) => brand.isDistributor || activeBrandIds.has(brand.id))
}, ['storefront-brands-v1'], { revalidate: 600, tags: [STOREFRONT_CACHE_TAGS.brands] })

export const getCachedSaleBanners = unstable_cache(async (): Promise<Banner[]> => {
  const data = await readBannersData()
  return data.banners
    .filter((banner) => banner.active && banner.type === 'sale')
    .sort((a, b) => a.order - b.order)
    .map((banner) => ({ ...banner, link: sanitizeStoredLink(banner.link) }))
}, ['storefront-sale-banners-v1'], { revalidate: 600, tags: [STOREFRONT_CACHE_TAGS.banners] })

export const getCachedBestsellers = unstable_cache(async (): Promise<Product[]> => {
  const rows = await prisma.$queryRaw<{ product_id: string }[]>`
    SELECT item->>'id' AS product_id
    FROM "Order", jsonb_array_elements(items::jsonb) AS item
    WHERE item->>'id' IS NOT NULL
    GROUP BY item->>'id'
    ORDER BY SUM((item->>'quantity')::int) DESC
    LIMIT 24
  `
  const ids = rows.map((row) => row.product_id)
  if (!ids.length) return []
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true, image: { not: null } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))
  return ids.flatMap((id) => {
    const product = byId.get(id)
    return product ? [mapDbToProduct(product)] : []
  }).slice(0, 16)
}, ['storefront-bestsellers-v1'], { revalidate: 600, tags: [STOREFRONT_CACHE_TAGS.bestsellers] })

export const getCachedSaleProducts = unstable_cache(async (): Promise<Product[]> => {
  const ranked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Product"
    WHERE "isActive" = true
      AND "isDeleted" = false
      AND image IS NOT NULL
      AND "oldPrice" IS NOT NULL
      AND "oldPrice" > 0
      AND "oldPrice" > price
    ORDER BY (("oldPrice" - price) / "oldPrice") DESC, id ASC
    LIMIT 24
  `
  if (!ranked.length) return []
  const products = await prisma.product.findMany({
    where: { id: { in: ranked.map((row) => row.id) } },
  })
  const byId = new Map(products.map((product) => [product.id, mapDbToProduct(product)]))
  return ranked.flatMap(({ id }) => {
    const product = byId.get(id)
    return product && isProductOnSale(product) ? [product] : []
  })
}, ['storefront-sale-products-v1'], { revalidate: 300, tags: [STOREFRONT_CACHE_TAGS.saleProducts] })

export const getCachedLocaleConfig = unstable_cache(getLocaleConfig, ['storefront-locale-v1'], {
  revalidate: 600,
  tags: [STOREFRONT_CACHE_TAGS.locale],
})

export const getCachedBonusConfig = unstable_cache(getBonusProgramConfig, ['storefront-bonus-v1'], {
  revalidate: 600,
  tags: [STOREFRONT_CACHE_TAGS.bonus],
})
