# Admin TOTP MFA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in TOTP-based MFA (RFC 6238) for `platformRole=admin` accounts — enrollment, login challenge, disable, and backup-code recovery.

**Architecture:** New `lib/mfa.ts` holds all TOTP/encryption/backup-code logic (pure functions, no Next.js coupling). Five new API routes under `app/api/user/mfa/*` handle self-service enrollment (cookie-authenticated, already covered by the global CSRF middleware). `POST /api/auth/login` gains a branch: if the matched user is an MFA-enabled admin, it creates a short-lived `MfaChallenge` DB row instead of a session, and a new `POST /api/auth/mfa/verify` completes the login once the TOTP/backup code is confirmed. A new `AdminMfaSection` component (hardcoded Russian, matching `AdminAccountDashboard`'s existing convention — this admin surface has no i18n) renders enrollment/status/disable UI.

**Tech Stack:** otplib 13.x (functional API: `generateSecret`, `generate`, `verify`, `generateURI`), qrcode 1.5.x (server-side QR PNG as data URL), Node `crypto` (AES-256-GCM for secret-at-rest encryption), bcryptjs (backup-code hashing, cost 12 — already the project standard as of `lib/server-auth.ts`), Prisma/Postgres.

## Global Constraints

- otplib is a **new major API** vs. the older `authenticator.*` style some engineers may remember — use the functional imports (`generateSecret`, `generate`, `verify`, `generateURI` from `"otplib"`), confirmed against current docs (2026-08-01). `generate`/`verify` are `async` and must be awaited; `generateSecret`/`generateURI` are sync.
- `verify({ secret, token, epochTolerance })` — `epochTolerance: 30` gives a ±30s window (one period each side), matching the design spec's "±1 step" tolerance.
- MFA secret is **encrypted**, not hashed (server must recover the raw secret every login). Key: `MFA_ENCRYPTION_KEY` env var, 32 raw bytes, base64-encoded in the env file.
- Backup codes are bcrypt-hashed at **cost 12** (matches `hashPassword` in `lib/server-auth.ts` post-audit-fix), single-use, removed from the array on consumption.
- `MfaChallenge` token: same convention as `PasswordResetToken`/`InvitationToken` — random 32-byte hex token returned to the client once, only its sha256 hash (reuse the existing exported `hashToken` from `lib/server-auth.ts`) stored in the DB.
- **Simplification vs. the design doc:** the spec's `MfaChallenge.attempts` column is dropped. `checkRateLimit('mfa:token:<token>', { maxAttempts: 5, windowMs: 15*60*1000 })` already tracks per-token attempts (same mechanism `login`/`register-card` use for their own limits) — a second counter on the row would just drift out of sync with no added protection. `MfaChallenge` ends up schema-identical to `PasswordResetToken`.
- `/api/user/mfa/*` routes are cookie-authenticated mutations → already covered by `middleware.ts`'s `guardCookieAuthenticatedApiMutation`. Per the existing house pattern (see `app/api/user/password/route.ts`), the most sensitive ones (setup/confirm/disable) **also** call `guardOrigin(req)` explicitly as defense-in-depth. `/api/auth/mfa/verify` is pre-session (no cookie yet, same situation as `/api/auth/login`) — do **not** call `guardOrigin` there, matching `login/route.ts`.
- No i18n for any of this: `AdminAccountDashboard.tsx` and its siblings are hardcoded Russian-only (verified — no `t()`/`useTranslation` calls anywhere in that file). Follow that, don't introduce translation keys for admin-only surfaces.
- `npm run build` runs `prisma migrate deploy` — any migration folder committed to `prisma/migrations/` auto-applies to live Neon on the next Vercel deploy. This is expected/approved for this feature (user explicitly authorized the schema change), but don't leave a migration folder half-written mid-task.
- `prisma migrate dev` is broken in this repo (see `project_migration_workflow_broken` memory) — use the manual `migrate diff` + `db execute` + `migrate resolve` workflow in Task 1, not `migrate dev`.

---

### Task 1: Schema change — `User` MFA fields + `MfaChallenge` model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_admin_mfa/migration.sql` (timestamp = actual `date +%Y%m%d%H%M%S` at execution time)

**Interfaces:**
- Produces: `User.mfaSecret String?`, `User.mfaEnabled Boolean @default(false)`, `User.mfaBackupCodes String[] @default([])`, `User.mfaEnrolledAt DateTime?`; new model `MfaChallenge { id, tokenHash, userId, expiresAt, createdAt }` with a `user` relation, used by later tasks via `prisma.mfaChallenge.*`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add four fields to the end of `model User` (right before the closing `@@index` lines, alongside the other optional profile fields):

```prisma
  marketingConsentAt  DateTime?
  mfaSecret           String?
  mfaEnabled          Boolean   @default(false)
  mfaBackupCodes      String[]  @default([])
  mfaEnrolledAt       DateTime?
  createdAt           DateTime  @default(now())
```

(i.e. insert the four `mfa*` lines between the existing `marketingConsentAt` and `createdAt` lines.)

Also add `mfaChallenges MfaChallenge[]` to the User relations block, next to `passwordResetTokens`:

```prisma
  passwordResetTokens PasswordResetToken[]
  mfaChallenges       MfaChallenge[]
  invitationTokens    InvitationToken[]
```

Add a new model right after `model PasswordResetToken { ... }`:

```prisma
model MfaChallenge {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Generate the migration SQL from the live schema diff**

Run:
```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Copy the printed SQL (ignore any "Loaded Prisma config..." / "injected env..." banner lines — those aren't part of the SQL) and save it with the `Write` tool (not shell redirection, to avoid capturing the banner lines) to `prisma/migrations/<timestamp>_add_admin_mfa/migration.sql`, where `<timestamp>` is the actual current UTC timestamp in `YYYYMMDDHHMMSS` format.

- [ ] **Step 3: Apply the migration to the live database**

```bash
npx prisma db execute --file prisma/migrations/<timestamp>_add_admin_mfa/migration.sql
```
If it fails with `P1001` (connection), retry once — this is a known transient issue over the Neon TCP port (see `project_neon_connectivity` memory).

- [ ] **Step 4: Register the migration as applied**

```bash
npx prisma migrate resolve --applied <timestamp>_add_admin_mfa
```

- [ ] **Step 5: Regenerate the Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```
Expected: no new errors (the generated client now has the new fields/model, nothing references them yet so this should be a clean pass).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(mfa): add User MFA fields and MfaChallenge model"
```

---

### Task 2: Dependencies + env var

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `otplib`, `qrcode` importable from application code; `@types/qrcode` for TS; `process.env.MFA_ENCRYPTION_KEY` documented.

- [ ] **Step 1: Install packages**

```bash
npm install otplib@^13.4.1 qrcode@^1.5.4
npm install -D @types/qrcode@^1.5.6
```

- [ ] **Step 2: Add the env var placeholder**

Open `.env.example` and add, near the other auth-related secrets:

```
# 32 random bytes, base64-encoded — used to encrypt TOTP secrets at rest (AES-256-GCM).
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
MFA_ENCRYPTION_KEY=
```

- [ ] **Step 3: Generate a real key for local dev and add it to `.env.local`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Add the output as `MFA_ENCRYPTION_KEY=<value>` to `.env.local` (not committed — same file already holds `DATABASE_URL` etc.).

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: clean (packages installed, nothing imports them yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(mfa): add otplib/qrcode dependencies and MFA_ENCRYPTION_KEY placeholder"
```

---

### Task 3: `lib/mfa.ts` — core TOTP/encryption/backup-code helpers

**Files:**
- Create: `lib/mfa.ts`
- Test: `lib/mfa.test.ts`

**Interfaces:**
- Consumes: `process.env.MFA_ENCRYPTION_KEY`.
- Produces (used by Tasks 4-10):
  - `encryptSecret(secret: string): string`
  - `decryptSecret(encrypted: string): string`
  - `generateTotpSecret(): string`
  - `buildOtpauthUri(email: string, secret: string): string`
  - `verifyTotpCode(secret: string, code: string): Promise<boolean>`
  - `generateBackupCodes(): string[]` (8 plaintext codes)
  - `hashBackupCodes(codes: string[]): Promise<string[]>`
  - `consumeBackupCode(hashes: string[], code: string): Promise<{ ok: boolean; remaining: string[] }>`

- [ ] **Step 1: Write the failing tests**

Create `lib/mfa.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
} from './mfa'
import { generate } from 'otplib'

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('produces different ciphertext for the same secret each time (random IV)', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP')
    const b = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(a).not.toBe(b)
  })
})

