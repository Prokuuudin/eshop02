# Card + Personal-Code Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cardholder self-register with card number + last 3 characters of their personal code (or company registration number for a legal-entity card), replacing the dead-end shared-password path for individual cardholders, then force an immediate password change.

**Architecture:** Add a nullable `User.pkLast3` column (last-3-chars only, never the full personal code). Backfill it from the source spreadsheet for existing cards, and populate it going forward at import time. Replace the individual-cardholder branch of `POST /api/auth/register-card` — which today checks a single shared `FIRST_LOGIN_PASSWORD` — with a per-user `pkLast3` comparison. The B2B `Company` shared-card branch and the email-invite flow are untouched.

**Tech Stack:** Next.js API routes, Prisma/PostgreSQL (Neon), Vitest, xlsx (SheetJS), React (client components).

**Reference spec:** `docs/superpowers/specs/2026-07-31-card-pk-registration-design.md`

## Global Constraints

- Store only the **last 3 characters** of the personal code / registration number in `User.pkLast3` — never the full value, anywhere (GDPR minimization, per approved spec).
- The `Company` model / B2B shared-card team-registration branch (`FIRST_LOGIN_PASSWORD`) is **out of scope** — do not modify its behavior.
- The email-invite flow (`/api/auth/invite`, `InvitationToken`) is **out of scope** — keep it working unchanged, as the alternative path.
- Never flip `mustChangePassword` to `true` for a user who already has a real, self-chosen password (i.e. anyone with an accepted `InvitationToken`, or anyone with `companyId` set) — doing so would let a guessed 3-digit code hijack a live account.
- `prisma migrate dev` is broken in this repo (shadow-DB replay issue from an unrelated historical rollback) — schema changes go through the manual `migrate diff` → `db execute` → `migrate resolve` workflow, never `migrate dev`.
- Rate limiting for the new code check reuses the existing `checkRateLimit` calls in `register-card/route.ts` unchanged (per-IP + 5/hour per card).
- The wire field name stays `password` in the `POST /api/auth/register-card` request body for the individual branch (it now carries a 3-character code, not a password) — no field rename, this is a first-party endpoint only consumed by `lib/auth.ts`.

---

### Task 1: Schema — add `User.pkLast3`

**Files:**
- Modify: `prisma/schema.prisma:22` (User model, after `cardNumber`)
- Create: `prisma/migrations/20260731120000_add_user_pk_last3/migration.sql`

**Interfaces:**
- Produces: `User.pkLast3: string | null` — available on every `prisma.user.*` result from this point on.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, in `model User`, add a line right after `cardNumber` (currently line 22):

```prisma
  cardNumber          String?   @unique
  pkLast3             String?   @db.VarChar(3)
```

- [ ] **Step 2: Generate the migration SQL manually (do not use `migrate dev`)**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Copy the SQL output (it should be a single `ALTER TABLE "User" ADD COLUMN "pkLast3" VARCHAR(3);`) into a new file — write it with the file-write tool directly, not shell redirection, because the diff command also prints informational lines to stdout that must not end up in the SQL file.

Create `prisma/migrations/20260731120000_add_user_pk_last3/migration.sql`:

```sql
ALTER TABLE "User" ADD COLUMN "pkLast3" VARCHAR(3);
```

- [ ] **Step 3: Apply to the real Neon database**

```bash
npx prisma db execute --file prisma/migrations/20260731120000_add_user_pk_last3/migration.sql
npx prisma migrate resolve --applied 20260731120000_add_user_pk_last3
npx prisma generate
```

If `db execute` fails with a transient `P1001`, just retry — Neon connectivity over TCP 5432 is occasionally flaky (known issue, unrelated to this change).

- [ ] **Step 4: Verify**

```bash
npx prisma migrate status
```

Expected: no pending migrations, `20260731120000_add_user_pk_last3` listed as applied.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260731120000_add_user_pk_last3
git commit -m "feat(db): add User.pkLast3 for card self-registration"
```

---

### Task 2: `lib/personal-code.ts` — shared code-derivation helpers

**Files:**
- Create: `lib/personal-code.ts`
- Test: `lib/personal-code.test.ts`

**Interfaces:**
- Produces: `derivePkLast3(rawPk: string | null | undefined): string | null`, `normalizeSubmittedCode(v: string): string` — both consumed by Task 4 (route), Task 8 (import script), Task 9 (backfill script).

- [ ] **Step 1: Write the failing tests**

Create `lib/personal-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { derivePkLast3, normalizeSubmittedCode } from './personal-code'

