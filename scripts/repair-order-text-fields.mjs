import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const apply = process.argv.includes('--apply')
const fields = ['firstName', 'lastName', 'deliveryMethod', 'paymentMethod', 'email', 'phone', 'address', 'city', 'postalCode']
const isDamaged = (value) => typeof value === 'string' && (value.includes('\uFFFD') || value.includes('???'))
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('=') && !line.startsWith('#'))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sourceRaw = readFileSync('C:/Temp/migration/orders_text_repair_utf8.json', 'utf8')
  .replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g, '').replace(/[\x00-\x1F]/g, ' ').trim()
const sourceRows = JSON.parse(sourceRaw).data
const sourceById = new Map(sourceRows.map((row) => [String(row.id), row]))
const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })

try {
  const current = await pool.query(`SELECT id, "firstName", "lastName", "deliveryMethod", "paymentMethod", email, phone, address, city, "postalCode" FROM "Order"`)
  const affected = current.rows.filter((row) => fields.some((field) => isDamaged(row[field])))
  const fieldCounts = Object.fromEntries(fields.map((field) => [field, affected.filter((row) => isDamaged(row[field])).length]))
  const missingSource = affected.filter((row) => !sourceById.has(row.id)).map((row) => row.id)
  const unrecoverable = []
  for (const row of affected) {
    const source = sourceById.get(row.id)
    if (!source) continue
    for (const field of fields) {
      if (isDamaged(row[field]) && isDamaged(source[field])) unrecoverable.push({ id: row.id, field, value: source[field] })
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', affectedOrders: affected.length, fieldCounts, missingSource: missingSource.length, unrecoverable: unrecoverable.length }))
  if (!apply) {
    if (missingSource.length) console.log(JSON.stringify({ missingSource }, null, 2))
    if (unrecoverable.length) console.log(JSON.stringify({ unrecoverable }, null, 2))
    process.exit(0)
  }

  const repairs = affected.flatMap((row) => {
    const source = sourceById.get(row.id)
    if (!source) return []
    const next = { id: row.id }
    let changed = false
    for (const field of fields) {
      next[field] = row[field]
      if (isDamaged(row[field]) && !isDamaged(source[field])) {
        next[field] = source[field] ?? null
        changed = true
      }
    }
    return changed ? [next] : []
  })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await mkdir('.backups', { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `.backups/orders-before-text-repair-${stamp}.json`
    await writeFile(backupPath, JSON.stringify(affected), 'utf8')
    const result = await client.query(`
      UPDATE "Order" o SET
        "firstName"=r."firstName", "lastName"=r."lastName",
        "deliveryMethod"=r."deliveryMethod", "paymentMethod"=r."paymentMethod",
        email=r.email, phone=r.phone, address=r.address, city=r.city, "postalCode"=r."postalCode"
      FROM jsonb_to_recordset($1::jsonb) AS r(
        id text, "firstName" text, "lastName" text, "deliveryMethod" text,
        "paymentMethod" text, email text, phone text, address text, city text, "postalCode" text
      ) WHERE o.id=r.id
    `, [JSON.stringify(repairs)])
    await client.query('COMMIT')
    console.log(JSON.stringify({ updatedOrders: result.rowCount, backupPath }))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
