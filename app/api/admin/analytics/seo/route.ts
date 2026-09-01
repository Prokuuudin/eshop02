import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { getProductOverrides, type ProductOverride } from '@/lib/product-overrides-store'
import { Prisma } from '@/generated/prisma/client'

type SeoRow = {
  id: string
  sku: string | null
  title: string
  brand: string
  category: string
  hasMetaTitle: boolean
  hasMetaDesc: boolean
  hasImage: boolean
  hasImageAlt: boolean
  hasTranslations: boolean
  validMetaTitleLength: boolean
  validMetaDescLength: boolean
  duplicateMeta: boolean
}

type SeoQueryResult = {
  products: SeoRow[]
  total: number
  catalogTotal: number
  counts: { all: number; metaTitle: number; metaDesc: number; image: number; imageAlt: number; translations: number; duplicate: number }
}

// Same reasoning as /api/admin/analytics/abc and /cohorts: this only needs a
// handful of fields per product to compute completeness flags, so it selects
// those columns directly instead of routing through the full admin product
// list (which carries description/pricing/images payloads irrelevant here).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAdminPermission('catalog.read')
    if (user instanceof NextResponse) return user

    const overrides = await getProductOverrides().catch((): Record<string, ProductOverride> => ({}))
    const issue = req.nextUrl.searchParams.get('issue')
    const search = req.nextUrl.searchParams.get('search')?.trim() ?? ''
    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(req.nextUrl.searchParams.get('pageSize') ?? '25', 10) || 25))
    const offset = (page - 1) * pageSize
    const exportCsv = req.nextUrl.searchParams.get('export') === 'csv'
    const issueFilter = issue === 'metaTitle'
      ? Prisma.sql`NOT "hasMetaTitle"`
      : issue === 'metaDesc'
        ? Prisma.sql`NOT "hasMetaDesc"`
        : issue === 'image'
          ? Prisma.sql`NOT "hasImage"`
          : issue === 'imageAlt'
            ? Prisma.sql`NOT "hasImageAlt"`
            : issue === 'translations'
              ? Prisma.sql`NOT "hasTranslations"`
              : issue === 'duplicate'
                ? Prisma.sql`"duplicateMeta"`
                : Prisma.sql`NOT "hasMetaTitle" OR NOT "hasMetaDesc" OR NOT "hasImage" OR NOT "hasImageAlt" OR NOT "hasTranslations"`
    const searchFilter = search ? Prisma.sql`AND (id ILIKE ${`%${search}%`} OR sku ILIKE ${`%${search}%`} OR title ILIKE ${`%${search}%`} OR brand ILIKE ${`%${search}%`} OR category ILIKE ${`%${search}%`})` : Prisma.empty

    const resultRows = await prisma.$queryRaw<SeoQueryResult[]>(Prisma.sql`
      WITH override_data AS (
        SELECT CAST(${JSON.stringify(overrides)} AS jsonb) AS data
      ), merged AS (
        SELECT
          p.id,
          COALESCE(override_data.data -> p.id ->> 'title', p.title) AS title,
          COALESCE(override_data.data -> p.id ->> 'sku', p.sku) AS sku,
          COALESCE(override_data.data -> p.id ->> 'brand', p.brand) AS brand,
          COALESCE(override_data.data -> p.id ->> 'category', p.category) AS category,
          COALESCE(override_data.data -> p.id ->> 'titleEn', p."titleEn") AS title_en,
          COALESCE(override_data.data -> p.id ->> 'titleLv', p."titleLv") AS title_lv,
          COALESCE(override_data.data -> p.id ->> 'metaTitle', p."metaTitle") AS meta_title,
          COALESCE(override_data.data -> p.id ->> 'metaDescription', p."metaDescription") AS meta_description,
          COALESCE(override_data.data -> p.id ->> 'description', p.description) AS description,
          COALESCE(override_data.data -> p.id ->> 'image', p.image) AS primary_image,
          COALESCE(override_data.data -> p.id ->> 'ogAlt', p."ogAlt") AS image_alt,
          CASE
            WHEN jsonb_typeof(override_data.data -> p.id -> 'images') = 'array'
              THEN jsonb_array_length(override_data.data -> p.id -> 'images')
            ELSE cardinality(p.images)
          END AS image_count
        FROM "Product" p CROSS JOIN override_data
        WHERE NOT p."isDeleted" AND p."isActive"
      ), effective AS (
        SELECT id, sku, title, brand, category, title_en, title_lv, primary_image, image_count,
          COALESCE(NULLIF(trim(meta_title), ''), concat(title, ' | Hairshop-Pro')) AS meta_title,
          COALESCE(NULLIF(trim(meta_description), ''), NULLIF(trim(description), ''), concat(brand, ' — ', title)) AS meta_description,
          COALESCE(NULLIF(trim(image_alt), ''), NULLIF(trim(title), '')) AS image_alt
        FROM merged
      ), quality AS (
        SELECT id, sku, title, brand, category,
          COALESCE(length(trim(meta_title)) > 0, false) AS "hasMetaTitle",
          COALESCE(length(trim(meta_description)) > 0, false) AS "hasMetaDesc",
          COALESCE(length(trim(primary_image)) > 0, false) OR image_count > 0 AS "hasImage",
          NOT (COALESCE(length(trim(primary_image)) > 0, false) OR image_count > 0)
            OR COALESCE(length(trim(image_alt)) > 0, false) AS "hasImageAlt",
          COALESCE(length(trim(title_en)) > 0 AND length(trim(title_lv)) > 0, false) AS "hasTranslations",
          COALESCE(length(trim(meta_title)) BETWEEN 10 AND 60, false) AS "validMetaTitleLength",
          COALESCE(length(trim(meta_description)) BETWEEN 50 AND 160, false) AS "validMetaDescLength",
          meta_title, meta_description
        FROM effective
      ), analyzed AS (
        SELECT id, sku, title, brand, category, "hasMetaTitle", "hasMetaDesc", "hasImage", "hasImageAlt", "hasTranslations", "validMetaTitleLength", "validMetaDescLength",
          ("hasMetaTitle" AND COUNT(*) OVER (PARTITION BY NULLIF(lower(trim(meta_title)), '')) > 1)
          OR ("hasMetaDesc" AND COUNT(*) OVER (PARTITION BY NULLIF(lower(trim(meta_description)), '')) > 1) AS "duplicateMeta"
        FROM quality
      ), searched AS (
        SELECT * FROM analyzed WHERE true ${searchFilter}
      ), filtered AS (
        SELECT * FROM searched WHERE (${issueFilter})
      ), page_rows AS (
        SELECT * FROM filtered
        ORDER BY ((NOT "hasMetaTitle")::int + (NOT "hasMetaDesc")::int + (NOT "hasImage")::int + (NOT "hasImageAlt")::int + (NOT "hasTranslations")::int + "duplicateMeta"::int) DESC, id
        LIMIT ${exportCsv ? 100_000 : pageSize} OFFSET ${exportCsv ? 0 : offset}
      )
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY ((NOT "hasMetaTitle")::int + (NOT "hasMetaDesc")::int + (NOT "hasImage")::int + (NOT "hasImageAlt")::int + (NOT "hasTranslations")::int + "duplicateMeta"::int) DESC, id) FROM page_rows), '[]'::jsonb) AS products,
        (SELECT COUNT(*)::int FROM filtered) AS total,
        (SELECT COUNT(*)::int FROM analyzed) AS "catalogTotal",
        jsonb_build_object(
          'all', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasMetaTitle" OR NOT "hasMetaDesc" OR NOT "hasImage" OR NOT "hasImageAlt" OR NOT "hasTranslations"),
          'metaTitle', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasMetaTitle"),
          'metaDesc', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasMetaDesc"),
          'image', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasImage"),
          'imageAlt', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasImageAlt"),
          'translations', (SELECT COUNT(*)::int FROM searched WHERE NOT "hasTranslations"),
          'duplicate', (SELECT COUNT(*)::int FROM searched WHERE "duplicateMeta")
        ) AS counts
    `)
    const result = resultRows[0] ?? { products: [], total: 0, catalogTotal: 0, counts: { all: 0, metaTitle: 0, metaDesc: 0, image: 0, imageAlt: 0, translations: 0, duplicate: 0 } }
    if (exportCsv) {
      const csv = [
        ['Product ID', 'SKU', 'Title', 'Brand', 'Category', 'Meta title', 'Meta description', 'Image', 'Link preview image description (Alt)', 'EN/LV titles', 'Duplicate metadata'],
        ...result.products.map((product) => [product.id, product.sku ?? '', product.title, product.brand, product.category, product.hasMetaTitle, product.hasMetaDesc, product.hasImage, product.hasImageAlt, product.hasTranslations, product.duplicateMeta]),
      ].map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
      return new NextResponse(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="seo-report.csv"' } })
    }
    return NextResponse.json({ ...result, page, pageSize })
  } catch (e) {
    logApiError('[admin/analytics/seo GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
