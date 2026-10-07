import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { createCipheriv, randomBytes } from 'node:crypto'
import { E2E_ADMIN, E2E_CUSTOMER, E2E_MANAGER, E2E_TOTP_SECRET, requiresMfa } from './helpers'

/** Same format as lib/mfa.ts encryptSecret (which is server-only and can't be imported here). */
function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) {
    throw new Error('e2e: MFA_ENCRYPTION_KEY (32 bytes, base64) must be set — admin fixtures need MFA to sign in')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.')
}

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

  for (const fixture of [E2E_MANAGER, E2E_ADMIN, E2E_CUSTOMER]) {
    const mfa = requiresMfa(fixture)
    const mfaSecret = mfa ? encryptTotpSecret(E2E_TOTP_SECRET) : null
    await sql`
      INSERT INTO "User" (
        id, email, "passwordHash", name, "platformRole", "teamRole",
        "companyId", "companyName", "approvalRequired", "auditLoggingEnabled",
        "mustChangePassword", "bonusPoints", "cardNumber",
        "mfaEnabled", "mfaSecret", "mfaEnrolledAt", "createdAt", "updatedAt"
      ) VALUES (
        ${fixture.id}, ${fixture.email}, ${passwordHash}, ${fixture.name},
        ${fixture.platformRole}, ${fixture.teamRole ?? null},
        ${fixture.companyId ?? null}, ${fixture.companyName ?? null},
        ${fixture.approvalRequired ?? false}, ${fixture.auditLoggingEnabled ?? false},
        false, 0, ${fixture.cardNumber ?? null},
        ${mfa}, ${mfaSecret}, ${mfa ? new Date() : null}, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        "passwordHash" = EXCLUDED."passwordHash",
        "platformRole" = EXCLUDED."platformRole",
        "teamRole" = EXCLUDED."teamRole",
        "companyId" = EXCLUDED."companyId",
        "companyName" = EXCLUDED."companyName",
        "cardNumber" = EXCLUDED."cardNumber",
        "mfaEnabled" = EXCLUDED."mfaEnabled",
        "mfaSecret" = EXCLUDED."mfaSecret",
        "mfaEnrolledAt" = EXCLUDED."mfaEnrolledAt",
        "updatedAt" = now()
    `
  }
}
