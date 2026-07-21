// scripts/_tmp_money_snapshot.ts
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { writeFileSync } from 'node:fs'

neonConfig.webSocketConstructor = ws

const TABLES: Record<string, string[]> = {
  Order: ['subtotal', 'tax', 'delivery', 'discount', 'total'],
  Invoice: ['subtotal', 'taxAmount', 'total', 'paidAmount', 'remainingAmount'],
  Company: ['creditLimit', 'usedCredit'],
  Product: ['price', 'oldPrice'],
  ProductSubscription: ['pricePerUnit'],
  ReturnRequest: ['refundAmount'],
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const snapshot: Record<string, Array<Record<string, unknown>>> = {}
  for (const [table, fields] of Object.entries(TABLES)) {
    const cols = ['id', ...fields].map((c) => `"${c}"`).join(', ')
    const { rows } = await pool.query(`SELECT ${cols} FROM "${table}"`)
    snapshot[table] = rows
  }
  writeFileSync('C:/Temp/money-migration-snapshot.json', JSON.stringify(snapshot))
  console.log(
    'Snapshot written:',
    Object.entries(snapshot).map(([t, r]) => `${t}=${r.length}`).join(', ')
  )
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
