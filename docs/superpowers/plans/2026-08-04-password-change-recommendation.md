# Card+PK Password Change: Forced → Recommended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For individual card+PK cardholders (`register-card` route's `cardUser` branch), replace today's site-wide hard lockout (blocking modal + `isAuthenticated: false` + server session treated as logged-out) with full site access plus a dismissible recommendation banner — while every other `mustChangePassword: true` case (B2B shared `FIRST_LOGIN_PASSWORD`, access-request `Welcome1!`, admin-forced resets) keeps today's hard block byte-for-byte.

**Architecture:** A single pure predicate, `isPasswordChangeSoft(user)`, decides which of the two treatments applies. It's defined once in the client/server-neutral `lib/auth-types.ts` and consumed by the three places that currently gate on `mustChangePassword` alone: the client auth store (`lib/auth-store.ts`), the server session guard (`lib/server-auth.ts`), and the account-level UI gate (`components/account/AccountGuard.tsx`). A new `pkLast3` field is threaded onto both the server (`ServerUser`) and client (`User`) user shapes so the predicate has the data it needs. The existing forced-change form is extracted into a shared `ChangePasswordFields` component so the new non-blocking banner and the still-existing blocking modal don't duplicate the input/validation/submit logic.

**Tech Stack:** Next.js App Router, TypeScript, Zustand (`lib/auth-store.ts`), Prisma (`User.pkLast3`, `User.companyId` — both already exist, no migration), Vitest for unit tests.

## Global Constraints

- No database schema changes — `pkLast3` and `companyId` already exist on `User`.
- The eligibility formula is exactly: `mustChangePassword && pkLast3 !== null && companyId === null`. Do not simplify to `companyId === null` alone (see spec — that would wrongly soften access-request `Welcome1!` and admin-forced resets).
- `/api/auth/register-card`'s claim-gate (`!cardUser.mustChangePassword → 409`) is untouched.
- `ForceChangePasswordModal`'s visible behavior for hard-blocked users (B2B, access-request) does not change — only its internals are refactored to share code with the new banner.
- No i18n keys: `ForceChangePasswordModal` is hardcoded Russian today with no `t()` calls; the new banner and shared form follow the same existing convention.
- Banner dismiss state lives in `sessionStorage`, not `localStorage`, keyed per user id.

Reference: `docs/superpowers/specs/2026-08-04-password-change-recommendation-design.md`.

---

### Task 1: `isPasswordChangeSoft` predicate + `pkLast3` on the client `User` type

**Files:**
- Modify: `lib/auth-types.ts`
- Test: `lib/auth-types.test.ts` (new)

**Interfaces:**
- Produces: `isPasswordChangeSoft(user: PasswordChangeGateUser): boolean`, exported from `lib/auth-types.ts`. `PasswordChangeGateUser = { mustChangePassword?: boolean | null; pkLast3?: string | null; companyId?: string | null }`. Consumed by Tasks 3, 4, 6.
- Produces: `User.pkLast3?: string | null` field, consumed by Tasks 2, 4, 6.

- [ ] **Step 1: Write the failing test**

Create `lib/auth-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPasswordChangeSoft } from './auth-types'

describe('isPasswordChangeSoft', () => {
  it('is false when mustChangePassword is not set', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: false, pkLast3: 'ABC', companyId: null })).toBe(false)
  })

  it('is true for a verified individual card+PK login', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: 'ABC', companyId: null })).toBe(true)
  })

  it('is false when there is no personal code on file', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: null, companyId: null })).toBe(false)
  })

  it('is false for a B2B company member even if pkLast3 happens to be set', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: 'ABC', companyId: 'company_1' })).toBe(false)
  })

  it('is false for the access-request Welcome1! shape (no pkLast3, no company)', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: undefined, companyId: undefined })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth-types.test.ts`
Expected: FAIL — `isPasswordChangeSoft` is not exported from `./auth-types`.

- [ ] **Step 3: Implement**

In `lib/auth-types.ts`, add the `pkLast3` field to `User` (after the existing `cardNumber` line) and the new type + function at the end of the file:

```ts
  cardNumber?: string // Клиентская карта для входа по номеру карты
  pkLast3?: string | null // Последние 3 символа перс. кода — см. isPasswordChangeSoft
```

```ts
export type PasswordChangeGateUser = {
  mustChangePassword?: boolean | null
  pkLast3?: string | null
  companyId?: string | null
}

// mustChangePassword is "soft" only when it came from a verified, per-person
// card+PK login (register-card individual branch) — not from a credential
// shared with other people (B2B FIRST_LOGIN_PASSWORD, access-request
// Welcome1!, or an admin-forced reset). Soft accounts get full site access
// and a dismissible recommendation instead of a blocking gate.
export function isPasswordChangeSoft(user: PasswordChangeGateUser): boolean {
  return Boolean(user.mustChangePassword) && user.pkLast3 != null && user.companyId == null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-types.ts lib/auth-types.test.ts
git commit -m "feat(auth): add isPasswordChangeSoft eligibility predicate"
```

---

