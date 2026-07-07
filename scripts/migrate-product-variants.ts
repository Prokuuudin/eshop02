/**
 * One-off backfill: restores variant data (color/size dropdowns, image squares)
 * dropped during the original nopCommerce -> Neon migration. Stored inside the
 * existing Product.technicalSpecs field (no schema change, no Prisma migration).
 *
 * v3 (2026-07-07): priceAdjustment now grossed ×1.21 in export SQL, plus option
 * images (ImageSquaresPictureId/PictureId), IsPreSelected and group displayType.
 *
 * Run scripts/export-mssql-to-json.ps1 first (produces product_attributes.json).
 * Then: npx tsx --env-file=.env.local scripts/migrate-product-variants.ts
 */

import { readFileSync } from 'fs'
import { Pool } from 'pg'
import type { VariantGroup, VariantOption } from '../data/products'

const DATA = 'C:/Temp/migration'

type AttrRow = {
  productId: number
  attrName: string
  isRequired: boolean | number
  ctrlType: number
  value: string
  priceAdjustment: number | null
  isPreSelected: boolean | number
  displayOrder: number
  imagePicId: number | null
  imageSeoFilename: string | null
  imageMimeType: string | null
}

function load(): AttrRow[] {
  const raw = readFileSync(`${DATA}/product_attributes.json`, 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const parsed = JSON.parse(noWraps)
  return (parsed.data ?? parsed) as AttrRow[]
}

// nopCommerce thumb handler: {7-digit id}[_{seo}].{ext}; swatches have no SeoFilename.
function pictureUrl(id: number, seo: string | null, mime: string | null): string {
  const ext = (mime ?? 'image/jpeg').split('/')[1]?.replace('pjpeg', 'jpeg') ?? 'jpeg'
  const padded = String(id).padStart(7, '0')
  return `https://hairshop.lv/content/images/thumbs/${padded}${seo ? `_${seo}` : ''}.${ext}`
}

// Orphaned attribute pictures (thumb never generated on hairshop.lv) return 404 —
// validate once per unique URL and drop the dead ones from the backfill.
async function checkUrls(urls: Set<string>): Promise<Set<string>> {
  const alive = new Set<string>()
  const list = Array.from(urls)
  const CONCURRENCY = 10
  let i = 0
  async function worker() {
    while (i < list.length) {
      const url = list[i++]
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
        if (res.ok) alive.add(url)
        else console.log(`  dead image (${res.status}): ${url}`)
      } catch {
        console.log(`  dead image (network): ${url}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return alive
}

const IMAGE_SQUARES_CTRL = 45

function groupByProduct(rows: AttrRow[]): Map<string, VariantGroup[]> {
  const byProduct = new Map<string, Map<string, VariantGroup>>()
  for (const r of rows) {
    const pid = String(r.productId)
    if (!byProduct.has(pid)) byProduct.set(pid, new Map())
    const groups = byProduct.get(pid)!
    if (!groups.has(r.attrName)) {
      const group: VariantGroup = { name: r.attrName, required: Boolean(r.isRequired), options: [] }
      if (r.ctrlType === IMAGE_SQUARES_CTRL) group.displayType = 'imageSquares'
      groups.set(r.attrName, group)
    }
    const option: VariantOption = { value: r.value }
    if (r.priceAdjustment) option.priceAdjustment = Number(r.priceAdjustment)
    if (r.imagePicId) option.image = pictureUrl(r.imagePicId, r.imageSeoFilename, r.imageMimeType)
    if (r.isPreSelected) option.preselected = true
    groups.get(r.attrName)!.options.push(option)
  }
  const result = new Map<string, VariantGroup[]>()
  for (const [pid, groups] of byProduct) {
    result.set(pid, Array.from(groups.values()))
  }
  return result
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })

async function main() {
  const rows = load()
  const grouped = groupByProduct(rows)

  const allUrls = new Set<string>()
  for (const groups of grouped.values())
    for (const g of groups) for (const o of g.options) if (o.image) allUrls.add(o.image)
  console.log(`Validating ${allUrls.size} unique option image URLs...`)
  const alive = await checkUrls(allUrls)
  console.log(`  alive: ${alive.size}, dropped: ${allUrls.size - alive.size}`)
  for (const groups of grouped.values())
    for (const g of groups) for (const o of g.options) if (o.image && !alive.has(o.image)) delete o.image

  console.log(`Backfilling variantGroups for ${grouped.size} products (into technicalSpecs.__variantGroupsJson)...`)

  let updated = 0
  let notFound = 0
  for (const [productId, variantGroups] of grouped) {
    const result = await pool.query(
      `UPDATE "Product"
       SET "technicalSpecs" = COALESCE("technicalSpecs", '{}'::jsonb) || jsonb_build_object('__variantGroupsJson', $1::text)
       WHERE id = $2`,
      [JSON.stringify(variantGroups), productId]
    )
    if (result.rowCount && result.rowCount > 0) updated++
    else notFound++
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}`)
}

main().finally(() => pool.end())
