/**
 * Backfill Product.specVolume (колонка уже есть в схеме — без ALTER TABLE)
 * из объёма/веса в названии товара: «краска для волос 100мл», «SHAMPOO 500 ml»,
 * «отбеливающий порошок 500 г», «3x250g» и т.п.
 *
 * До этого блок «Характеристики» показывал выдуманный статический дефолт
 * ('50-300ml') всем товарам; specVolume был NULL у 100% живых товаров.
 *
 * Заполняет только specVolume IS NULL (правки из админки не затирает). Идемпотентно.
 * Run: npx tsx scripts/backfill-spec-volume.ts [--apply]
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

const UNIT_MAP: Record<string, string> = {
  ml: 'ml', мл: 'ml',
  g: 'g', г: 'g', gr: 'g',
  kg: 'kg', кг: 'kg',
  l: 'l', л: 'l',
}

// число + единица, с опциональным множителем «3x250g»; единица не должна быть
// началом слова (иначе «10 г.» ок, а «10 grams» тоже ок, но «100 мл» ≠ «100 млн»)
const VOLUME_RE =
  /(?:(\d+)\s*[xх]\s*)?(\d+(?:[.,]\d+)?)\s*(ml|мл|gr|g|г|kg|кг|l|л)(?![a-zа-яё])/i

export function parseVolume(title: string): string | null {
  const m = VOLUME_RE.exec(title)
  if (!m) return null
  const [, mult, num, unitRaw] = m
  const unit = UNIT_MAP[unitRaw.toLowerCase()]
  if (!unit) return null
  const value = num.replace(',', '.')
  return mult ? `${mult}x${value} ${unit}` : `${value} ${unit}`
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000 })

async function main() {
  const apply = process.argv.includes('--apply')

  const { rows } = await pool.query(
    `SELECT id, title, "titleEn", "titleLv" FROM "Product" WHERE "specVolume" IS NULL`
  )
  console.log(`products without specVolume: ${rows.length}`)

  const updates: Array<{ id: string; volume: string }> = []
  for (const r of rows) {
    const volume = parseVolume(r.title ?? '') ?? parseVolume(r.titleEn ?? '') ?? parseVolume(r.titleLv ?? '')
    if (volume) updates.push({ id: r.id, volume })
  }
  console.log(`parsed volume from title: ${updates.length}`)
  console.log('sample:', updates.slice(0, 10))

  if (!apply) {
    console.log('dry run — pass --apply to write')
    await pool.end()
    return
  }

  let updated = 0
  for (const u of updates) {
    const result = await pool.query(
      `UPDATE "Product" SET "specVolume" = $1 WHERE id = $2 AND "specVolume" IS NULL`,
      [u.volume, u.id]
    )
    updated += result.rowCount ?? 0
  }
  console.log(`✓ updated ${updated}`)
  await pool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