describe('generateTotpSecret / buildOtpauthUri', () => {
  it('generates a base32-looking secret', () => {
    const secret = generateTotpSecret()
    expect(secret.length).toBeGreaterThan(10)
    expect(secret).toMatch(/^[A-Z2-7]+=*$/)
  })

  it('builds an otpauth:// URI containing the issuer and email', () => {
    const uri = buildOtpauthUri('admin@test.com', 'JBSWY3DPEHPK3PXP')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('admin%40test.com')
  })
})

describe('verifyTotpCode', () => {
  it('accepts the current valid code', async () => {
    const secret = generateTotpSecret()
    const code = await generate({ secret })
    expect(await verifyTotpCode(secret, code)).toBe(true)
  })

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret()
    expect(await verifyTotpCode(secret, '000000')).toBe(false)
  })

  it('rejects a non-6-digit input without touching otplib', async () => {
    const secret = generateTotpSecret()
    expect(await verifyTotpCode(secret, 'abcdef')).toBe(false)
    expect(await verifyTotpCode(secret, '12345')).toBe(false)
  })
})

describe('backup codes', () => {
  it('generates 8 unique codes', () => {
    const codes = generateBackupCodes()
    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
  })

  it('hashes codes and later consumes exactly one, removing it from the list', async () => {
    const codes = generateBackupCodes()
    const hashes = await hashBackupCodes(codes)

    const { ok, remaining } = await consumeBackupCode(hashes, codes[3])
    expect(ok).toBe(true)
    expect(remaining).toHaveLength(7)

    const { ok: reuseOk } = await consumeBackupCode(remaining, codes[3])
    expect(reuseOk).toBe(false)
  })

  it('rejects a code that was never issued', async () => {
    const codes = generateBackupCodes()
    const hashes = await hashBackupCodes(codes)
    const { ok } = await consumeBackupCode(hashes, 'not-a-real-code')
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run lib/mfa.test.ts
```
Expected: FAIL — `lib/mfa.ts` doesn't exist yet.

- [ ] **Step 3: Implement `lib/mfa.ts`**

```typescript
import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { generateSecret, generate, verify, generateURI } from 'otplib'

const ISSUER = 'hairshop-pro.lv'
const BACKUP_CODE_COUNT = 8
const BACKUP_CODE_BCRYPT_COST = 12
const EPOCH_TOLERANCE_SECONDS = 30 // +/- one 30s TOTP step, covers normal clock drift

function getEncryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY
  if (!raw) throw new Error('MFA_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

/** AES-256-GCM, random 12-byte IV per call. Output: "iv.authTag.ciphertext", each base64. */
export function encryptSecret(secret: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.')
}

export function decryptSecret(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split('.')
  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

export function generateTotpSecret(): string {
  return generateSecret()
}

export function buildOtpauthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret })
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS })
  return result.valid
}

/** 8 codes, 10 hex chars each (40 bits of entropy) — shown once, never persisted in plaintext. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'))
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BACKUP_CODE_BCRYPT_COST)))
}

/** Single-use: on match, returns the hash list with that entry removed. */
export async function consumeBackupCode(
  hashes: string[],
  code: string
): Promise<{ ok: boolean; remaining: string[] }> {
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code, hashes[i])) {
      return { ok: true, remaining: [...hashes.slice(0, i), ...hashes.slice(i + 1)] }
    }
  }
  return { ok: false, remaining: hashes }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run lib/mfa.test.ts