### Task 2: Carry `pkLast3` through the client local mirror (`normalizeUser`)

**Files:**
- Modify: `lib/auth-storage.ts`
- Test: `lib/auth.test.ts` (extend existing `registerCardUser` describe block)

**Interfaces:**
- Consumes: `User.pkLast3` from Task 1.
- Produces: `normalizeUser()` now preserves `pkLast3` — relied on by Task 4's `isPasswordChangeSoft` calls against `getCurrentUser()`'s output, and by Task 6's UI.

`normalizeUser()` in `lib/auth-storage.ts` builds the client `User` object field-by-field from whatever the server/registration response hands it — it currently has no `pkLast3` line, so today it would be silently dropped every time `registerCardUser()` or `loginUserAuto()` writes to local storage, even after Task 1 adds the field to the type.

- [ ] **Step 1: Write the failing test**

In `lib/auth.test.ts`, inside `describe('registerCardUser — server-authoritative card registration', ...)`, add (after the existing "on success, mirrors the server-created account locally..." test):

```ts
  it('carries pkLast3 through the local mirror so the soft password-change gate works after registration', async () => {
    const serverUser = {
      id: 'u_soft_1',
      email: 'card.5678@client.local',
      mustChangePassword: true,
      pkLast3: 'X9Z',
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: serverUser }),
    } as unknown as Response)

    await registerCardUser({ cardNumber: '5678', password: '9zx' })

    expect(getCurrentUser()?.pkLast3).toBe('X9Z')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth.test.ts -t "carries pkLast3"`
Expected: FAIL — `getCurrentUser()?.pkLast3` is `undefined`.

- [ ] **Step 3: Implement**

In `lib/auth-storage.ts`, in `normalizeUser()`, add a line after `cardNumber: user.cardNumber,`:

```ts
  cardNumber: user.cardNumber,
  pkLast3: user.pkLast3 ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth.test.ts -t "carries pkLast3"`
Expected: PASS.

Then run the full file to confirm no regressions: `npx vitest run lib/auth.test.ts` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth-storage.ts lib/auth.test.ts
git commit -m "fix(auth): preserve pkLast3 through the client user mirror"
```

---

### Task 3: `pkLast3` on `ServerUser` + soften the `getServerUser` session gate

**Files:**
- Modify: `lib/server-auth.ts`
- Test: `lib/server-auth.test.ts`

**Interfaces:**
- Consumes: `isPasswordChangeSoft` from Task 1 (`lib/auth-types.ts`).
- Produces: `ServerUser.pkLast3?: string | null`; `getServerUser()` now returns the full user (not `null`) for soft-eligible sessions even without `allowPasswordChangeRequired`. Every existing `getServerUser()` call site (~60 API routes) picks this up automatically — no per-route changes.

- [ ] **Step 1: Write the failing test**

In `lib/server-auth.test.ts`, first extend the `makeSession` helper (around line 32) to carry the two new fields, matching the existing style of `teamRole`:

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
  it('grants full access for a verified individual card+PK login (soft-eligible)', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    session.user.pkLast3 = 'X9Z'
    sessionFindUniqueMock.mockResolvedValue(session)

    const result = await getServerUser()
    expect(result).not.toBeNull()
    expect(result?.mustChangePassword).toBe(true)
    expect(result?.pkLast3).toBe('X9Z')
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
Expected: FAIL — both new tests fail (`getServerUser()` still returns `null` for the soft case; `result?.pkLast3` is `undefined`).

- [ ] **Step 3: Implement**

In `lib/server-auth.ts`:

1. Add the import at the top (after the existing `@/lib/admin-permissions` import):

```ts
import { isPasswordChangeSoft } from '@/lib/auth-types'
```

2. Add `pkLast3` to the `ServerUser` type (after the existing `cardNumber?: string` line):

```ts
  cardNumber?: string
  pkLast3?: string | null
```

3. Add the mapping in `mapDbToServerUser()` (after the existing `cardNumber: u.cardNumber ?? undefined,` line):

```ts
    cardNumber: u.cardNumber ?? undefined,
    pkLast3: u.pkLast3 ?? null,
```

4. Change the gate at line 124 from:

```ts
    if (user.mustChangePassword && !options.allowPasswordChangeRequired) return null
```

to:

```ts
    if (user.mustChangePassword && !isPasswordChangeSoft(user) && !options.allowPasswordChangeRequired) return null
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server-auth.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — confirms no regression to the hard-blocked case).

- [ ] **Step 5: Commit**

```bash
git add lib/server-auth.ts lib/server-auth.test.ts
git commit -m "feat(auth): soften server session gate for soft-eligible card+PK users"
```

---

### Task 4: Soften the client `isAuthenticated` gate (`lib/auth-store.ts`)

**Files:**
- Modify: `lib/auth-store.ts`
- Test: `lib/auth-store.test.ts` (new)

