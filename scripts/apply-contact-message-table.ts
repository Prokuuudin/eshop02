/**
 * One-off: создать таблицу ContactMessage в Neon через WebSocket (443).
 * Prisma CLI (migrate/db push) требует TCP 5432, который блокирует VPN —
 * поэтому таблица создаётся через рабочий канал приложения.
 * Идемпотентен: CREATE TABLE IF NOT EXISTS, можно запускать повторно.
 *
 * Usage: npx tsx scripts/apply-contact-message-table.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContactMessage" (
      "id"          TEXT NOT NULL,
      "name"        TEXT NOT NULL,
      "email"       TEXT NOT NULL,
      "subject"     TEXT NOT NULL,
      "message"     TEXT NOT NULL,
      "ipAddress"   TEXT,
      "emailStatus" TEXT NOT NULL DEFAULT 'pending',
      "emailError"  TEXT,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ContactMessage_createdAt_idx"
      ON "ContactMessage" ("createdAt");
  `)

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name::text FROM information_schema.columns WHERE table_name = 'ContactMessage' ORDER BY ordinal_position`
  )
  console.log('ContactMessage columns:', columns.map((c) => c.column_name).join(', '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