```
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/mfa.ts lib/mfa.test.ts
git commit -m "feat(mfa): TOTP/encryption/backup-code core helpers"
```

---

### Task 4: `POST /api/user/mfa/setup`

**Files:**
- Create: `app/api/user/mfa/setup/route.ts`
- Test: `app/api/user/mfa/setup/route.test.ts`

**Interfaces:**
- Consumes: `getServerUser()` from `@/lib/server-auth`; `generateTotpSecret`, `buildOtpauthUri`, `encryptSecret` from `@/lib/mfa`; `guardOrigin` from `@/lib/api-guard`.
- Produces: `POST` handler returning `{ secret: string, qrCodeDataUrl: string }` on 200.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  generateTotpSecret: vi.fn(() => 'RAWSECRET'),
  buildOtpauthUri: vi.fn(() => 'otpauth://totp/test'),
  encryptSecret: vi.fn(() => 'ENCRYPTED'),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,xxx') } }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

function makeRequest() {
  return new NextRequest('http://localhost/api/user/mfa/setup', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie: 'eshop_session=tok' },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/user/mfa/setup', () => {
  it('rejects unauthenticated callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('rejects non-admin callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', platformRole: 'customer' } as never)
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  it('generates and stores an encrypted pending secret for an admin', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', email: 'admin@test.com', platformRole: 'admin' } as never)
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.secret).toBe('RAWSECRET')
    expect(json.qrCodeDataUrl).toBe('data:image/png;base64,xxx')
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaSecret: 'ENCRYPTED' },
    })
  })

  it('rejects a cross-site Origin', async () => {
    const req = new NextRequest('http://localhost/api/user/mfa/setup', {
      method: 'POST',
      headers: { origin: 'https://evil.test', cookie: 'eshop_session=tok' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(getServerUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/user/mfa/setup/route.test.ts
```
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { generateTotpSecret, buildOtpauthUri, encryptSecret } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/setup — start (or restart) TOTP enrollment for the signed-in admin.
// Stores an encrypted pending secret; mfaEnabled stays false until /confirm verifies a code
// against it, so an abandoned setup never grants a working second factor.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const secret = generateTotpSecret()
  const uri = buildOtpauthUri(user.email, secret)
  const qrCodeDataUrl = await QRCode.toDataURL(uri)

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptSecret(secret) },
  })

  return NextResponse.json({ secret, qrCodeDataUrl })
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/user/mfa/setup/route.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/user/mfa/setup
git commit -m "feat(mfa): add MFA enrollment start endpoint"
```

---

### Task 5: `POST /api/user/mfa/confirm`

**Files:**
- Create: `app/api/user/mfa/confirm/route.ts`
- Test: `app/api/user/mfa/confirm/route.test.ts`

**Interfaces:**
- Consumes: `getServerUser`, `decryptSecret`, `verifyTotpCode`, `generateBackupCodes`, `hashBackupCodes` from Task 3/existing.
- Produces: `POST` handler returning `{ backupCodes: string[] }` on success (plaintext, shown once).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(() => ['a1', 'a2']),
  hashBackupCodes: vi.fn(async (codes: string[]) => codes.map((c) => `hash(${c})`)),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(code: string) {
  return new NextRequest('http://localhost/api/user/mfa/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify({ code }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
})

describe('POST /api/user/mfa/confirm', () => {
  it('rejects when there is no pending secret', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: null } as never)
    const res = await POST(makeRequest('123456'))
    expect(res.status).toBe(400)
  })

  it('rejects a wrong code without enabling MFA', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED' } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest('000000'))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('enables MFA and returns backup codes on a correct code', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED' } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest('123456'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.backupCodes).toEqual(['a1', 'a2'])
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: ['hash(a1)', 'hash(a2)'],
        mfaEnrolledAt: expect.any(Date),
      },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/user/mfa/confirm/route.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, generateBackupCodes, hashBackupCodes } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/confirm — finish enrollment: prove the pending secret from /setup
// actually made it into the authenticator app before it's trusted for login.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code : ''

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaSecret: true } })
  if (!dbUser?.mfaSecret) {
    return NextResponse.json({ error: 'no_pending_setup' }, { status: 400 })
  }

  const valid = await verifyTotpCode(decryptSecret(dbUser.mfaSecret), code)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  const backupCodes = generateBackupCodes()
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: await hashBackupCodes(backupCodes),
      mfaEnrolledAt: new Date(),
    },
  })

  return NextResponse.json({ backupCodes })
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/user/mfa/confirm/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/user/mfa/confirm
git commit -m "feat(mfa): add MFA enrollment confirm endpoint with backup codes"
```

---

### Task 6: `GET /api/user/mfa/status`

**Files:**
- Create: `app/api/user/mfa/status/route.ts`
- Test: `app/api/user/mfa/status/route.test.ts`

**Interfaces:**
- Produces: `GET` handler returning `{ enabled: boolean, enrolledAt: string | null, backupCodesRemaining: number }`. Consumed by the `AdminMfaSection` component (Task 11).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

function makeRequest() {
  return new NextRequest('http://localhost/api/user/mfa/status', { headers: { cookie: 'eshop_session=tok' } })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/user/mfa/status', () => {
  it('rejects unauthenticated callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('reports enabled state and remaining backup codes', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaEnrolledAt: new Date('2026-08-01T00:00:00.000Z'),
      mfaBackupCodes: ['h1', 'h2', 'h3'],
    } as never)

    const res = await GET(makeRequest())
    const json = await res.json()

    expect(json).toEqual({
      enabled: true,
      enrolledAt: '2026-08-01T00:00:00.000Z',
      backupCodesRemaining: 3,
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/user/mfa/status/route.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

// GET /api/user/mfa/status — used by the admin account "Security" section to render
// enrollment state without exposing the secret or backup-code hashes themselves.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaEnrolledAt: true, mfaBackupCodes: true },
  })

  return NextResponse.json({
    enabled: dbUser?.mfaEnabled ?? false,
    enrolledAt: dbUser?.mfaEnrolledAt ? dbUser.mfaEnrolledAt.toISOString() : null,
    backupCodesRemaining: dbUser?.mfaBackupCodes.length ?? 0,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/user/mfa/status/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/user/mfa/status
git commit -m "feat(mfa): add MFA status endpoint"
```

