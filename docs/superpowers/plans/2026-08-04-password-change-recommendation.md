# Card+PK Password Change: Forced → Recommended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For individual card+PK cardholders (`register-card` route's `cardUser` branch), replace today's site-wide hard lockout (blocking modal + `isAuthenticated: false` + server session treated as logged-out) with full site access plus a dismissible recommendation banner — while every other `mustChangePassword: true` case (B2B shared `FIRST_LOGIN_PASSWORD`, access-request `Welcome1!`, admin-forced resets) keeps today's hard block byte-for-byte.

**Architecture:** A single pure predicate, `isPasswordChangeSoft(user)`, decides which of the two treatments applies. It's defined once in `lib/auth-types.ts` and runs **server-side only**, against the raw Prisma `User` row. The server exposes just the derived result — `passwordChangeSoft: boolean` — on `ServerUser` and the client `User` type; the raw `pkLast3` code never leaves the server (see Task 3 — this was a correction found via security review after Tasks 1–2 first shipped it to the client). The three places that gate on `mustChangePassword` alone — the client auth store (`lib/auth-store.ts`), the server session guard (`lib/server-auth.ts`), and the account-level UI gate (`components/account/AccountGuard.tsx`) — all read that one boolean directly. The existing forced-change form is extracted into a shared `ChangePasswordFields` component so the new non-blocking banner and the still-existing blocking modal don't duplicate the input/validation/submit logic.

**Tech Stack:** Next.js App Router, TypeScript, Zustand (`lib/auth-store.ts`), Prisma (`User.pkLast3`, `User.companyId` — both already exist, no migration; `pkLast3` is read server-side only, never selected onto a client-facing type), Vitest for unit tests.

## Global Constraints

- No database schema changes — `pkLast3` and `companyId` already exist on `User`.
- The eligibility formula is exactly: `mustChangePassword && pkLast3 !== null && companyId === null`. Do not simplify to `companyId === null` alone (see spec — that would wrongly soften access-request `Welcome1!` and admin-forced resets).
- **The raw `pkLast3` value must never reach the client** — not on `ServerUser`, not on the client `User` type, not in any API response or `localStorage` key. Only the derived boolean `passwordChangeSoft` crosses that boundary. (Correction from the original plan — see Task 3.)
- `/api/auth/register-card`'s claim-gate (`!cardUser.mustChangePassword → 409`) is untouched.
- `ForceChangePasswordModal`'s visible behavior for hard-blocked users (B2B, access-request) does not change — only its internals are refactored to share code with the new banner.
- No i18n keys: `ForceChangePasswordModal` is hardcoded Russian today with no `t()` calls; the new banner and shared form follow the same existing convention.
- Banner dismiss state lives in `sessionStorage`, not `localStorage`, keyed per user id.

Reference: `docs/superpowers/specs/2026-08-04-password-change-recommendation-design.md`.

---

### Task 1: `isPasswordChangeSoft` predicate + `pkLast3` on the client `User` type

**Status: done (commit 6b0281c) — superseded by Task 3's correction below.** Left in the plan as an accurate historical record; do not re-run this task. Task 3 removes the client-side `pkLast3` field this task added.

**Files:**
- Modify: `lib/auth-types.ts`
- Test: `lib/auth-types.test.ts` (new)

**Interfaces:**
- Produces: `isPasswordChangeSoft(user: PasswordChangeGateUser): boolean`, exported from `lib/auth-types.ts`. `PasswordChangeGateUser = { mustChangePassword?: boolean | null; pkLast3?: string | null; companyId?: string | null }`. This interface is unchanged and still current — consumed server-side only from Task 3 onward.
- Produces: `User.pkLast3?: string | null` field — **removed by Task 3.**

(Original steps omitted — already implemented and reviewed. See commit 6b0281c.)

---

### Task 2: Carry `pkLast3` through the client local mirror (`normalizeUser`)

**Status: done (commit 096e423) — superseded by Task 3's correction below.** Left in the plan as an accurate historical record; do not re-run this task. Task 3 changes `normalizeUser()` to carry `passwordChangeSoft` instead of `pkLast3`.