**Interfaces:**
- Consumes: `isPasswordChangeSoft` from Task 1; `pkLast3` from Task 2 (via `getCurrentUser()`).
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
    getCurrentUserMock.mockReturnValue({ id: 'u1', mustChangePassword: true, pkLast3: null, companyId: null })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('treats a soft-eligible card+PK user as fully authenticated', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u2', mustChangePassword: true, pkLast3: 'X9Z', companyId: null })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('keeps a B2B shared-password user hard-blocked even with pkLast3 set', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u3', mustChangePassword: true, pkLast3: 'X9Z', companyId: 'company_1' })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('authenticates a normal user with no password-change flag', () => {
    getCurrentUserMock.mockReturnValue({ id: 'u4', mustChangePassword: false })
    useAuthStore.getState().refresh()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth-store.test.ts`
Expected: FAIL — the "soft-eligible" case gets `isAuthenticated: false` (current unconditional `!user.mustChangePassword` check).

- [ ] **Step 3: Implement**

In `lib/auth-store.ts`, add the import:

```ts
import { isPasswordChangeSoft } from '@/lib/auth-types'
```

Change the `set({...})` call inside `refresh`:

```ts
    set({
      user,
      // Hard-blocked only when mustChangePassword is true AND it isn't a
      // soft-eligible card+PK login (see isPasswordChangeSoft).
      isAuthenticated: !!user && !(user.mustChangePassword && !isPasswordChangeSoft(user)),
      isAdmin: isAdminUser(user),
      isHydrated: true,
    })
```

Also update the early-return dedup check just above it, which currently only compares `mustChangePassword`, to keep it consistent with the new authentication logic (a `pkLast3`/`companyId` change without a `mustChangePassword` change can't happen in practice, so the existing comparison is still correct — no change needed there beyond leaving it as-is).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-store.ts lib/auth-store.test.ts
git commit -m "feat(auth): soften client isAuthenticated gate for soft-eligible card+PK users"
```

---

### Task 5: Extract `ChangePasswordFields` out of `ForceChangePasswordModal`

Pure refactor — no behavior change. Moves the input/validation/submit logic out of the modal so Task 6's banner can reuse it without duplicating it.

**Files:**
- Create: `components/account/ChangePasswordFields.tsx`
- Modify: `components/account/ForceChangePasswordModal.tsx`

**Interfaces:**
- Produces: `<ChangePasswordFields />` (no props) — renders the new-password/confirm inputs, client-side validation, and a submit button wired to `forceChangePassword()` from `lib/auth.ts`. Consumed by Task 6.

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

### Task 6: `PasswordChangeBanner` + wire `AccountGuard` to the soft/hard split

**Files:**
- Create: `components/account/PasswordChangeBanner.tsx`
- Modify: `components/account/AccountGuard.tsx`

**Interfaces:**
- Consumes: `isPasswordChangeSoft` (Task 1), `ChangePasswordFields` (Task 5), `useAuthStore` (Task 4).
- Produces: end-to-end feature — soft-eligible users now see `PasswordChangeBanner` instead of `ForceChangePasswordModal`, with full site access already granted by Tasks 3–4.

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
import { isPasswordChangeSoft } from '@/lib/auth-types';
import ForceChangePasswordModal from '@/components/account/ForceChangePasswordModal';
import PasswordChangeBanner from '@/components/account/PasswordChangeBanner';
import WelcomeModal from '@/components/account/WelcomeModal';

export default function AccountGuard({ children }: { children: React.ReactNode }): React.ReactElement | null {
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);

    if (!isHydrated) return null;

    const soft = !!user && isPasswordChangeSoft(user);

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
2. **Hard path (regression check):** use an existing B2B shared-card test account (`mustChangePassword: true`, `companyId` set). Confirm the blocking `ForceChangePasswordModal` still appears exactly as before, and the rest of the site is inaccessible until the password is changed — i.e. this task introduced no regression for that branch.

- [ ] **Step 4: Commit**

```bash
git add components/account/PasswordChangeBanner.tsx components/account/AccountGuard.tsx
git commit -m "feat(account): show a dismissible banner instead of a blocking modal for soft-eligible card+PK users"
```

---

## Self-Review Notes

- **Spec coverage:** Eligibility formula (Task 1), `pkLast3` plumbing client+server (Tasks 1–3), `getServerUser` softening (Task 3), `isAuthenticated` softening (Task 4), `ChangePasswordFields` extraction (Task 5), `PasswordChangeBanner` + `AccountGuard` wiring + `sessionStorage` dismiss (Task 6) — every section of the 2026-08-04 design spec maps to a task.
- **Out-of-scope items from the spec** (B2B/access-request branches, `WelcomeModal` timing, `register-card` claim-gate, i18n) are deliberately untouched by every task above — confirmed no task modifies `app/api/auth/register-card/route.ts`, `app/api/admin/access-requests/**`, or `WelcomeModal.tsx`.
- **Type consistency:** `PasswordChangeGateUser` (Task 1) fields (`mustChangePassword`, `pkLast3`, `companyId`) match the field names added to `ServerUser` (Task 3) and the client `User` type (Task 1) and used in `AccountGuard`/`auth-store` (Tasks 4, 6) — no renames across tasks.