---

### Task 7: `POST /api/user/mfa/disable`

**Files:**
- Create: `app/api/user/mfa/disable/route.ts`
- Test: `app/api/user/mfa/disable/route.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` from `@/lib/server-auth`; `decryptSecret`, `verifyTotpCode`, `consumeBackupCode` from `@/lib/mfa`; `createSession`, `SESSION_COOKIE` from `@/lib/server-auth`.
- Produces: `POST` handler that clears MFA and rotates sessions (same pattern as `POST /api/user/password`).

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, session: { deleteMany: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  consumeBackupCode: vi.fn(),
})

import { prisma } from '@/lib/prisma'
import { getServerUser, verifyPassword, createSession } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/user/mfa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    passwordHash: 'HASH', mfaSecret: 'ENCRYPTED', mfaBackupCodes: [],
  } as never)
  vi.mocked(createSession).mockResolvedValue('new-token')
})

describe('POST /api/user/mfa/disable', () => {
  it('rejects a wrong password even with a valid code', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'wrong', code: '123456' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects a wrong code even with the right password', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'right', code: '000000' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('disables MFA and rotates sessions on success', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest({ currentPassword: 'right', code: '123456' }))

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
    })
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'admin1' } })
    expect(createSession).toHaveBeenCalledWith('admin1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/user/mfa/disable/route.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser, verifyPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/disable — requires both the current password and a valid TOTP/backup
// code (defense in depth, mirrors how password change requires the old password). Rotates
// sessions on success: if an attacker who stole the current session tries to strip MFA
// remotely, the real admin's other sessions die and they'll notice.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const code = typeof body.code === 'string' ? body.code : ''

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, mfaSecret: true, mfaBackupCodes: true },
  })
  if (!dbUser?.mfaSecret) {
    return NextResponse.json({ error: 'mfa_not_enabled' }, { status: 400 })
  }

  const passwordOk = await verifyPassword(currentPassword, dbUser.passwordHash)
  if (!passwordOk) {
    return NextResponse.json({ error: 'invalid_current_password' }, { status: 401 })
  }

  const codeOk =
    (await verifyTotpCode(decryptSecret(dbUser.mfaSecret), code)) ||
    (await consumeBackupCode(dbUser.mfaBackupCodes, code)).ok
  if (!codeOk) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
  })

  await prisma.session.deleteMany({ where: { userId: user.id } })
  const newToken = await createSession(user.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/user/mfa/disable/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/user/mfa/disable
git commit -m "feat(mfa): add MFA disable endpoint with session rotation"
```

---

### Task 8: `POST /api/user/mfa/backup-codes/regenerate`

**Files:**
- Create: `app/api/user/mfa/backup-codes/regenerate/route.ts`
- Test: `app/api/user/mfa/backup-codes/regenerate/route.test.ts`

**Interfaces:**
- Consumes: `decryptSecret`, `verifyTotpCode`, `generateBackupCodes`, `hashBackupCodes` from `@/lib/mfa`.
- Produces: `POST` handler returning `{ backupCodes: string[] }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(() => ['n1', 'n2']),
  hashBackupCodes: vi.fn(async (codes: string[]) => codes.map((c) => `hash(${c})`)),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(code: string) {
  return new NextRequest('http://localhost/api/user/mfa/backup-codes/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify({ code }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED', mfaEnabled: true } as never)
})

