import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })

// Stats: how many products have images
const stats = await pool.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(image) AS with_image,
    COUNT(*) FILTER (WHERE image LIKE '/products/%') AS local_images,
    COUNT(*) FILTER (WHERE image LIKE 'https://%') AS external_images
  FROM "Product"
`)
console.log('Image stats:', stats.rows[0])

// Sample nopCommerce products (high IDs)
const r = await pool.query(`SELECT id, title, image FROM "Product" WHERE image LIKE 'https://%' LIMIT 5`)
r.rows.forEach(row => console.log(row.id, '|', row.image))

// Test one external URL
const testUrl = r.rows[0]?.image
if (testUrl && testUrl.startsWith('http')) {
  console.log('\nTesting:', testUrl)
  try {
    const res = await fetch(testUrl)
    console.log('Status:', res.status, '| Content-Type:', res.headers.get('content-type'), '| Size:', res.headers.get('content-length'))
  } catch(e) {
    console.log('Fetch error:', e.message)
  }
}

await pool.end()