describe('derivePkLast3', () => {
  it('takes the last 3 digits of a personal code', () => {
    expect(derivePkLast3('010570-10221')).toBe('221')
  })

  it('takes the last 3 digits of a company registration number, ignoring the LV prefix', () => {
    expect(derivePkLast3('LV40003578116')).toBe('116')
  })

  it('trims surrounding whitespace before extracting', () => {
    expect(derivePkLast3('  40103714999  ')).toBe('999')
  })

  it('returns null for a blank value', () => {
    expect(derivePkLast3('')).toBeNull()
    expect(derivePkLast3('   ')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(derivePkLast3(null)).toBeNull()
    expect(derivePkLast3(undefined)).toBeNull()
  })

  it('returns null when fewer than 3 alphanumeric characters remain', () => {
    expect(derivePkLast3('12')).toBeNull()
  })

  it('uppercases the result', () => {
    expect(derivePkLast3('lv40003578abc')).toBe('ABC')
  })
})

describe('normalizeSubmittedCode', () => {
  it('trims, strips non-alphanumeric characters, and uppercases', () => {
    expect(normalizeSubmittedCode(' 221 ')).toBe('221')
    expect(normalizeSubmittedCode('2-2-1')).toBe('221')
    expect(normalizeSubmittedCode('a2b')).toBe('A2B')
  })

  it('returns an empty string for blank input', () => {
    expect(normalizeSubmittedCode('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --config vitest.config.ts lib/personal-code.test.ts
```

Expected: FAIL — `Cannot find module './personal-code'`.

- [ ] **Step 3: Implement**

Create `lib/personal-code.ts`:

```ts
// Last-3-characters only, by design: this is all the registration flow ever
// needs to verify, and storing the full personal code / registration number
// would needlessly widen the sensitive-data footprint (project is GDPR-scoped).
export function derivePkLast3(rawPk: string | null | undefined): string | null {
  if (!rawPk) return null
  const cleaned = rawPk.trim().replace(/[^0-9A-Za-z]/g, '')
  if (cleaned.length < 3) return null
  return cleaned.slice(-3).toUpperCase()
}

export function normalizeSubmittedCode(v: string): string {
  return v.trim().replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --config vitest.config.ts lib/personal-code.test.ts
```

Expected: PASS, all 11 assertions.

- [ ] **Step 5: Commit**

```bash
git add lib/personal-code.ts lib/personal-code.test.ts
git commit -m "feat: add pkLast3 derivation/normalization helpers"
```

---

### Task 3: `lib/auth.ts` — new error codes on `registerCardUser`

**Files:**
- Modify: `lib/auth.ts:256-317` (`RegisterCardErrorCode` type + `registerCardUser`)
- Test: `lib/auth.test.ts` (extend the `registerCardUser` describe block)

Note: line numbers below were re-verified against the actual worktree checkout
(the plan was drafted while a large, unrelated, *uncommitted* refactor sat in
the original working directory splitting this file differently — that
refactor is not part of any commit, so it is not present in this worktree;
these line numbers are correct for the code you are actually editing).

**Interfaces:**
- Consumes: nothing new.
- Produces: `RegisterCardErrorCode` now includes `'wrong_code'` and `'no_personal_code_on_file'`; `registerCardUser` maps HTTP 422 to `'no_personal_code_on_file'`, and for HTTP 401 reads the response body's `error` field to distinguish `'wrong_code'` from `'wrong_password'` (falling back to `'wrong_password'` if the body can't be parsed as JSON, so it stays legacy-compatible).

- [ ] **Step 1: Write the failing tests**

In `lib/auth.test.ts`, inside `describe('registerCardUser — server-authoritative card registration', ...)`, add:

```ts
  it('surfaces a wrong personal-code digit distinctly from a wrong shared password', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'wrong_code' }),
    } as unknown as Response)

    const res = await registerCardUser({ cardNumber: '5678', password: '999' })

    expect(res.errorCode).toBe('wrong_code')
  })

  it('falls back to wrong_password on a 401 with no readable body (legacy shape)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)

    const res = await registerCardUser({ cardNumber: '1234', password: 'nope' })

    expect(res.errorCode).toBe('wrong_password')
  })

  it('surfaces a card with no personal code on file distinctly', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 422 } as Response)

    const res = await registerCardUser({ cardNumber: '5678', password: '221' })

    expect(res.errorCode).toBe('no_personal_code_on_file')
  })
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --config vitest.config.ts lib/auth.test.ts -t "registerCardUser"
```

Expected: FAIL — the two new error codes aren't distinguishable/mapped yet (`wrong_code` comes back as `wrong_password`, and 422 falls into the generic `server_error` branch).

- [ ] **Step 3: Implement**

In `lib/auth.ts`, replace the `RegisterCardErrorCode` type (lines 256-262):

```ts
export type RegisterCardErrorCode =
  | 'card_not_found'
  | 'card_already_registered'
  | 'wrong_password'
  | 'wrong_code'
  | 'no_personal_code_on_file'
  | 'too_many_attempts'
  | 'network_error'
  | 'server_error'