describe('POST /api/user/mfa/backup-codes/regenerate', () => {
  it('rejects a wrong code', async () => {
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest('000000'))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('replaces backup codes on a correct code', async () => {
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest('123456'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.backupCodes).toEqual(['n1', 'n2'])
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaBackupCodes: ['hash(n1)', 'hash(n2)'] },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/user/mfa/backup-codes/regenerate/route.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, generateBackupCodes, hashBackupCodes } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/backup-codes/regenerate — TOTP code only (not the password): this
// doesn't weaken anything, since the caller already has an authenticated session.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code : ''

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })
  if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
    return NextResponse.json({ error: 'mfa_not_enabled' }, { status: 400 })
  }

  const valid = await verifyTotpCode(decryptSecret(dbUser.mfaSecret), code)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  const backupCodes = generateBackupCodes()
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaBackupCodes: await hashBackupCodes(backupCodes) },
  })

  return NextResponse.json({ backupCodes })
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/user/mfa/backup-codes/regenerate/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/user/mfa/backup-codes
git commit -m "feat(mfa): add backup-code regeneration endpoint"
```

---

### Task 9: Extend `POST /api/auth/login` to branch into an MFA challenge

**Files:**
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/login/route.test.ts` (extend, don't rewrite)

**Interfaces:**
- Consumes: `hashToken` from `@/lib/server-auth` (already exported); new `prisma.mfaChallenge.create`.
- Produces: when the matched user has `platformRole==='admin' && mfaEnabled===true`, responds `200 { mfaRequired: true, challengeToken }` and does **not** set a session cookie. Otherwise unchanged.

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

Add this import at the top alongside the existing ones:
```typescript
import { randomBytes } from 'node:crypto'
```
and extend the `vi.mock('@/lib/prisma', ...)` factory to include `mfaChallenge: { create: vi.fn() }`:
```typescript
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() }, mfaChallenge: { create: vi.fn() } },
}))
```
Then add a new test inside `describe('POST /api/auth/login', ...)`:
```typescript
  it('creates an MFA challenge instead of a session for an MFA-enabled admin, without setting a cookie', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.mfaRequired).toBe(true)
    expect(typeof json.challengeToken).toBe('string')
    expect(json.user).toBeUndefined()
    expect(createSession).not.toHaveBeenCalled()
    expect(res.cookies.get('eshop_session')).toBeUndefined()
    expect(prisma.mfaChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin1' }),
    })
  })
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/auth/login/route.test.ts
```
Expected: FAIL — current route always creates a session.

- [ ] **Step 3: Modify `app/api/auth/login/route.ts`**

Add the import at the top, next to the existing `server-auth` import:
```typescript
import { randomBytes } from 'node:crypto'
import { hashToken } from '@/lib/server-auth'
```

Replace the block from `const valid = await verifyPassword(...)` through the final `return res` with:

```typescript
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    // Successful login — reset attempt counter
    await Promise.all(limitKeys.map((key) => resetRateLimit(key)))

    if (user.platformRole === 'admin' && user.mfaEnabled) {
      const challengeToken = randomBytes(32).toString('hex')
      await prisma.mfaChallenge.create({
        data: {
          tokenHash: hashToken(challengeToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      })
      return NextResponse.json({ mfaRequired: true, challengeToken })
    }

    const token = await createSession(user.id)

    const res = NextResponse.json({ user: mapDbToServerUser(user) })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
```

(The `user` object from `prisma.user.findUnique`/`findFirst` already includes `platformRole` and, after Task 1's migration, `mfaEnabled` — both are plain columns on the same row already being fetched, no query change needed.)

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/auth/login/route.test.ts
```
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login
git commit -m "feat(mfa): branch login into an MFA challenge for MFA-enabled admins"
```

---

### Task 10: `POST /api/auth/mfa/verify`

**Files:**
- Create: `app/api/auth/mfa/verify/route.ts`
- Test: `app/api/auth/mfa/verify/route.test.ts`

**Interfaces:**
- Consumes: `hashToken`, `createSession`, `mapDbToServerUser`, `SESSION_COOKIE` from `@/lib/server-auth`; `decryptSecret`, `verifyTotpCode`, `consumeBackupCode` from `@/lib/mfa`; `checkRateLimit` from `@/lib/rate-limit`.
- Produces: on success, same response shape as `/api/auth/login`'s non-MFA branch: `{ user }` + session cookie.

- [ ] **Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { mfaChallenge: { findUnique: vi.fn(), delete: vi.fn() }, user: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  hashToken: vi.fn((t: string) => `hash(${t})`),
  createSession: vi.fn(),
  mapDbToServerUser: vi.fn((u) => u),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  consumeBackupCode: vi.fn(async () => ({ ok: false, remaining: [] })),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(createSession).mockResolvedValue('new-token')
})

describe('POST /api/auth/mfa/verify', () => {
  it('rejects a missing/expired challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('rejects when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(429)
    expect(prisma.mfaChallenge.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a stale challenge whose user is no longer an MFA-enabled admin', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', platformRole: 'customer', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    } as never)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects an expired challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: [] },
    } as never)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('accepts a valid TOTP code, creates a session, and deletes the challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: [] },
    } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.user.id).toBe('u1')
    expect(createSession).toHaveBeenCalledWith('u1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
    expect(prisma.mfaChallenge.delete).toHaveBeenCalledWith({ where: { tokenHash: 'hash(tok)' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run app/api/auth/mfa/verify/route.test.ts
```

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// POST /api/auth/mfa/verify — second step of admin login, after /api/auth/login returned
// { mfaRequired: true, challengeToken }. Deliberately does not call guardOrigin: like
// /api/auth/login, there's no session cookie yet at this point, so it isn't CSRF-able.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body.code === 'string' ? body.code : ''

  if (!challengeToken) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const limits = await Promise.all([
    checkRateLimit(`mfa:token:${challengeToken}`, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
    checkRateLimit(`mfa:ip:${getClientIp(req)}`, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
  ])
  if (limits.some((l) => l.limited)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { tokenHash: hashToken(challengeToken) },
    include: { user: true },
  })
  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const { user } = challenge
  // Re-check live state, not just the fact that a challenge exists — role/MFA status
  // may have changed in the (up to 5-minute) gap since /api/auth/login created it.
  if (user.platformRole !== 'admin' || !user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const totpOk = await verifyTotpCode(decryptSecret(user.mfaSecret), code)
  let remainingBackupCodes = user.mfaBackupCodes
  let usedBackupCode = false
  if (!totpOk) {
    const backupResult = await consumeBackupCode(user.mfaBackupCodes, code)
    if (!backupResult.ok) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }
    remainingBackupCodes = backupResult.remaining
    usedBackupCode = true
  }

  if (usedBackupCode) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: remainingBackupCodes } })
  }
  await prisma.mfaChallenge.delete({ where: { tokenHash: challenge.tokenHash } })

  const token = await createSession(user.id)
  const res = NextResponse.json({ user: mapDbToServerUser(user) })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run app/api/auth/mfa/verify/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/mfa
git commit -m "feat(mfa): add login MFA challenge verification endpoint"
```

---

### Task 11: `AdminMfaSection` component + wire into the admin dashboard

**Files:**
- Create: `components/admin/AdminMfaSection.tsx`
- Modify: `components/admin/AdminAccountDashboard.tsx:225-271` (insert the new section into the returned JSX, right after the profile hero block)

**Interfaces:**
- Consumes: `GET /api/user/mfa/status`, `POST /api/user/mfa/setup`, `POST /api/user/mfa/confirm`, `POST /api/user/mfa/disable`, `POST /api/user/mfa/backup-codes/regenerate` (all from Task 4-8).
- Produces: `export default function AdminMfaSection(): React.ReactElement`, no props (reads its own status via `fetch` on mount, matching how `AdminAccountDashboard` itself fetches `/api/admin/access-requests` etc.).

This is a UI component with network calls — no meaningful unit test ROI here (the codebase has no precedent of testing client components that are mostly fetch + local state; route-level tests already cover the actual logic). Skipping a test file for this task is consistent with the rest of `components/account/*` (e.g. `AccountPasswordSection.tsx` has no corresponding test file either).

- [ ] **Step 1: Create `components/admin/AdminMfaSection.tsx`**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = { enabled: boolean; enrolledAt: string | null; backupCodesRemaining: number };
type View = 'idle' | 'enrolling' | 'showing-backup-codes' | 'disabling' | 'regenerating';

export default function AdminMfaSection(): React.ReactElement {
    const [status, setStatus] = useState<Status | null>(null);
    const [view, setView] = useState<View>('idle');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const loadStatus = () => {
        fetch('/api/user/mfa/status')
            .then((r) => r.json())
            .then((json: Status) => setStatus(json))
            .catch(() => {});
    };

    useEffect(loadStatus, []);

    const reset = () => {
        setView('idle');
        setCode('');
        setCurrentPassword('');
        setError('');
        setQrCodeDataUrl(null);
    };

    const startEnroll = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/setup', { method: 'POST' });
            if (!res.ok) throw new Error();
            const json = await res.json() as { qrCodeDataUrl: string };
            setQrCodeDataUrl(json.qrCodeDataUrl);
            setView('enrolling');
        } catch {
            setError('Не удалось начать настройку. Попробуйте ещё раз.');
        } finally {
            setBusy(false);
        }
    };

    const confirmEnroll = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                setError('Неверный код. Проверьте приложение-аутентификатор и попробуйте снова.');
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, code }),
            });
            if (!res.ok) {
                setError('Неверный пароль или код.');
                return;
            }
            reset();
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    const regenerateBackupCodes = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/user/mfa/backup-codes/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                setError('Неверный код.');
                return;
            }
            const json = await res.json() as { backupCodes: string[] };
            setBackupCodes(json.backupCodes);
            setView('showing-backup-codes');
            setCode('');
            loadStatus();
        } catch {
            setError('Ошибка сервера. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    if (!status) return <></>;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex items-center gap-2">
                {status.enabled ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                    <ShieldOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                )}
                <h2 className="text-sm font-semibold text-foreground">Двухфакторная аутентификация</h2>
            </div>

            {view === 'idle' && !status.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Не включена. Рекомендуем включить, чтобы пароль был не единственной защитой доступа к админке.
                    </p>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <Button size="sm" onClick={() => void startEnroll()} disabled={busy}>
                        Включить
                    </Button>
                </div>
            )}

            {view === 'idle' && status.enabled && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Включена{status.enrolledAt ? ` с ${new Date(status.enrolledAt).toLocaleDateString('ru-RU')}` : ''}.
                        Резервных кодов осталось: {status.backupCodesRemaining}.
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setView('regenerating')}>
                            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                            Новые резервные коды
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setView('disabling')}>
                            Отключить
                        </Button>
                    </div>
                </div>
            )}

            {view === 'enrolling' && qrCodeDataUrl && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Отсканируйте QR-код в Google Authenticator / Microsoft Authenticator и введите текущий код.
                    </p>
                    <Image src={qrCodeDataUrl} alt="MFA QR code" width={200} height={200} unoptimized />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="max-w-[160px]"
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void confirmEnroll()} disabled={busy || code.length !== 6}>
                            Подтвердить
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}

            {view === 'showing-backup-codes' && (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                        Сохраните эти коды — они больше не будут показаны. Каждый работает один раз, если приложение-аутентификатор недоступно.
                    </p>
                    <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">
                        {backupCodes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <Button size="sm" onClick={reset}>Готово</Button>
                </div>
            )}

            {view === 'disabling' && (
                <div className="space-y-3">
                    <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Текущий пароль"
                        autoComplete="current-password"
                    />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Код из приложения"
                        maxLength={6}
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void disable()} disabled={busy}>
                            Отключить 2FA
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}

            {view === 'regenerating' && (
                <div className="space-y-3">
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Код из приложения"
                        maxLength={6}
                    />
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => void regenerateBackupCodes()} disabled={busy || code.length !== 6}>
                            Перегенерировать
                        </Button>
                        <Button size="sm" variant="outline" onClick={reset}>Отмена</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Wire it into `AdminAccountDashboard.tsx`**

Add the import at the top, next to the other component imports:
```typescript
import AdminMfaSection from '@/components/admin/AdminMfaSection';
```

Insert `<AdminMfaSection />` right after the closing `</div>` of the "Profile hero" block and before the `{/* Pending requests banner */}` comment:

```tsx
            </div>

            <AdminMfaSection />

            {/* Pending requests banner */}
```

- [ ] **Step 3: Verify manually**

```bash
npx tsc --noEmit
```
Expected: clean. Then run the app (see Task 12's manual check — both are verified together there, since the enroll flow can't be exercised without also having Task 12's login-side change).

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminMfaSection.tsx components/admin/AdminAccountDashboard.tsx
git commit -m "feat(mfa): add admin Security section for MFA enrollment/disable"
```

---

### Task 12: Client login flow — handle `mfaRequired`

**Files:**
- Modify: `lib/auth.ts:365-416` (`loginUserAuto`, plus a new exported `verifyMfaAndLogin`)
- Modify: `components/auth/LoginForm.tsx`

**Interfaces:**
- Produces: `loginUserAuto(...)` return type gains optional `mfaRequired?: boolean; challengeToken?: string`. New `verifyMfaAndLogin(challengeToken: string, code: string): Promise<{ success: boolean; error?: string }>`.

- [ ] **Step 1: Modify `lib/auth.ts`**

Replace the whole `loginUserAuto` function (lines 365-416) with:

```typescript
function applyLoggedInUser(rawUser: Partial<User> & { id: string; email: string }): void {
    const users = readUsers();
    const verifiedUser = normalizeUser({ ...rawUser, password: '' });
    const nextUsers = users.filter(
        (u) => u.id !== verifiedUser.id && u.email !== verifiedUser.email
    );
    writeUsers([...nextUsers, verifiedUser]);

    if (verifiedUser.companyId) {
        useCompanyStore.getState().setCurrentCompany(verifiedUser.companyId);
    }
    writeCurrentUser(verifiedUser);
    notifyAuthChanged();
}

/**
 * Authenticates against the server (bcrypt-verified, rate-limited) — the client
 * never decides whether a password is correct. `identifier` may be an email or
 * a client card number; the server looks up User.email or User.cardNumber
 * directly without trusting any locally-cached directory. On success, the local mirror is refreshed for UI
 * purposes only, with the password field blanked — it is never the source of
 * truth for auth again once a login round-trip has verified the account.
 *
 * MFA-enabled admins don't get a session here: the server responds with
 * `mfaRequired` + a short-lived `challengeToken` instead, and the caller must
 * follow up with `verifyMfaAndLogin`.
 */
export const loginUserAuto = async (
    identifier: string,
    password: string
): Promise<{ success: boolean; error?: string; mfaRequired?: boolean; challengeToken?: string }> => {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes('@');

    let res: Response;
    try {
        res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: trimmed,
                password,
            }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }

    if (res.status === 429) {
        return { success: false, error: 'Слишком много попыток входа. Попробуйте позже.' };
    }
    if (!res.ok) {
        return {
            success: false,
            error: isEmail ? 'Неверный email или пароль' : 'Неверный номер карты или пароль',
        };
    }

    const payload = (await res.json().catch(() => ({}))) as {
        user?: Partial<User> & { id: string; email: string };
        mfaRequired?: boolean;
        challengeToken?: string;
    };

    if (payload.mfaRequired && payload.challengeToken) {
        return { success: false, mfaRequired: true, challengeToken: payload.challengeToken };
    }
    if (!payload.user) {
        return { success: false, error: 'Не удалось загрузить аккаунт' };
    }

    applyLoggedInUser(payload.user);
    return { success: true };
};

/** Second step of an MFA-gated login — completes what loginUserAuto started. */
export const verifyMfaAndLogin = async (
    challengeToken: string,
    code: string
): Promise<{ success: boolean; error?: string }> => {
    let res: Response;
    try {
        res = await fetch('/api/auth/mfa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeToken, code }),
        });
    } catch {
        return { success: false, error: 'Сервер недоступен. Попробуйте позже.' };
    }

    if (res.status === 429) {
        return { success: false, error: 'Слишком много попыток. Попробуйте позже.' };
    }
    if (!res.ok) {
        return { success: false, error: 'Неверный код' };
    }

    const payload = (await res.json().catch(() => ({}))) as { user?: Partial<User> & { id: string; email: string } };
    if (!payload.user) {
        return { success: false, error: 'Не удалось загрузить аккаунт' };
    }

    applyLoggedInUser(payload.user);
    return { success: true };
};
```

- [ ] **Step 2: Modify `components/auth/LoginForm.tsx`**

Add the import:
```typescript
import { hasAdminUsers, loginUserAuto, verifyMfaAndLogin } from '@/lib/auth';
```
(replaces the existing `import { hasAdminUsers, loginUserAuto } from '@/lib/auth';` line)

Add state right after the existing `const [submitting, setSubmitting] = useState(false);` line:
```typescript
    const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState('');
```

Replace `handleSubmit` with:
```typescript
    const finishLogin = () => {
        if (onSuccess) { onSuccess(); return; }
        const redirect = searchParams.get('redirect');
        if (redirect) return router.push(redirect);
        router.push('/account');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setError('');
        const res = await loginUserAuto(identifier.trim(), password);
        setSubmitting(false);
        if (res.mfaRequired && res.challengeToken) {
            setMfaChallengeToken(res.challengeToken);
            return;
        }
        if (!res.success) return setError(res.error || t('form.error'));
        finishLogin();
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || !mfaChallengeToken) return;
        setSubmitting(true);
        setError('');
        const res = await verifyMfaAndLogin(mfaChallengeToken, mfaCode);
        setSubmitting(false);
        if (!res.success) return setError(res.error || t('form.error'));
        finishLogin();
    };
