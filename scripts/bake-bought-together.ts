/**
 * Запекает co-purchase статистику из реальных заказов (Order.items JSON) в
 * data/product-bought-together.json: productId -> топ-N товаров, которые чаще
 * всего встречались с ним в одном заказе.
 *
 * Файл — фолбэк для блока «Часто покупают вместе» на странице товара: явный
 * список Product.oftenBoughtTogether (админка/nopCommerce) имеет приоритет.
 * Схема БД не меняется. Перезапуск безопасен, файл перезаписывается целиком.
 *
 * Запуск: npx tsx scripts/bake-bought-together.ts [minPairCount=2]
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
config({ path: '.env.local' })

const TOP_N = 8

async function main() {
  const minCnt = Number(process.argv[2] ?? 2)
  const { prisma } = await import('../lib/prisma')

  const stats = await prisma.$queryRawUnsafe<
    { orders_total: number; orders_multi: number }[]
  >(`
    WITH order_sizes AS (
      SELECT o.id, COUNT(DISTINCT item->>'id') AS n
      FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
      WHERE item->>'id' IS NOT NULL
      GROUP BY o.id
    )
    SELECT COUNT(*)::int AS orders_total, COUNT(*) FILTER (WHERE n >= 2)::int AS orders_multi
    FROM order_sizes
  `)
  console.log(`Заказы: всего ${stats[0].orders_total}, с 2+ товарами ${stats[0].orders_multi}`)

  const rows = await prisma.$queryRawUnsafe<{ id_a: string; id_b: string; cnt: number }[]>(
    `
    WITH order_items AS (
      SELECT DISTINCT o.id AS order_id, item->>'id' AS product_id
      FROM "Order" o, jsonb_array_elements(o.items::jsonb) AS item
      WHERE item->>'id' IS NOT NULL
    ),
    pairs AS (
      SELECT a.product_id AS id_a, b.product_id AS id_b, COUNT(*)::int AS cnt
      FROM order_items a
      JOIN order_items b ON a.order_id = b.order_id AND a.product_id <> b.product_id
      GROUP BY 1, 2
      HAVING COUNT(*) >= $1
    ),
    ranked AS (
      SELECT p.id_a, p.id_b, p.cnt,
             ROW_NUMBER() OVER (PARTITION BY p.id_a ORDER BY p.cnt DESC, p.id_b) AS rn
      FROM pairs p
      JOIN "Product" pa ON pa.id = p.id_a AND pa."isDeleted" = false
      JOIN "Product" pb ON pb.id = p.id_b AND pb."isDeleted" = false AND pb."isActive"
    )
    SELECT id_a, id_b, cnt FROM ranked WHERE rn <= ${TOP_N} ORDER BY id_a, rn
    `,
    minCnt
  )

  const result: Record<string, string[]> = {}
  for (const r of rows) {
    ;(result[r.id_a] ??= []).push(r.id_b)
  }

  const activeCovered = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM "Product" WHERE "isDeleted" = false AND "isActive" AND id = ANY($1)`,
    Object.keys(result)
  )
  console.log(
    `Пар (cnt>=${minCnt}): ${rows.length}, товаров с фолбэком: ${Object.keys(result).length}` +
      ` (из них активных: ${activeCovered[0].n})`
  )

  const outPath = join(__dirname, '..', 'data', 'product-bought-together.json')
  writeFileSync(outPath, JSON.stringify(result, null, 0) + '\n', 'utf8')
  console.log(`✓ записано: ${outPath}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
