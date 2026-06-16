import { createRequire } from 'module'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')] })
)

const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 })

function load(name) {
  const raw = readFileSync(`C:/Temp/migration/${name}`, 'utf8').trim()
  const clean = raw.replace(/\r\n|\r|\n/g, '').replace(/[\x00-\x1F]/g, ' ')
  const parsed = JSON.parse(clean)
  return parsed.data ?? parsed
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function retry(fn) {
  for (let i = 1; i <= 5; i++) {
    try { return await fn() } catch (e) {
      if (i < 5 && (e.message?.includes('terminated') || e.message?.includes('connection')))
        await new Promise(r => setTimeout(r, i * 1500))
      else throw e
    }
  }
}

async function run(label, rows, fn, concurrency = 10) {
  process.stdout.write(`${label}...`)
  let n = 0
  for (let i = 0; i < rows.length; i += concurrency) {
    await Promise.all(rows.slice(i, i + concurrency).map(r => retry(() => fn(r))))
    n += Math.min(concurrency, rows.length - i)
    if (n % 5000 === 0) process.stdout.write(` ${n}`)
  }
  console.log(` ✓ ${n}`)
}

// Users — name, phone
const users = load('users_utf8_utf8.json')
await run('[1/4] Users', users, u =>
  pool.query(
    `UPDATE "User" SET name = $1, phone = $2 WHERE id = $3`,
    [
      [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
      u.phone ?? null,
      String(u.id),
    ]
  )
)

// Reviews — author, title, text
const reviews = load('reviews_utf8_utf8.json')
await run('[2/4] Reviews', reviews, r =>
  pool.query(
    `UPDATE "Review" SET author = $1, title = $2, text = $3 WHERE id = $4`,
    [
      String(r.author || 'Customer').trim(),
      r.title || 'Review',
      r.text || '',
      String(r.id),
    ]
  )
)

// Blog posts — title, excerpt, content
const posts = load('blog_posts_utf8_utf8.json')
await run('[3/4] Blog posts', posts, b =>
  pool.query(
    `UPDATE "BlogPost" SET title = $1, excerpt = $2, content = $3 WHERE id = $4`,
    [
      b.title,
      b.bodyOverview ? stripHtml(String(b.bodyOverview)).slice(0, 300) : '',
      b.body ? stripHtml(String(b.body)) : '',
      String(b.id),
    ]
  )
)

// Addresses — firstName, lastName, phone, address, city
const addrs = load('addresses_utf8_utf8.json')
await run('[4/4] Addresses', addrs, a =>
  pool.query(
    `UPDATE "SavedAddress" SET
      "firstName" = $1, "lastName" = $2, phone = $3, address = $4, city = $5
    WHERE id = $6`,
    [
      a.firstName || '',
      a.lastName || '',
      a.phone || '',
      a.address || '',
      a.city || '',
      String(a.id),
    ]
  )
)

console.log('\n✅ All text fields updated with correct encoding.')
await pool.end()
