import { createRequire } from 'module'
import { readFileSync } from 'fs'

// Parse .env.local
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })

const r = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM "User")    AS users,
    (SELECT COUNT(*) FROM "Product") AS products,
    (SELECT COUNT(*) FROM "Order")   AS orders
`)
console.log('Текущее состояние Neon DB:', r.rows[0])
await pool.end()
