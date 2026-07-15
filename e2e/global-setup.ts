import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { E2E_ADMIN, E2E_MANAGER } from './helpers'

/**
 * /admin охраняется серверной DB-сессией (app/admin/layout.tsx →
 * getServerUser), localStorage-сид ролей больше не проходит. Роли
 * (platformRole/teamRole) через /api/auth/sync задать нельзя by design,
 * поэтому фикстурные юзеры создаются прямо в БД, идемпотентно.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: '.env.local' })
  const sql = neon(process.env.DATABASE_URL as string)
  const passwordHash = await bcrypt.hash(E2E_MANAGER.password, 10)

  for (const fixture of [E2E_MANAGER, E2E_ADMIN]) {
    await sql`
      INSERT INTO "User" (
        id, email, "passwordHash", name, "platformRole", "teamRole",
        "companyId", "companyName", "approvalRequired", "auditLoggingEnabled",
        "mustChangePassword", "bonusPoints", "createdAt", "updatedAt"
      ) VALUES (
        ${fixture.id}, ${fixture.email}, ${passwordHash}, ${fixture.name},
        ${fixture.platformRole}, ${fixture.teamRole ?? null},
        ${fixture.companyId ?? null}, ${fixture.companyName ?? null},
        ${fixture.approvalRequired ?? false}, ${fixture.auditLoggingEnabled ?? false},
        false, 0, now(), now()
      )
      ON CONFLICT (email) DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "platformRole" = EXCLUDED."platformRole",
        "teamRole" = EXCLUDED."teamRole",
        "companyId" = EXCLUDED."companyId",
        "companyName" = EXCLUDED."companyName",
        "updatedAt" = now()
    `
  }
}
