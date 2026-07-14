/**
 * One-off: создать таблицу MediaAsset в Neon через WebSocket (443).
 * Prisma CLI (migrate/db push) требует TCP 5432, который блокирует VPN —
 * поэтому таблица создаётся через рабочий канал приложения.
 * Идемпотентен: CREATE TABLE IF NOT EXISTS, можно запускать повторно.
 *
 * Usage: npx tsx scripts/apply-media-asset-table.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MediaAsset" (
      "name"      TEXT NOT NULL,
      "mimeType"  TEXT NOT NULL,
      "size"      INTEGER NOT NULL,
      "data"      BYTEA NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("name")
    );
  `)

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name::text FROM information_schema.columns WHERE table_name = 'MediaAsset' ORDER BY ordinal_position`
  )
  console.log('MediaAsset columns:', columns.map((c) => c.column_name).join(', '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
