import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const apply = process.argv.includes('--apply')
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')]
    })
)
const { Pool } = createRequire(import.meta.url)('pg')
const pool = new Pool({ connectionString: env.DATABASE_URL })
const damaged = `(item->>'title' LIKE '%�%' OR item->>'title' LIKE '%???%')`
const legacyTitles = {
  '17279': 'Moser – Primat haircut machine',
  '17311': 'Moser – Classic-black hair clipper',
  '17412': 'DIAMOND COSMETICS Semilac Nagu Vilīte 180/240',
  '17413': 'DIAMOND COSMETICS Semilac Nagu Vilīte 100/180',
  '17414': 'DIAMOND COSMETICS Semilac Nagu Vilīte 100/180',
  '17415': 'DIAMOND COSMETICS Semilac Nagu Vilīte 100/180',
  '17416': 'DIAMOND COSMETICS Semilac Nagu Vilīte 80/100',
  '18633': 'JOICO BODY LUXE ROOT LIFT 300ML dzoiko джоико',
  '18645': 'JOICO K-PAK CONDITIONER 300ML джоико dzoiko',
  '18646': 'JOICO K-PAK INTENSE HYDRATOR 250ML / джоико dzoiko',
  '18651': 'JOICO MOISTURE RECOVERY CONDITIONER 300ML dzoiko джоико',
  '18652': 'JOICO MOISTURE RECOVERY LEAVE IN MOISTURIZE 300ML dzoiko джоико',
  '18653': 'JOICO MOISTURE RECOVERY SHAMPOO 300ML dzoiko джоико',
}

try {
  const summary = await pool.query(`
    WITH item_rows AS (
      SELECT item.value AS item
      FROM "Order" o CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value)
    )
    SELECT count(*) FILTER (WHERE ${damaged})::int AS damaged,
      count(*) FILTER (WHERE ${damaged} AND EXISTS (
        SELECT 1 FROM "Product" p WHERE p.id=item->>'id'
      ))::int AS recoverable,
      count(*) FILTER (WHERE item::text LIKE '%�%' OR item::text LIKE '%???%')::int AS "damagedItemDocuments"
    FROM item_rows
  `)
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...summary.rows[0] }))
  if (!apply) {
    const remaining = await pool.query(`
      SELECT DISTINCT item.value->>'id' AS id, item.value->>'title' AS title
      FROM "Order" o CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value)
      WHERE ${damaged} AND NOT EXISTS (
        SELECT 1 FROM "Product" p WHERE p.id=item.value->>'id'
      )
      ORDER BY id
    `)
    console.log(JSON.stringify({ remaining: remaining.rows }, null, 2))
    process.exit(0)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const backup = await client.query(`
      SELECT id, items FROM "Order"
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(items) item(value) WHERE ${damaged})
      ORDER BY id
    `)
    await mkdir('.backups', { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `.backups/order-items-before-title-repair-${stamp}.json`
    await writeFile(backupPath, JSON.stringify(backup.rows), 'utf8')

    const updated = await client.query(`
      UPDATE "Order" o SET items=repaired.items
      FROM (
        SELECT source.id, jsonb_agg(
          CASE WHEN ${damaged} AND p.id IS NOT NULL
            THEN jsonb_set(item, '{title}', to_jsonb(p.title), false)
            ELSE item END ORDER BY ordinality
        ) AS items
        FROM "Order" source
        CROSS JOIN LATERAL jsonb_array_elements(source.items) WITH ORDINALITY AS entries(item, ordinality)
        LEFT JOIN "Product" p ON p.id=item->>'id'
        GROUP BY source.id
        HAVING bool_or(${damaged} AND p.id IS NOT NULL)
      ) repaired WHERE o.id=repaired.id
    `)
    const restoredLegacy = await client.query(`
      UPDATE "Order" o SET items=repaired.items
      FROM (
        SELECT source.id, jsonb_agg(
          CASE WHEN ${damaged} AND legacy.value IS NOT NULL
            THEN jsonb_set(item, '{title}', to_jsonb(legacy.value), false)
            ELSE item END ORDER BY ordinality
        ) AS items
        FROM "Order" source
        CROSS JOIN LATERAL jsonb_array_elements(source.items) WITH ORDINALITY AS entries(item, ordinality)
        LEFT JOIN jsonb_each_text($1::jsonb) legacy ON legacy.key=item->>'id'
        GROUP BY source.id
        HAVING bool_or(${damaged} AND legacy.value IS NOT NULL)
      ) repaired WHERE o.id=repaired.id
    `, [JSON.stringify(legacyTitles)])
    await client.query('COMMIT')
    console.log(JSON.stringify({
      updatedCatalogOrders: updated.rowCount,
      updatedLegacyOrders: restoredLegacy.rowCount,
      backupPath,
    }))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
