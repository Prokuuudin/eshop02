/**
 * One-off backfill: restores variant data (color/size dropdowns) dropped
 * during the original nopCommerce -> Neon migration.
 *
 * Run scripts/export-mssql-to-json.ps1 first (produces product_attributes.json).
 * Then: npx tsx scripts/migrate-product-variants.ts
 */

import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import type { VariantGroup } from '../data/products'

const DATA = 'C:/Temp/migration'

type AttrRow = {
  productId: number
  attrName: string
  isRequired: boolean | number
  value: string
  priceAdjustment: number | null
  displayOrder: number
}

function load(): AttrRow[] {
  const raw = readFileSync(`${DATA}/product_attributes.json`, 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  const parsed = JSON.parse(noWraps)
  return (parsed.data ?? parsed) as AttrRow[]
}

function groupByProduct(rows: AttrRow[]): Map<string, VariantGroup[]> {
  const byProduct = new Map<string, Map<string, VariantGroup>>()
  for (const r of rows) {
    const pid = String(r.productId)
    if (!byProduct.has(pid)) byProduct.set(pid, new Map())
    const groups = byProduct.get(pid)!
    if (!groups.has(r.attrName)) {
      groups.set(r.attrName, { name: r.attrName, required: Boolean(r.isRequired), options: [] })
    }
    const option: { value: string; priceAdjustment?: number } = { value: r.value }
    if (r.priceAdjustment) option.priceAdjustment = Number(r.priceAdjustment)
    groups.get(r.attrName)!.options.push(option)
  }
  const result = new Map<string, VariantGroup[]>()
  for (const [pid, groups] of byProduct) {
    result.set(pid, Array.from(groups.values()))
  }
  return result
}

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
const prisma = new PrismaClient({ adapter: new PrismaPg(dbPool) })

async function main() {
  const rows = load()
  const grouped = groupByProduct(rows)
  console.log(`Backfilling variantGroups for ${grouped.size} products...`)

  let updated = 0
  let notFound = 0
  for (const [productId, variantGroups] of grouped) {
    const result = await prisma.product.updateMany({
      where: { id: productId },
      data: { variantGroups: variantGroups as object },
    })
    if (result.count > 0) updated++
    else notFound++
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}`)
}

main().finally(() => prisma.$disconnect())
