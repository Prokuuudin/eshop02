import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })

const r = await pool.query(`
  SELECT id, title, image FROM "Product"
  WHERE image LIKE 'https://%' AND "isActive" = true
    AND (title ILIKE '%brush%' OR title ILIKE '%comb%' OR title ILIKE '%clip%'
      OR title ILIKE '%hairpin%' OR title ILIKE '%щетка%' OR title ILIKE '%расческ%'
      OR title ILIKE '%suka%' OR title ILIKE '%ķemme%' OR title ILIKE '%заколк%'
      OR title ILIKE '%rezinka%' OR title ILIKE '%резинк%' OR title ILIKE '%barrette%'
      OR title ILIKE '%paddle%' OR title ILIKE '%diffuser%' OR title ILIKE '%bobby%')
  ORDER BY rating DESC, "ratingCount" DESC
  LIMIT 12
`)
r.rows.forEach((p, i) => console.log(`[${i}] ${p.id} | ${p.title.slice(0,60)} | ${p.image}`))

await pool.end()