```

Replace the status-mapping block (lines 297-301):

```ts
  if (res.status === 404) return { success: false, errorCode: 'card_not_found' }
  if (res.status === 409) return { success: false, errorCode: 'card_already_registered' }
  if (res.status === 422) return { success: false, errorCode: 'no_personal_code_on_file' }
  if (res.status === 401) {
    let errorCode: RegisterCardErrorCode = 'wrong_password'
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error === 'wrong_code') errorCode = 'wrong_code'
    } catch {
      // No readable JSON body (e.g. a legacy mocked response) — the shared
      // company-branch wrong-password case is the safe default here.
    }
    return { success: false, errorCode }
  }
  if (res.status === 429) return { success: false, errorCode: 'too_many_attempts' }
  if (!res.ok) return { success: false, errorCode: 'server_error' }
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --config vitest.config.ts lib/auth.test.ts -t "registerCardUser"
```

Expected: PASS, all cases including the pre-existing ones (404/409/429/network/success).

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: distinguish wrong-code and no-personal-code errors in registerCardUser"
```

---

### Task 4: `app/api/auth/register-card/route.ts` — verify by `pkLast3` instead of shared password

**Files:**
- Modify: `app/api/auth/register-card/route.ts:1-121` (imports, docstring, individual-cardholder branch, the top-of-function `FIRST_LOGIN_PASSWORD` guard)
- Test: `app/api/auth/register-card/route.test.ts`

**Interfaces:**
- Consumes: `derivePkLast3`, `normalizeSubmittedCode` from `lib/personal-code.ts` (Task 2).
- Produces: individual-branch responses `422 no_personal_code_on_file`, `401 { error: 'wrong_code' }` — consumed by Task 6 (RegisterForm).

- [ ] **Step 1: Write the failing tests**

In `app/api/auth/register-card/route.test.ts`, replace the `DORMANT_USER` fixture (lines 62-67) with one that carries `pkLast3`:

```ts
const DORMANT_USER = {
  id: 'user_dormant_1',
  email: 'master@example.com',
  cardNumber: '5678',
  mustChangePassword: true,
  pkLast3: '221',
}

const DORMANT_USER_NO_PK = {
  id: 'user_dormant_2',
  email: 'nopk@example.com',
  cardNumber: '5679',
  mustChangePassword: true,
  pkLast3: null,
}
```

Replace the two tests that exercise the individual branch's secret check (lines 121-150):

```ts
  it('activates a dormant individual cardholder (ERP import) on the correct last-3 code, without creating a new user', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: '221' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: expect.objectContaining({ id: 'user_dormant_1' }) })
    expect(createSessionMock).toHaveBeenCalledWith('user_dormant_1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=token')
    expect(sendEmail).toHaveBeenCalledWith(
      'master@example.com',
      expect.any(String),
      expect.any(String)
    )
  })

  it('accepts the code regardless of dashes/case/whitespace', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: ' 2-2-1 ' }))

    expect(res.status).toBe(200)
  })

  it('does not notify anyone when the last-3 code is wrong', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER)

    const res = await POST(makeRequest({ cardNumber: '5678', password: '999' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'wrong_code' })
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects with a distinct error when the card has no personal code on file', async () => {
    userFindFirstMock.mockResolvedValue(DORMANT_USER_NO_PK)

    const res = await POST(makeRequest({ cardNumber: '5679', password: '123' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'no_personal_code_on_file' })
    expect(createSessionMock).not.toHaveBeenCalled()
  })
```

