/**
 * Fix 404 secondary product images migrated from hairshop.lv (nopCommerce).
 *
 * nopCommerce генерирует thumb-файлы по требованию: у первой картинки товара
 * `_400`-вариант существует (это дефолтный размер detail-страницы), у остальных
 * на живом сайте есть только `_70` и полноразмерный файл БЕЗ суффикса размера.
 * Миграция же приклеила `_400` ко всем URL → все фото кроме первого отдают 404.
 *
 * Фикс: у товаров с >1 фото у элементов 2+ убираем `_400` (полноразмер, 200 OK).
 * Первый элемент и колонку image не трогаем. Идемпотентно.
 *
 * Run: npx tsx scripts/fix-secondary-image-urls.ts [--apply]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000 })

async function main() {
  const apply = process.argv.includes('--apply')

  const preview = await pool.query(`
    SELECT id,
      images[2] AS before,
      regexp_replace(images[2], '_400\\.(png|jpe?g|gif)$', '.\\1') AS after
    FROM "Product"
    WHERE cardinality(images) > 1 AND images[2] LIKE '%\\_400.%'
    LIMIT 5
  `)
  console.table(preview.rows)

  const scale = await pool.query(`
    SELECT count(*) AS affected FROM "Product"
    WHERE cardinality(images) > 1
      AND EXISTS (SELECT 1 FROM unnest(images[2:]) img WHERE img LIKE '%\\_400.%')
  `)
  console.log('products to fix:', scale.rows[0].affected)

  if (!apply) {
    console.log('dry run — pass --apply to write')
    await pool.end()
    return
  }

  const result = await pool.query(`
    UPDATE "Product" p
    SET images = p.images[1:1] || (
      SELECT array_agg(regexp_replace(img, '_400\\.(png|jpe?g|gif)$', '.\\1') ORDER BY ord)
      FROM unnest(p.images[2:]) WITH ORDINALITY AS t(img, ord)
    )
    WHERE cardinality(p.images) > 1
      AND EXISTS (SELECT 1 FROM unnest(p.images[2:]) img WHERE img LIKE '%\\_400.%')
  `)
  console.log(`✓ updated ${result.rowCount} products`)
  await pool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
