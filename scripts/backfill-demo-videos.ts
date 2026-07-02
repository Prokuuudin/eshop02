/**
 * Backfill Product.demoVideo (Json?, колонка уже есть в схеме — без ALTER TABLE)
 * из видео-embed'ов, потерянных при миграции nopCommerce → Neon: исходные
 * FullDescription содержали <iframe> с Facebook/YouTube-видео, а экспорт описаний
 * сохранял только плоский текст.
 *
 * Requires C:/Temp/migration/product_video_iframes.json — экспорт из MSSQL:
 *   SELECT Id AS productId, FullDescription AS html FROM Product
 *   WHERE FullDescription LIKE '%<iframe%' FOR JSON AUTO
 * Run: npx tsx scripts/backfill-demo-videos.ts
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

type SourceRow = { productId: number; html: string }

// Тот же whitelist, что в components/ProductGallery.tsx (isEmbedUrl)
const EMBED_URL_RE = /(facebook\.com\/plugins\/video|youtube(-nocookie)?\.com\/embed|player\.vimeo\.com\/video)/i

function load(): SourceRow[] {
  const raw = readFileSync('C:/Temp/migration/product_video_iframes.json', 'utf8').trim()
  const noWraps = raw.replace(/\r\n|\r|\n/g, '')
  return JSON.parse(noWraps) as SourceRow[]
}

function decodeEntities(url: string): string {
  return url
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractEmbedSrcs(html: string): string[] {
  const srcs: string[] = []
  const iframeRe = /<iframe\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = iframeRe.exec(html)) !== null) {
    const src = decodeEntities(m[1])
    if (EMBED_URL_RE.test(src) && !srcs.includes(src)) srcs.push(src)
  }
  return srcs
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 30000 })

async function main() {
  const rows = load()
  console.log(`Source rows with <iframe>: ${rows.length}`)

  let updated = 0
  let notFound = 0
  let noVideos = 0
  for (const row of rows) {
    const srcs = extractEmbedSrcs(row.html)
    if (srcs.length === 0) {
      noVideos++
      continue
    }
    const demoVideo = srcs.map((src) => ({ src }))
    const result = await pool.query(
      `UPDATE "Product" SET "demoVideo" = $1::jsonb WHERE id = $2`,
      [JSON.stringify(demoVideo), String(row.productId)]
    )
    if (result.rowCount && result.rowCount > 0) {
      updated++
      console.log(`  ${row.productId}: ${srcs.length} video(s)`)
    } else {
      notFound++
    }
  }
  console.log(`✓ updated ${updated}, not found in Neon ${notFound}, no whitelisted embeds ${noVideos}`)
  await pool.end()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