**Files:**
- Modify: `lib/auth-storage.ts`
- Test: `lib/auth.test.ts` (extend existing `registerCardUser` describe block)

(Original steps omitted — already implemented and reviewed, then superseded. See commit 096e423 and Task 3.)

---

### Task 3: Correction — derive `passwordChangeSoft` server-side, stop exposing raw `pkLast3` to the client

**Why this task exists:** a security review run automatically after Task 1's commit flagged that shipping the raw `pkLast3` value to the client lands it in `localStorage` (`lib/auth-storage.ts`'s `normalizeUser()`, Task 2) right alongside `cardNumber`, which is already stored there. Together those two values are exactly the input pair `POST /api/auth/register-card` accepts — so any XSS able to read `localStorage` would obtain a portable, session-independent credential for that card (replayable from the attacker's own browser, outliving the current session) for as long as `mustChangePassword` stays true. This feature makes that window long-lived by design (soft mode is meant to persist across sessions), which compounds the exposure. The client never actually needs the raw code — only the yes/no answer. This task amends Tasks 1–2's already-shipped files before anything downstream (Task 4 onward) starts consuming the raw value server-side too.

**Files:**
- Modify: `lib/auth-types.ts`
- Modify: `lib/auth-storage.ts`
- Modify: `lib/auth.test.ts` (replaces the "carries pkLast3" test added by Task 2)

**Interfaces:**
- Consumes: nothing new — amends Task 1/2's interfaces in place.
- Produces: `User.passwordChangeSoft?: boolean` (replaces `User.pkLast3`, which is removed from the client type entirely — `pkLast3` must not appear anywhere in `lib/auth-types.ts`'s `User` type after this task). Consumed by Tasks 5 and 7.
- `isPasswordChangeSoft()` and `PasswordChangeGateUser` are **unchanged** — still exported from `lib/auth-types.ts`, just consumed server-side only starting with Task 4.

- [ ] **Step 1: Write the failing test**

In `lib/auth.test.ts`, find the test added by Task 2 (`'carries pkLast3 through the local mirror so the soft password-change gate works after registration'`, inside `describe('registerCardUser — server-authoritative card registration', ...)`) and **replace it entirely** with:

```ts
  it('carries passwordChangeSoft through the local mirror, and never stores the raw pkLast3 code', async () => {
    const serverUser = {
      id: 'u_soft_1',
      email: 'card.5678@client.local',
      mustChangePassword: true,
      passwordChangeSoft: true,
      // Defence-in-depth: even if a future server regression leaked this
      // raw field, the client must never persist it.
      pkLast3: 'X9Z',
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: serverUser }),
    } as unknown as Response)

    await registerCardUser({ cardNumber: '5678', password: '9zx' })

    const stored = getCurrentUser()
    expect(stored?.passwordChangeSoft).toBe(true)
    expect((stored as unknown as { pkLast3?: unknown })?.pkLast3).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth.test.ts -t "carries passwordChangeSoft"`
Expected: FAIL — `stored?.passwordChangeSoft` is `undefined` (not `true`).

- [ ] **Step 3: Implement**

In `lib/auth-types.ts`, in the `User` type, replace the `pkLast3` line Task 1 added:

```ts
  cardNumber?: string // Клиентская карта для входа по номеру карты
  passwordChangeSoft?: boolean // Сервер уже посчитал isPasswordChangeSoft — сырой pkLast3 клиенту не передаётся
```

(Remove the old `pkLast3?: string | null // ...` line entirely. Leave `PasswordChangeGateUser` and `isPasswordChangeSoft()` at the bottom of the file exactly as Task 1 wrote them — no change to those.)

In `lib/auth-storage.ts`, in `normalizeUser()`, replace the `pkLast3` line Task 2 added:

```ts
  cardNumber: user.cardNumber,
  passwordChangeSoft: user.passwordChangeSoft ?? false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth.test.ts -t "carries passwordChangeSoft"`
Expected: PASS.

Then run the full files to confirm no regressions:
`npx vitest run lib/auth.test.ts` — Expected: all PASS.
`npx vitest run lib/auth-types.test.ts` — Expected: all PASS unchanged (these tests call `isPasswordChangeSoft()` directly with a `PasswordChangeGateUser`-shaped literal, which this task does not touch).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-types.ts lib/auth-storage.ts lib/auth.test.ts
git commit -m "fix(auth): stop exposing raw pkLast3 to the client, derive passwordChangeSoft server-side"
```

---

### Task 4: `passwordChangeSoft` on `ServerUser` + soften the `getServerUser` session gate

**Files:**
- Modify: `lib/server-auth.ts`
- Test: `lib/server-auth.test.ts`

**Interfaces:**
- Consumes: `isPasswordChangeSoft` from `lib/auth-types.ts` (Task 1, unchanged).
- Produces: `ServerUser.passwordChangeSoft: boolean` (the raw `pkLast3` is read from the Prisma row to compute this but is **never** added to the `ServerUser` type or returned in any response). `getServerUser()` now returns the full user (not `null`) for soft-eligible sessions even without `allowPasswordChangeRequired`. Every existing `getServerUser()` call site (~60 API routes) picks this up automatically — no per-route changes. Consumed by Tasks 5 and 7.

- [ ] **Step 1: Write the failing test**

In `lib/server-auth.test.ts`, extend the `makeSession` helper (around line 32) to carry the two extra fields the raw Prisma row has, matching the existing style of `teamRole`:

```ts
function makeSession(platformRole: string) {
  return {
    tokenHash: 'hash',
    expiresAt: futureDate(),
    user: {
      id: 'u1',
      email: 'a@b.c',
      platformRole,
      teamRole: undefined as string | undefined,
      companyId: undefined as string | undefined,
      pkLast3: undefined as string | undefined,
      approvalRequired: false,
      auditLoggingEnabled: false,
      bonusPoints: 0,
      mustChangePassword: false,
      createdAt: new Date(),
    },
  }
}
```

Then add two tests inside `describe('restricted onboarding session', ...)`, after the existing test:

```ts
  it('grants full access for a verified individual card+PK login, marked passwordChangeSoft, without exposing the raw code', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    session.user.pkLast3 = 'X9Z'
    sessionFindUniqueMock.mockResolvedValue(session)

    const result = await getServerUser()
    expect(result).not.toBeNull()
    expect(result?.mustChangePassword).toBe(true)
    expect(result?.passwordChangeSoft).toBe(true)
    expect((result as unknown as { pkLast3?: unknown })?.pkLast3).toBeUndefined()
  })

  it('keeps the hard block for a B2B shared-password session even if pkLast3 is set', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    session.user.pkLast3 = 'X9Z'
    session.user.companyId = 'company_1'
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server-auth.test.ts -t "restricted onboarding session"`
Expected: FAIL — both new tests fail (`getServerUser()` still returns `null` for the soft case; `result?.passwordChangeSoft` is `undefined`).

- [ ] **Step 3: Implement**

In `lib/server-auth.ts`:

1. Add the import at the top (after the existing `@/lib/admin-permissions` import):

```ts
import { isPasswordChangeSoft } from '@/lib/auth-types'
```

2. Add `passwordChangeSoft` to the `ServerUser` type (after the existing `mustChangePassword: boolean` line). Do **not** add a `pkLast3` field to this type:

```ts
  mustChangePassword: boolean
  passwordChangeSoft: boolean
```

3. Add the computation in `mapDbToServerUser()` (after the existing `mustChangePassword: u.mustChangePassword,` line):

```ts
    mustChangePassword: u.mustChangePassword,
    passwordChangeSoft: isPasswordChangeSoft(u),
```

4. Change the gate at line 124 from:

```ts
    if (user.mustChangePassword && !options.allowPasswordChangeRequired) return null
```

to:

```ts
    if (user.mustChangePassword && !user.passwordChangeSoft && !options.allowPasswordChangeRequired) return null
```

(This reads the already-computed field on the mapped `user`, not a fresh call to `isPasswordChangeSoft()` — `mapDbToServerUser()` ran a few lines above this gate.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server-auth.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — confirms no regression to the hard-blocked case).

- [ ] **Step 5: Commit**

```bash
git add lib/server-auth.ts lib/server-auth.test.ts
git commit -m "feat(auth): soften server session gate for soft-eligible card+PK users"
```

---

### Task 5: Soften the client `isAuthenticated` gate (`lib/auth-store.ts`)

**Files:**
- Modify: `lib/auth-store.ts`
- Test: `lib/auth-store.test.ts` (new)

**Interfaces:**
- Consumes: `User.passwordChangeSoft` from Task 3 (via `getCurrentUser()`). No import of `isPasswordChangeSoft` needed here — the boolean already arrived precomputed from the server.
- Produces: `useAuthStore` state's `isAuthenticated` is `true` for soft-eligible users — every component reading `useAuthStore((s) => s.isAuthenticated)` (cart, prices, `Categories.tsx`, etc.) picks this up automatically.

- [ ] **Step 1: Write the failing test**

Create `lib/auth-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserMock = vi.fn()
vi.mock('@/lib/auth', () => ({
  getCurrentUser: getCurrentUserMock,
  isAdminUser: (user: { platformRole?: string } | null) => user?.platformRole === 'admin',
}))

import { useAuthStore } from './auth-store'

beforeEach(() => {
  getCurrentUserMock.mockReset()
  useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false, isHydrated: false })
})

