/**
 * One-off: создать таблицу CompanyActivityLog в Neon через WebSocket (443).
 * Prisma CLI (migrate/db push) требует TCP 5432, который блокирует VPN —
 * поэтому таблица создаётся через рабочий канал приложения.
 * Идемпотентен: CREATE TABLE IF NOT EXISTS, можно запускать повторно.
 *
 * Usage: npx tsx scripts/apply-company-activity-log-table.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CompanyActivityLog" (
      "id"        TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "userName"  TEXT,
      "userEmail" TEXT,
      "action"    TEXT NOT NULL,
      "details"   JSONB,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CompanyActivityLog_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompanyActivityLog_companyId_createdAt_idx"
      ON "CompanyActivityLog" ("companyId", "createdAt");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompanyActivityLog_userId_createdAt_idx"
      ON "CompanyActivityLog" ("userId", "createdAt");
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CompanyActivityLog_createdAt_idx"
      ON "CompanyActivityLog" ("createdAt");
  `)

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name::text FROM information_schema.columns WHERE table_name = 'CompanyActivityLog' ORDER BY ordinal_position`
  )
  console.log('CompanyActivityLog columns:', columns.map((c) => c.column_name).join(', '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