Leave every other test in the file untouched (company-branch tests at lines 152-239, the 404/409/blank-card/rate-limit tests) — they don't exercise the individual branch's secret check.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run --config vitest.config.ts app/api/auth/register-card/route.test.ts
```

Expected: FAIL on the four new/changed individual-branch tests (still checking against `FIRST_LOGIN_PASSWORD`, no 422 path yet).

- [ ] **Step 3: Implement**

In `app/api/auth/register-card/route.ts`, add the import (after line 8):

```ts
import { normalizeSubmittedCode } from '@/lib/personal-code'
```

Replace the individual-cardholder branch (currently lines 97-121):

```ts
    const cardUser = await prisma.user.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })

    if (cardUser) {
      if (!cardUser.mustChangePassword) {
        return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
      }
      if (!cardUser.pkLast3) {
        return NextResponse.json({ error: 'no_personal_code_on_file' }, { status: 422 })
      }
      if (normalizeSubmittedCode(password) !== cardUser.pkLast3) {
        return NextResponse.json({ error: 'wrong_code' }, { status: 401 })
      }

      await prisma.user.update({ where: { id: cardUser.id }, data: privacyData })
      await notifyCardActivated(cardUser.email, cardUser.name ?? '', cardNumber)
      const token = await createSession(cardUser.id)
      const res = NextResponse.json({ user: mapDbToServerUser(cardUser) }, { status: 200 })
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

Move the `FIRST_LOGIN_PASSWORD`-configured guard so it only gates the company branch (which is the only branch still using it). Remove it from the top of the function (currently lines 53-56):

```ts
    if (!FIRST_LOGIN_PASSWORD) {
      console.error('[auth/register-card] FIRST_LOGIN_PASSWORD is not configured')
      return NextResponse.json({ error: 'registration_not_configured' }, { status: 503 })
    }
```

...and insert it right after the `company` lookup, before the password comparison (currently lines 123-131):

```ts
    const company = await prisma.company.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })
    if (!company) {
      return NextResponse.json({ error: 'card_not_found' }, { status: 404 })
    }
    if (!FIRST_LOGIN_PASSWORD) {
      console.error('[auth/register-card] FIRST_LOGIN_PASSWORD is not configured')
      return NextResponse.json({ error: 'registration_not_configured' }, { status: 503 })
    }
    if (password !== FIRST_LOGIN_PASSWORD) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 })
    }
```

(Reason: the individual branch no longer depends on `FIRST_LOGIN_PASSWORD` at all, so it shouldn't 503 the whole endpoint if that env var happens to be unset — only the company branch still needs it.)

Update the function docstring (currently lines 36-50) to describe the new mechanism:

```ts
/**
 * Registers/activates a cardholder against a real card number — the only
 * server-authoritative path for "register with client card" (RegisterForm).
 * Two cardholder shapes exist and are checked in order:
 *
 *  1. An individual already has a User row with this cardNumber — either a
 *     dormant ERP import (Klienti.xlsx, see scripts/import-client-cards.ts)
 *     or a company member created by this route before. Verified against
 *     `pkLast3` — the last 3 characters of that person's personal code, or
 *     for a card issued to a legal entity, their company registration
 *     number — sourced from the client database, unique per cardholder
 *     (never a value shared across cards). `mustChangePassword` tells us
 *     whether they've already picked their own password (then this card is
 *     "taken"); `pkLast3 === null` means this card has no code on file at
 *     all (routed to the manual no-card request flow client-side).
 *  2. Otherwise, the card may belong to a Company with no User yet (new B2B
 *     team member claiming a shared company card) — create one, gated by
 *     the shared FIRST_LOGIN_PASSWORD mailed to the company contact.
 */
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run --config vitest.config.ts app/api/auth/register-card/route.test.ts
```

Expected: PASS, all tests including the untouched company-branch ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/register-card/route.ts app/api/auth/register-card/route.test.ts
git commit -m "feat(auth): verify individual card registration by personal-code last-3, not shared password"
```

---

### Task 5: Translations — ru/en/lv

**Files:**
- Modify: `data/translations.ts` (single monolithic file — three per-language object literals, ru first, then en, then lv, each keyed by flat strings like `'auth.cardNotFound'`)

Note: the plan was drafted while a large, unrelated, *uncommitted* refactor
sat in the original working directory splitting this file into
`data/translations/<lang>/account.ts` per-language files — that refactor is
not part of any commit, so it is not present in this worktree. Edit the
single `data/translations.ts` file as it actually exists here; line numbers
below were verified directly against it.

**Interfaces:**
- Produces: translation keys `auth.personalCodeLabel`, `auth.personalCodeHint`, `auth.personalCodePlaceholder`, `auth.enterPersonalCode`, `auth.wrongCode`, `auth.noPersonalCodeOnFile`, `auth.switchToNoCardRequest` (present in all three language blocks) — consumed by Task 6 (`RegisterForm.tsx`). Also updates the existing `auth.registerHint` key (its current wording describes the old shared-password flow).

- [ ] **Step 1: No test — these are static string tables.** Skip straight to implementation (there's no test harness for translation completeness in this repo; correctness here is verified visually in Task 10).

- [ ] **Step 2: Edit the ru block**

Replace line 724 (`auth.registerHint`):

```ts
    'auth.registerHint': 'Для регистрации укажите номер карты клиента и последние 3 цифры вашего персонального кода (или, если карта выдана на компанию — рег. номера компании). Остальное можно заполнить позже в своём профиле. Там же можно изменить пароль.',
```

Add immediately after line 745 (`auth.cardAlreadyRegistered`):

```ts
    'auth.personalCodeLabel': 'Последние 3 цифры персонального кода / рег. номера',
    'auth.personalCodePlaceholder': '123',
    'auth.personalCodeHint': 'Физлицо — последние 3 цифры персонального кода (personas kods). Карта юрлица — последние 3 цифры регистрационного номера компании.',
    'auth.enterPersonalCode': 'Укажите последние 3 цифры кода.',
    'auth.wrongCode': 'Неверный код.',
    'auth.noPersonalCodeOnFile': 'Для этой карты нет кода в базе. Заполните, пожалуйста, форму без карты — администратор проверит и активирует аккаунт вручную.',
    'auth.switchToNoCardRequest': 'Заполнить форму без карты',
```

(Indentation in this file is 4 spaces, not 2 — match the surrounding lines.)

- [ ] **Step 3: Edit the en block**

Replace line 2224 (`auth.registerHint`):

```ts
    'auth.registerHint': 'To register, enter your client card number and the last 3 digits of your personal code (or, if the card was issued to a company, the last 3 digits of the company registration number). Everything else can be filled in later in your profile, where you can also change your password.',
```

Add immediately after line 2245 (`auth.cardAlreadyRegistered`):

```ts
    'auth.personalCodeLabel': 'Last 3 digits of your personal code / registration number',
    'auth.personalCodePlaceholder': '123',
    'auth.personalCodeHint': 'Individual — last 3 digits of your personal code. Company-issued card — last 3 digits of the company registration number.',
    'auth.enterPersonalCode': 'Please enter the last 3 digits of the code.',
    'auth.wrongCode': 'Incorrect code.',
    'auth.noPersonalCodeOnFile': 'There is no code on file for this card. Please use the no-card form instead — an administrator will verify and activate your account manually.',
    'auth.switchToNoCardRequest': 'Use the no-card form instead',
```

- [ ] **Step 4: Edit the lv block**

Replace line 4043 (`auth.registerHint`):

```ts
    'auth.registerHint': 'Reģistrācijai norādiet klienta kartes numuru un pēdējos 3 personas koda ciparus (vai, ja karte izsniegta uzņēmumam — uzņēmuma reģistrācijas numura pēdējos 3 ciparus). Pārējo var aizpildīt vēlāk savā profilā, kur var arī mainīt paroli.',
```

Add immediately after line 4064 (`auth.cardAlreadyRegistered`):

```ts
    'auth.personalCodeLabel': 'Personas koda / reģ. numura pēdējie 3 cipari',
    'auth.personalCodePlaceholder': '123',
    'auth.personalCodeHint': 'Privātpersonai — personas koda pēdējie 3 cipari. Uzņēmuma kartei — uzņēmuma reģistrācijas numura pēdējie 3 cipari.',
    'auth.enterPersonalCode': 'Lūdzu, ievadiet koda pēdējos 3 ciparus.',
    'auth.wrongCode': 'Nepareizs kods.',
    'auth.noPersonalCodeOnFile': 'Šai kartei nav koda mūsu datubāzē. Lūdzu, aizpildiet veidlapu bez kartes — administrators pārbaudīs un aktivizēs kontu manuāli.',
    'auth.switchToNoCardRequest': 'Aizpildīt veidlapu bez kartes',
```

- [ ] **Step 5: Re-check line numbers before editing**

Because Steps 2-4 each insert lines, editing the file top-to-bottom shifts
every later line number by however many lines the previous step added (7
new lines per step). Either apply the edits from the bottom of the file
upward (lv block first, then en, then ru — so earlier edits don't shift
later line numbers), or re-locate each anchor by searching for the literal
key string (`'auth.registerHint'`, `'auth.cardAlreadyRegistered'`) within
the relevant language block instead of trusting the absolute line number
after the first edit lands.

- [ ] **Step 6: Commit**

```bash
git add data/translations.ts
git commit -m "feat(i18n): add personal-code registration copy, update register hint"
```

---

### Task 6: `RegisterForm.tsx` — collect the code instead of the shared password

**Files:**
- Modify: `components/auth/RegisterForm.tsx`

**Interfaces:**
- Consumes: `RegisterCardErrorCode` (Task 3), translation keys from Task 5.
- Produces: new optional prop `onNoPersonalCode?: () => void` — consumed by Task 7 (`RegisterSwitcher.tsx`).

- [ ] **Step 1: No automated test — this component has no existing test file (consistent with the rest of `components/auth/`). Verified manually in Task 10 via the running dev server.**

- [ ] **Step 2: Edit the component**

In `components/auth/RegisterForm.tsx`:

Change the `Props` type (lines 11-13):

```ts
type Props = {
    onClose?: () => void;
    onNoPersonalCode?: () => void;
};
```

Change the function signature (line 15):

```ts
export default function RegisterForm({ onClose, onNoPersonalCode }: Props): React.ReactElement {
```

Drop the `showPassword` state (line 21) and the `Eye`/`EyeOff` import (line 5 — remove `Eye, EyeOff` from the `lucide-react` import, keep `Phone, Mail`) — a 3-digit code doesn't need a reveal toggle.

Replace the `ERROR_MESSAGES` map (lines 26-33):

```ts
    const ERROR_MESSAGES: Record<RegisterCardErrorCode, string> = {
        card_not_found: t('auth.cardNotFound'),
        card_already_registered: t('auth.cardAlreadyRegistered'),
        wrong_password: t('auth.wrongPassword'),
        wrong_code: t('auth.wrongCode'),
        no_personal_code_on_file: t('auth.noPersonalCodeOnFile'),
        too_many_attempts: t('auth.tooManyAttempts'),
        network_error: t('auth.registrationError'),
        server_error: t('auth.registrationError'),
    };
```

In `handleSubmit`, replace the password-blank check (lines 45-48):

```ts
        if (!password) {
            setError(t('auth.enterPersonalCode'));
            return;
        }
```

After the `registerCardUser` call fails (lines 62-65), add the no-code-on-file escape hatch:

```ts
        if (!result.success) {
            setError(result.errorCode ? ERROR_MESSAGES[result.errorCode] : t('auth.registrationError'));
            if (result.errorCode === 'no_personal_code_on_file') {
                onNoPersonalCode?.();
            }
            return;
        }
```

Replace the password field block (lines 113-139) — drop the label/placeholder text, the show/hide toggle, and `autoComplete="current-password"`:

```tsx
            {/* Последние 3 цифры кода */}
            <div className="register-form__field">
                <label htmlFor="register-password" className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.personalCodeLabel')}
                </label>
                <Input
                    id="register-password"
                    className="register-form__input bg-card text-foreground border-border"
                    type="text"
                    inputMode="numeric"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.personalCodePlaceholder')}
                    maxLength={3}
                    required
                    autoComplete="off"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('auth.personalCodeHint')}</p>
            </div>
```

- [ ] **Step 3: Commit**

```bash
git add components/auth/RegisterForm.tsx
git commit -m "feat(auth): collect personal-code last-3 instead of shared password in RegisterForm"
```

---

### Task 7: `RegisterSwitcher.tsx` — route "no code on file" into the no-card form

**Files:**
- Modify: `components/auth/RegisterSwitcher.tsx`

**Interfaces:**
- Consumes: `onNoPersonalCode` prop from `RegisterForm` (Task 6).

- [ ] **Step 1: No automated test — same as Task 6, verified manually in Task 10.**

- [ ] **Step 2: Edit the component**

In `components/auth/RegisterSwitcher.tsx`, change line 38:

```tsx
                {hasCard ? <RegisterForm onClose={onClose} onNoPersonalCode={() => setHasCard(false)} /> : <RegisterNoCardForm onClose={onClose} />}
```

- [ ] **Step 3: Commit**

```bash
git add components/auth/RegisterSwitcher.tsx
git commit -m "feat(auth): switch to the no-card form when a card has no personal code on file"
```

---

### Task 8: `scripts/import-client-cards.ts` — populate `pkLast3` going forward, fix dormant eligibility

**Files:**
- Modify: `scripts/import-client-cards.ts`

**Interfaces:**
- Consumes: `derivePkLast3` from `lib/personal-code.ts` (Task 2).

- [ ] **Step 1: No automated test — this script has none today (consistent repo convention: dry-run + manual review is the safety net). Verify with a dry run in Step 3.**

- [ ] **Step 2: Edit the script**

Add the import after line 26 (`import * as XLSX from 'xlsx'`):

```ts
import { derivePkLast3 } from '../lib/personal-code'
```

Change the `toUpdate` array type and push (lines 123, 146):

```ts
  const toUpdate: { userId: string; email: string; prevCardNumber: string | null; cardNumber: string; pk: string | null }[] = []
```

```ts
      toUpdate.push({ userId: u.id, email: c.email, prevCardNumber: u.cardNumber, cardNumber: c.code, pk: c.pk })
```

Change the `toUpdate` write loop (lines 170-171) to also set `pkLast3` — **but not** `mustChangePassword` (that user may already have a real password from some other path):

```ts
  for (const u of toUpdate) {
    await prisma.user.update({
      where: { id: u.userId },
      data: { cardNumber: u.cardNumber, pkLast3: derivePkLast3(u.pk) },
    })
```

Change the `createRows` mapping (lines 178-187) to set `pkLast3` and flip `mustChangePassword` to `true` (this is what makes new dormant imports immediately self-registerable — they're guaranteed to have never authenticated, so this is safe):

```ts
  const createRows = toCreate.map((c) => ({
    id: randomUUID(),
    email: c.email,
    passwordHash: sleepingHash,
    name: c.name,
    phone: c.tel,
    cardNumber: c.code,
    pkLast3: derivePkLast3(c.pk),
    platformRole: 'customer',
    mustChangePassword: true,
  }))
```

- [ ] **Step 3: Verify with a dry run**

```bash
npx tsx scripts/import-client-cards.ts
```

Expected: same skip/update/create counts as before this change (the script logic for *which* rows are touched hasn't changed, only *what data* gets written) — confirms nothing broke syntactically. Since every card in the file is presumably already imported, `toCreate`/`toUpdate` will likely both be empty or small; that's fine, this is just a smoke test.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-client-cards.ts
git commit -m "feat(import): populate pkLast3 and correct mustChangePassword for new dormant cardholders"
```

---

### Task 9: `scripts/backfill-pk-last3.ts` — one-time backfill for already-imported cards

**Post-implementation correction (fix round 1):** task review found the
`mustChangePassword` flip logic below only excluded re-flipping users
activated via the email-invite path, with no awareness of the register-card
+ password-change path this feature introduces — a genuinely-activated
register-card user could incorrectly qualify as a flip candidate on a future
re-run. Verified against the live database that this flip logic has zero
legitimate targets (a separate pre-existing script,
`scripts/mark-dormant-cardholders.ts`, already set `mustChangePassword: true`
for all current cardholders, and Task 8 makes all future dormant imports
default to `true` too). Human decision: **the flip logic was removed
entirely** from the shipped script — it does pkLast3 backfill only. The code
block below is kept for historical reference of what was originally planned;
it does not match the final `scripts/backfill-pk-last3.ts`. See
`.superpowers/sdd/2026-07-31-card-pk-registration/task-9-report.md` for the
fix details.

**Files:**
- Create: `scripts/backfill-pk-last3.ts`

**Interfaces:**
- Consumes: `derivePkLast3` from `lib/personal-code.ts` (Task 2).

- [ ] **Step 1: No automated test — one-off ops script, same convention as `import-client-cards.ts`. Verify with a dry run in Step 3.**

- [ ] **Step 2: Write the script**

Create `scripts/backfill-pk-last3.ts`:

```ts
/**
 * Одноразовый бэкафилл User.pkLast3 из Klienti 2026.xlsx для карт, уже
 * импортированных раньше (import-client-cards.ts исторически не писал pk).
 *
 * Что делает:
 *  - для каждой строки файла с непустым pk вычисляет последние 3 символа
 *    (derivePkLast3) и пишет в User.pkLast3 по совпадению cardNumber, если
 *    там сейчас null;
 *  - отдельно переводит mustChangePassword false→true, но ТОЛЬКО для
 *    юзеров без companyId и без принятого InvitationToken — то есть
 *    реально ни разу не активированных. Юзеров, кто уже выбрал свой пароль
 *    (через инвайт), не трогает — иначе угадавший 3 цифры сможет
 *    перехватить уже живой аккаунт. См.
 *    docs/superpowers/specs/2026-07-31-card-pk-registration-design.md
 *
 * Usage:
 *   npx tsx scripts/backfill-pk-last3.ts           # dry run, только отчёт
 *   npx tsx scripts/backfill-pk-last3.ts --apply   # запись в БД
 *
 * После --apply пишет отчёт C:/Temp/pk-last3-backfill-<ts>.json
 * (какие юзеры получили pkLast3 и/или mustChangePassword: true).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { derivePkLast3 } from '../lib/personal-code'

const APPLY = process.argv.includes('--apply')

async function main() {
  const { prisma } = await import('../lib/prisma')

  const wb = XLSX.readFile('Klienti 2026.xlsx')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Klienti 2026'], {
    defval: null,
  })

  const pkByCode = new Map<string, string>()
  for (const r of rows) {
    const code = r['Код'] === null || r['Код'] === undefined ? '' : String(r['Код']).trim()
    const rawPk = r['pk'] === null || r['pk'] === undefined ? null : String(r['pk'])
    const pk = derivePkLast3(rawPk)
    if (code && pk) pkByCode.set(code, pk)
  }
  console.log(`Карт с pk в файле: ${pkByCode.size}`)

  const users = await prisma.user.findMany({
    where: { cardNumber: { not: null } },
    select: { id: true, cardNumber: true, pkLast3: true, mustChangePassword: true, companyId: true },
  })
  console.log(`Юзеров с cardNumber в БД: ${users.length}`)

  const acceptedInvites = await prisma.invitationToken.findMany({
    where: { status: 'accepted' },
    select: { userId: true },
  })
  const activatedViaInvite = new Set(acceptedInvites.map((i) => i.userId))

  const pkUpdates: { userId: string; cardNumber: string; pkLast3: string }[] = []
  const flipUpdates: { userId: string; cardNumber: string }[] = []

  for (const u of users) {
    if (!u.cardNumber) continue
    const pk = pkByCode.get(u.cardNumber)
    if (pk && !u.pkLast3) {
      pkUpdates.push({ userId: u.id, cardNumber: u.cardNumber, pkLast3: pk })
    }
    if (!u.mustChangePassword && !u.companyId && !activatedViaInvite.has(u.id)) {
      flipUpdates.push({ userId: u.id, cardNumber: u.cardNumber })
    }
  }

  console.log(`pkLast3 будет проставлен: ${pkUpdates.length}`)
  console.log(`mustChangePassword false→true (спящие, без инвайта): ${flipUpdates.length}`)

  if (!APPLY) {
    console.log('\nDry run. Для записи: npx tsx scripts/backfill-pk-last3.ts --apply')
    return
  }

  let pkUpdated = 0
  for (const u of pkUpdates) {
    await prisma.user.update({ where: { id: u.userId }, data: { pkLast3: u.pkLast3 } })
    pkUpdated++
    if (pkUpdated % 200 === 0) process.stdout.write(`  pkLast3 ${pkUpdated}/${pkUpdates.length}\r`)
  }
  console.log(`  ✓ pkLast3 обновлён у ${pkUpdated}`)

  let flipped = 0
  for (const u of flipUpdates) {
    await prisma.user.update({ where: { id: u.userId }, data: { mustChangePassword: true } })
    flipped++
    if (flipped % 200 === 0) process.stdout.write(`  mustChangePassword ${flipped}/${flipUpdates.length}\r`)
  }
  console.log(`  ✓ mustChangePassword выставлен у ${flipped}`)

  const reportPath = `C:/Temp/pk-last3-backfill-${Date.now()}.json`
  writeFileSync(reportPath, JSON.stringify({ pkUpdates, flipUpdates }, null, 2))
  console.log(`Rollback-отчёт: ${reportPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
```

- [ ] **Step 3: Verify with a dry run**

```bash
npx tsx scripts/backfill-pk-last3.ts
```

Expected (as actually shipped, post fix-round-1): prints counts for "Карт с pk в файле" (~7400-7500, i.e. 10875 minus the 3372 blanks), "Юзеров с cardNumber в БД", and "pkLast3 будет проставлен" only — the `mustChangePassword false→true` line was removed (see the correction note above). Review the numbers make sense (pkUpdates should be close to the count of DB users whose card has a non-blank `pk`) before ever running with `--apply`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-pk-last3.ts
git commit -m "feat(scripts): add one-time pkLast3 backfill for already-imported cards"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm run test:unit
```

Expected: all tests pass, including every file touched in Tasks 2-4.

- [ ] **Step 2: Apply the migration and backfill to the real Neon database — ask the user for explicit go-ahead first**

This writes to production data (the shipped script only writes `pkLast3` — the originally-planned `mustChangePassword` flip was removed in Task 9's fix round 1, see the correction note there — so this is now a low-risk, additive-only write touching thousands of rows' `pkLast3` field). Do not run `--apply` without the user confirming they've reviewed the dry-run counts from Task 9, Step 3.

```bash
npx tsx scripts/backfill-pk-last3.ts --apply
```

- [ ] **Step 3: Manual smoke test via the running app**

Use the `run` skill to start the dev server, then in a browser:
1. Open the register form, switch to "Есть карта клиента".
2. Enter a card number known to belong to a dormant user with a populated `pkLast3` (query one from Neon: `SELECT "cardNumber", "pkLast3" FROM "User" WHERE "pkLast3" IS NOT NULL AND "mustChangePassword" = true LIMIT 1;`) and the matching 3-digit code.
3. Confirm: account activates, redirected/forced into the change-password screen (via the existing `AccountGuard`/`mustChangePassword` gate), can set a new password, and afterwards `mustChangePassword` is `false` in the DB.
4. Repeat with a wrong code → expect the "Неверный код" message, no session created.
5. Try a card known to have `pkLast3 IS NULL` → expect the "нет кода в базе" message and confirm it switches to the no-card request form.
6. Confirm the existing B2B company-card flow (shared password) still works unchanged, if a test company card is available.

- [ ] **Step 4: Report results to the user**

Summarize pass/fail for each of the 6 smoke-test scenarios above before considering this feature complete.