```

Add the MFA-step form right before the final closing `</form>` — actually, since it needs to *replace* the password form once a challenge exists, wrap the return statement's form body in a conditional. Change the component's `return (...)` from a single `<form>` into:

```tsx
    if (mfaChallengeToken) {
        return (
            <form onSubmit={handleMfaSubmit} className="space-y-3 bg-card p-3 rounded-lg">
                {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
                <div>
                    <label htmlFor="login-mfa-code" className="block mb-1 text-sm text-foreground">
                        {t('auth.mfaCode', 'Код из приложения-аутентификатора')}
                    </label>
                    <Input
                        id="login-mfa-code"
                        type="text"
                        inputMode="numeric"
                        className="bg-card text-foreground border-border"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        maxLength={6}
                        autoFocus
                        required
                    />
                </div>
                <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={mfaCode.length !== 6}>
                        {t('auth.login')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setMfaChallengeToken(null); setMfaCode(''); setError(''); }}>
                        {t('common.cancel', 'Отмена')}
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form
```

(i.e. insert the `if (mfaChallengeToken) { return (...) }` block right before the existing `return (` line, leaving the rest of the existing JSX — the password-step form — unchanged below it.)

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run lib/auth.test.ts
```
Expected: clean typecheck; `lib/auth.test.ts` (pre-existing, 21 tests) still passes — `loginUserAuto`'s success path behavior is unchanged for non-MFA users, only its return type gained optional fields.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts components/auth/LoginForm.tsx
git commit -m "feat(mfa): handle MFA challenge step in the client login flow"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit/integration test suite**

```bash
npm run test:unit
```
Expected: all tests pass, including every new file from Tasks 3-10 and the extended `lib/auth.test.ts` / `app/api/auth/login/route.test.ts`.

- [ ] **Step 2: Full typecheck**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: clean (or only pre-existing warnings untouched by this work).

- [ ] **Step 4: Manual smoke test**

Use the `verify` skill (or `npm run dev`) to actually drive this end-to-end against a real (non-mocked) local DB, since Tasks 1-12 are unit-tested with everything mocked and this is the first point real Prisma/otplib/qrcode wiring gets exercised together:
1. Log in as an existing admin account, confirm `AdminMfaSection` renders "Не включена" with an "Включить" button.
2. Click "Включить" → QR renders → scan with an authenticator app (or compute a code manually via `otplib`'s `generate({ secret })` in a scratch script using the `secret` shown alongside the QR) → enter code → confirm backup codes are shown once.
3. Reload `/account` → status now shows "Включена" with remaining backup-code count 8.
4. Log out, log back in with the same admin's password → should now be prompted for a 6-digit code instead of landing directly in `/account`. Enter the current TOTP code → lands in `/account` as before.
5. Log in again, this time deliberately entering a wrong code 5 times → 6th attempt should return 429 (rate-limited).
6. From `/account`, use "Отключить" with the current password + a valid code → status returns to "Не включена"; confirm other open sessions for that account (if any) were killed.

- [ ] **Step 5: Update memory**

This is a durable, non-obvious fact about the codebase worth persisting (per this session's memory-writing convention) — after manual verification passes, write a `project` memory entry summarizing: MFA shipped opt-in for admins, `MFA_ENCRYPTION_KEY` now required in prod env (must be set in Vercel before/at deploy, or `/api/user/mfa/setup` throws), otplib's functional API (`generateSecret`/`generate`/`verify`/`generateURI`) is what's used here — not the older `authenticator.*` style some docs/training data may suggest.

- [ ] **Step 6: Final commit (if Step 5 produced doc/memory changes tracked in-repo)**

Memory files live outside the repo (`C:\Users\User\.claude\projects\...\memory\`), so this step is a no-op for git — nothing to commit from Step 5 itself. If manual testing in Step 4 surfaced any bugs requiring code fixes, commit those fixes individually per the normal flow (test, fix, verify, commit) before considering this plan complete.
