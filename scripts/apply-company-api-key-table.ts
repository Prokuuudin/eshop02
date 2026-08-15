/**
 * One-off: создать таблицу CompanyApiKey в Neon через WebSocket (443).
 * Prisma CLI (migrate/db push) требует TCP 5432, который блокирует VPN —
 * поэтому таблица создаётся через рабочий канал приложения.
 * Идемпотентен: CREATE TABLE IF NOT EXISTS, можно запускать повторно.
 *
 * Usage: npx tsx scripts/apply-company-api-key-table.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyApiKey" (
      "id"         TEXT NOT NULL,
      "companyId"  TEXT NOT NULL,
      "keyHash"    TEXT NOT NULL,
      "keyPrefix"  TEXT NOT NULL,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastUsedAt" TIMESTAMP(3),
      CONSTRAINT "CompanyApiKey_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompanyApiKey_companyId_key" ON "CompanyApiKey" ("companyId");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CompanyApiKey_keyHash_key" ON "CompanyApiKey" ("keyHash");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompanyApiKey_companyId_idx" ON "CompanyApiKey" ("companyId");
  `)

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name::text FROM information_schema.columns WHERE table_name = 'CompanyApiKey' ORDER BY ordinal_position`
  )
  console.log('CompanyApiKey columns:', columns.map((c) => c.column_name).join(', '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
