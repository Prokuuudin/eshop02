import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const apply = process.argv.includes('--apply')
const raw = readFileSync('C:/Temp/migration/order_statuses_repair_utf8.json', 'utf8')
  .replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g, '').replace(/[\x00-\x1F]/g, ' ').trim()
const orderStatus = { 10: 'pending', 20: 'confirmed', 30: 'delivered', 40: 'cancelled' }
const paymentStatus = { 10: 'unpaid', 20: 'pending', 30: 'paid', 35: 'refunded', 40: 'refunded', 50: 'failed' }
const source = JSON.parse(raw).data.map((row) => ({
  id: String(row.id),
  status: orderStatus[row.orderStatusId] ?? 'pending',
  paymentStatus: paymentStatus[row.paymentStatusId] ?? 'unpaid',
}))
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => line.includes('=') && !line.startsWith('#'))
  .map((line) => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })

try {
  const ids = source.map((row) => row.id)
  const existing = await pool.query(`SELECT count(*)::int AS count FROM "Order" WHERE id = ANY($1::text[])`, [ids])
  const expected = source.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1
    return counts
  }, {})
  const actual = await pool.query(`
    SELECT COALESCE(osr.status, 'pending') AS status, count(*)::int AS count,
      round(sum(o.total)::numeric, 2) AS total
    FROM "Order" o LEFT JOIN "OrderStatusRecord" osr ON osr."orderId"=o.id
    GROUP BY COALESCE(osr.status, 'pending') ORDER BY status
  `)
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sourceOrders: source.length, matchedOrders: existing.rows[0].count, expectedStatuses: expected, actualStatuses: actual.rows }))
  if (!apply) process.exit(0)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const backup = await client.query(`
      SELECT o.id, o."paymentStatus", osr.status
      FROM "Order" o LEFT JOIN "OrderStatusRecord" osr ON osr."orderId"=o.id
      WHERE o.id = ANY($1::text[]) ORDER BY o.id
    `, [ids])
    await mkdir('.backups', { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `.backups/orders-before-status-repair-${stamp}.json`
    await writeFile(backupPath, JSON.stringify(backup.rows), 'utf8')
    const payload = JSON.stringify(source)
    const statuses = await client.query(`
      INSERT INTO "OrderStatusRecord" ("orderId", status, "updatedAt")
      SELECT r.id, r.status, NOW()
      FROM jsonb_to_recordset($1::jsonb) AS r(id text, status text, "paymentStatus" text)
      JOIN "Order" o ON o.id=r.id
      ON CONFLICT ("orderId") DO UPDATE SET status=EXCLUDED.status, "updatedAt"=NOW()
    `, [payload])
    const payments = await client.query(`
      UPDATE "Order" o SET "paymentStatus"=r."paymentStatus"
      FROM jsonb_to_recordset($1::jsonb) AS r(id text, status text, "paymentStatus" text)
      WHERE o.id=r.id
    `, [payload])
    await client.query('COMMIT')
    console.log(JSON.stringify({ statusRows: statuses.rowCount, paymentRows: payments.rowCount, backupPath }))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
