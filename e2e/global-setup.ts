import { config } from 'dotenv'
import bcrypt from 'bcryptjs'
import { createCipheriv, randomBytes } from 'node:crypto'
import { connectE2eDatabase } from './database'
import { E2E_ADMIN, E2E_CUSTOMER, E2E_DORMANT_CUSTOMER, E2E_MANAGER, E2E_PRODUCT_ID, E2E_TOTP_SECRET, requiresMfa } from './helpers'

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
 * (platformRole/teamRole) через API задать нельзя by design,
 * поэтому фикстурные юзеры создаются прямо в БД, идемпотентно. Только в явно заданной
 * изолированной тестовой БД (scripts/e2e-database-guard.ts): у фикстур публичные пароль и TOTP.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: '.env.e2e', quiet: true })
  // Identity re-checked on this connection (playwright.config.ts already did) before any write.
  const client = await connectE2eDatabase()
  try {
    const passwordHash = await bcrypt.hash(E2E_MANAGER.password, 10)
    for (const fixture of [E2E_MANAGER, E2E_ADMIN, E2E_CUSTOMER, E2E_DORMANT_CUSTOMER]) {
      const mfa = requiresMfa(fixture)
      const mfaSecret = mfa ? encryptTotpSecret(E2E_TOTP_SECRET) : null
      await client.query(
        `INSERT INTO "User" (
          id, email, "passwordHash", name, "platformRole", "teamRole",
          "companyId", "companyName", "approvalRequired", "auditLoggingEnabled",
          "mustChangePassword", "bonusPoints", "cardNumber",
          "mfaEnabled", "mfaSecret", "mfaEnrolledAt", "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15,now(),now())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          "passwordHash" = EXCLUDED."passwordHash",
          "platformRole" = EXCLUDED."platformRole",
          "teamRole" = EXCLUDED."teamRole",
          "companyId" = EXCLUDED."companyId",
          "companyName" = EXCLUDED."companyName",
          "mustChangePassword" = EXCLUDED."mustChangePassword",
          "cardNumber" = EXCLUDED."cardNumber",
          "mfaEnabled" = EXCLUDED."mfaEnabled",
          "mfaSecret" = EXCLUDED."mfaSecret",
          "mfaEnrolledAt" = EXCLUDED."mfaEnrolledAt",
          "updatedAt" = now()`,
        [
          fixture.id, fixture.email, passwordHash, fixture.name,
          fixture.platformRole, fixture.teamRole ?? null,
          fixture.companyId ?? null, fixture.companyName ?? null,
          fixture.approvalRequired ?? false, fixture.auditLoggingEnabled ?? false,
          fixture.mustChangePassword ?? false, fixture.cardNumber ?? null,
          mfa, mfaSecret, mfa ? new Date() : null,
        ],
      )
    }
    // The isolated database starts with an empty catalog; specs that need "a product in stock"
    // (fetchRealProduct) get this one.
    await client.query(
      `INSERT INTO "Product" (id, title, "titleEn", "titleLv", brand, category, image, price, stock, "isActive", "updatedAt")
       VALUES ($1, 'E2E шампунь', 'E2E shampoo', 'E2E šampūns', 'E2E Brand', 'hair', '/placeholder.png', 25, 500, true, now())
       ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock, "isActive" = true, category = EXCLUDED.category, "updatedAt" = now()`,
      [E2E_PRODUCT_ID],
    )
  } finally {
    await client.end()
  }
}