describe('useAuthStore refresh — password-change gate', () => {
  it('treats a hard-blocked mustChangePassword user as unauthenticated', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u1', mustChangePassword: true, passwordChangeSoft: false })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('treats a soft-eligible card+PK user as fully authenticated', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u2', mustChangePassword: true, passwordChangeSoft: true })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('authenticates a normal user with no password-change flag', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u4', mustChangePassword: false, passwordChangeSoft: false })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth-store.test.ts`
Expected: FAIL — the "soft-eligible" case gets `isAuthenticated: false` (current unconditional `!user.mustChangePassword` check).

- [ ] **Step 3: Implement**

In `lib/auth-store.ts`, change the `set({...})` call inside `refresh` (no new import needed):

```ts
    set({
      user,
      // Hard-blocked only when mustChangePassword is true AND the server
      // didn't mark this session passwordChangeSoft (see lib/auth-types.ts).
      isAuthenticated: !!user && !(user.mustChangePassword && !user.passwordChangeSoft),
      isAdmin: isAdminUser(user),
      isHydrated: true,
    })
```

Leave the early-return dedup check just above it (which compares `mustChangePassword`) as-is — no change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-store.ts lib/auth-store.test.ts
git commit -m "feat(auth): soften client isAuthenticated gate for soft-eligible card+PK users"
```

---

### Task 6: Extract `ChangePasswordFields` out of `ForceChangePasswordModal`

Pure refactor — no behavior change, unaffected by Task 3's correction. Moves the input/validation/submit logic out of the modal so Task 7's banner can reuse it without duplicating it.

**Files:**
- Create: `components/account/ChangePasswordFields.tsx`
- Modify: `components/account/ForceChangePasswordModal.tsx`

**Interfaces:**
- Produces: `<ChangePasswordFields />` (no props) — renders the new-password/confirm inputs, client-side validation, and a submit button wired to `forceChangePassword()` from `lib/auth.ts`. Consumed by Task 7.

There is no component-test infrastructure in this repo (only `lib/**` and API-route unit tests exist) — verify this task by reading the diff carefully and via the manual check in Step 3.

- [ ] **Step 1: Create the shared fields component**

Create `components/account/ChangePasswordFields.tsx` with the body moved out of `ForceChangePasswordModal.tsx` (everything from the current `next`/`confirm` state down through the save button, unchanged):

```tsx
'use client';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forceChangePassword } from '@/lib/auth';

export default function ChangePasswordFields(): React.ReactElement {
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showNext, setShowNext] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setError('');
        if (next.length < 6) {
            setError('Пароль должен быть не менее 6 символов.');
            return;
        }
        if (next !== confirm) {
            setError('Пароли не совпадают.');
            return;
        }
        setLoading(true);
        const result = await forceChangePassword(next);
        setLoading(false);
        if (!result.success) {
            setError(result.error ?? 'Ошибка. Попробуйте ещё раз.');
        }
        // После успеха родительский компонент перерисуется (mustChangePassword = false)
    };

    return (
        <div className="space-y-3">
            <div>
                <label htmlFor="forced-new-password" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Новый пароль
                </label>
                <div className="relative flex items-center">
                    <Input
                        id="forced-new-password"
                        type={showNext ? 'text' : 'password'}
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        placeholder="Не менее 6 символов"
                        className="pr-10 bg-card"
                        autoComplete="new-password"
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowNext((v) => !v)}
                    >
                        {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <div>
                <label htmlFor="forced-confirm-password" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    Повторите пароль
                </label>
                <div className="relative flex items-center">
                    <Input
                        id="forced-confirm-password"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Повторите новый пароль"
                        className="pr-10 bg-card"
                        autoComplete="new-password"
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowConfirm((v) => !v)}
                    >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button
                className="w-full"
                onClick={() => void handleSave()}
                disabled={loading}
            >
                {loading ? 'Сохраняем…' : 'Сохранить пароль'}
            </Button>
        </div>
    );
}
```

- [ ] **Step 2: Slim down `ForceChangePasswordModal.tsx` to use it**

Replace the full contents of `components/account/ForceChangePasswordModal.tsx` with:

```tsx
'use client';
import React from 'react';
import { Lock } from 'lucide-react';
import ChangePasswordFields from '@/components/account/ChangePasswordFields';

export default function ForceChangePasswordModal(): React.ReactElement {
    return (
        // Блокирующий оверлей — не пропускает клики вниз
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl p-6 space-y-5">
                {/* Заголовок */}
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                        <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">
                            Пожалуйста, замените пароль
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Придумайте новый пароль для входа в кабинет
                        </p>
                    </div>
                </div>

                <ChangePasswordFields />
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Manual verification**

Run `npx tsc --noEmit` to confirm both files type-check cleanly (no leftover references to removed state in the modal). Then use the `verify` skill to start the dev server and, for a test account with `mustChangePassword: true` and `companyId` set (B2B shape — still hard-blocked after this task), confirm the modal still renders identically to before (same copy, same fields, same "Сохранить пароль" button) and a successful save still closes it.

- [ ] **Step 4: Commit**

```bash
git add components/account/ChangePasswordFields.tsx components/account/ForceChangePasswordModal.tsx
git commit -m "refactor(account): extract ChangePasswordFields out of ForceChangePasswordModal"
```

---

### Task 7: `PasswordChangeBanner` + wire `AccountGuard` to the soft/hard split

**Files:**
- Create: `components/account/PasswordChangeBanner.tsx`
- Modify: `components/account/AccountGuard.tsx`

**Interfaces:**
- Consumes: `User.passwordChangeSoft` (Task 3, via `useAuthStore`), `ChangePasswordFields` (Task 6), `useAuthStore` (Task 5). No import of `isPasswordChangeSoft` needed in this file — the boolean already arrived precomputed on the user object.
- Produces: end-to-end feature — soft-eligible users now see `PasswordChangeBanner` instead of `ForceChangePasswordModal`, with full site access already granted by Tasks 4–5.

No component-test infrastructure exists in this repo for this layer; verify via Step 3's manual check.

- [ ] **Step 1: Create the banner**

Create `components/account/PasswordChangeBanner.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import ChangePasswordFields from '@/components/account/ChangePasswordFields';

function dismissKey(userId: string): string {
    return `pw-banner-dismissed:${userId}`;
}

function readDismissed(userId: string): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(dismissKey(userId)) === '1';
}

export default function PasswordChangeBanner({ userId }: { userId: string }): React.ReactElement | null {
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(() => readDismissed(userId));

    if (dismissed) return null;

    const handleDismiss = () => {
        sessionStorage.setItem(dismissKey(userId), '1');
        setDismissed(true);
    };

    return (
        <div className="w-full bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
            <div className="mx-auto max-w-[1200px] flex items-center gap-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 text-amber-900 dark:text-amber-200">
                    Рекомендуем сменить пароль, полученный при регистрации по карте.
                </span>
                {!expanded && (
                    <button
                        type="button"
                        className="text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2"
                        onClick={() => setExpanded(true)}
                    >
                        Сменить пароль
                    </button>
                )}
                <button
                    type="button"
                    aria-label="Закрыть"
                    className="text-amber-600 dark:text-amber-400"
                    onClick={handleDismiss}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            {expanded && (
                <div className="mx-auto max-w-[1200px] pt-3 pb-1">
                    <ChangePasswordFields />
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Wire `AccountGuard.tsx`**

Replace the full contents of `components/account/AccountGuard.tsx` with:

```tsx
'use client';
import React from 'react';
import { useAuthStore } from '@/lib/auth-store';
import ForceChangePasswordModal from '@/components/account/ForceChangePasswordModal';
import PasswordChangeBanner from '@/components/account/PasswordChangeBanner';
import WelcomeModal from '@/components/account/WelcomeModal';

export default function AccountGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    if (!isHydrated) return null;

    const soft = !!user?.passwordChangeSoft;

    return (
        <>
            {user && user.mustChangePassword && soft && <PasswordChangeBanner userId={user.id} />}
            {children}
            {user?.mustChangePassword && !soft && <ForceChangePasswordModal />}
            {user && !user.mustChangePassword && user.isNewUser && (
                <WelcomeModal user={user} />
            )}
        </>
    );
}
```

- [ ] **Step 3: Manual verification**

Run `npx tsc --noEmit` to confirm the new component and wiring type-check.

Then, using the `verify` skill, start the dev server and check both branches live:

1. **Soft path:** find or create (via `scripts/backfill-pk-last3.ts` dry-run output, or a direct DB row with `cardNumber` + `pkLast3` set + `companyId` null + `mustChangePassword: true`) a card+PK-eligible test cardholder. Register via the "У меня есть карта" flow on `/register` with that card number + last-3-of-personal-code. Confirm:
   - No blocking modal appears.
   - The amber banner appears at the top of the page.
   - Cart/checkout/prices work immediately (full `isAuthenticated`).
   - Reloading the page keeps the banner visible (not dismissed).
   - Clicking the banner's close (X) hides it; reloading the page again keeps it hidden (same tab/session).
   - Clicking "Сменить пароль" expands the two fields inline; submitting a valid new password makes the banner disappear entirely (component unmounts because `mustChangePassword` flipped to `false`).
   - Open browser devtools → Application → Local Storage: confirm no `pkLast3` value appears anywhere in the stored `currentUser`/`users` entries (only `passwordChangeSoft: true`).
2. **Hard path (regression check):** use an existing B2B shared-card test account (`mustChangePassword: true`, `companyId` set). Confirm the blocking `ForceChangePasswordModal` still appears exactly as before, and the rest of the site is inaccessible until the password is changed — i.e. this task introduced no regression for that branch.

- [ ] **Step 4: Commit**

```bash
git add components/account/PasswordChangeBanner.tsx components/account/AccountGuard.tsx
git commit -m "feat(account): show a dismissible banner instead of a blocking modal for soft-eligible card+PK users"
```

---

## Self-Review Notes

- **Spec coverage:** Eligibility formula (Task 1, unchanged), raw-`pkLast3`-never-reaches-client correction (Task 3), `passwordChangeSoft` plumbing server→client (Tasks 3–4), `getServerUser` softening (Task 4), `isAuthenticated` softening (Task 5), `ChangePasswordFields` extraction (Task 6), `PasswordChangeBanner` + `AccountGuard` wiring + `sessionStorage` dismiss (Task 7) — every section of the 2026-08-04 design spec (as corrected) maps to a task.
- **Out-of-scope items from the spec** (B2B/access-request branches, `WelcomeModal` timing, `register-card` claim-gate, i18n) are deliberately untouched by every task above — confirmed no task modifies `app/api/auth/register-card/route.ts`, `app/api/admin/access-requests/**`, or `WelcomeModal.tsx`.
- **Type consistency:** `PasswordChangeGateUser` (Task 1) fields (`mustChangePassword`, `pkLast3`, `companyId`) match what `mapDbToServerUser()` reads from the raw Prisma row (Task 4) — but the *output* field name `passwordChangeSoft` (Task 3's `User` type change, Task 4's `ServerUser` change) is consistent everywhere it's consumed (Tasks 5, 7). No task after Task 3 references `user.pkLast3` on a client-facing type — verified by grep during the final review.
