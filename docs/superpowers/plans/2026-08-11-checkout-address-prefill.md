# Checkout Address Prefill + Save-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checkout (`/checkout`) prefills its form from the logged-in user's saved address / profile by default, and silently saves the address used on a successful order back to their address book — so repeat customers stop retyping the same details every order.

**Architecture:** Two small, independently testable pieces. (1) A new pure-function module `lib/checkout-address-prefill.ts` holds all the address-selection/merge logic with zero React or fetch dependencies, fully unit-testable. (2) `useCheckoutPage.tsx` wires that module into the existing form: an effect fetches saved addresses and merges them into `formData` on mount (read side), and the existing order-success path upserts the submitted address back to the server (write side). No new UI, no new API routes, no DB schema changes — everything needed (`SavedAddress` model, `/api/user/addresses`, `useSavedAddresses` store) already exists and is already used by `/account/addresses`; checkout just wasn't calling any of it.

**Tech Stack:** Next.js 15 App Router, React client components, Zustand (`useSavedAddresses`), Vitest for unit tests.

## Global Constraints

- No changes to the live Neon DB schema — use only existing `SavedAddress` fields (spec: "Non-goals").
- Save-back is silent, no consent checkbox (confirmed with user during brainstorming).
- Single auto-selected address only — no picker/dropdown UI in checkout (confirmed with user).
- URL query params keep highest priority for prefill — never overwritten (spec: "Precedence", step 1). This is what powers the existing "Использовать" link on `/account/addresses` (`app/[lang]/account/addresses/page.tsx:13-22`).
- Guests (`currentUser === null`) get neither prefill fetch nor save-back (spec: "Precedence" step 4 / "Save-back" section).
- Prefill must never overwrite a field the user already typed while the fetch is in flight — merge only into currently-empty fields (spec: "Precedence", closing paragraph).

---

### Task 1: Pure address-prefill helpers

**Files:**
- Create: `lib/checkout-address-prefill.ts`
- Test: `lib/checkout-address-prefill.test.ts`

**Interfaces:**
- Consumes: `SavedAddress` type from `lib/saved-addresses-store.ts` (fields: `id, firstName, lastName, email, phone, address, city, postalCode?`).
- Produces (used by Task 2 and Task 3):
  - `type CheckoutAddressFields = { firstName: string; lastName: string; email: string; phone: string; address: string; city: string; postalCode: string }`
  - `checkoutDefaultAddressId(userId: string): string`
  - `pickPrefillAddress(savedAddresses: SavedAddress[], userId: string): SavedAddress | undefined`
  - `splitName(fullName: string | undefined): { firstName: string; lastName: string }`
  - `mergeEmptyAddressFields(current: CheckoutAddressFields, fallback: Partial<CheckoutAddressFields>): CheckoutAddressFields`
  - `buildSaveBackAddress(user: { id: string; email: string } | null | undefined, fields: CheckoutAddressFields): SavedAddress | null`

- [ ] **Step 1: Write the failing tests**

Create `lib/checkout-address-prefill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  checkoutDefaultAddressId,
  pickPrefillAddress,
  splitName,
  mergeEmptyAddressFields,
  buildSaveBackAddress,
} from './checkout-address-prefill'
import type { SavedAddress } from './saved-addresses-store'

describe('checkoutDefaultAddressId', () => {
  it('builds a fixed id from the user id', () => {
    expect(checkoutDefaultAddressId('user_123')).toBe('checkout_default_user_123')
  })
})

describe('pickPrefillAddress', () => {
  const manual: SavedAddress = {
    id: 'addr_manual_1',
    firstName: 'Anna',
    lastName: 'Berzina',
    email: 'a@b.com',
    phone: '+37120000000',
    address: 'Brivibas 1',
    city: 'Riga',
    postalCode: 'LV-1010',
  }
  const checkoutDefault: SavedAddress = {
    id: 'checkout_default_user_123',
    firstName: 'Anna',
    lastName: 'Berzina',
    email: 'a@b.com',
    phone: '+37120000001',
    address: 'Krasta 5',
    city: 'Riga',
    postalCode: 'LV-1019',
  }

  it('prefers the checkout_default_<userId> entry when present', () => {
    const result = pickPrefillAddress([manual, checkoutDefault], 'user_123')
    expect(result).toBe(checkoutDefault)
  })

  it('falls back to the first saved address when no checkout-default entry exists', () => {
    const result = pickPrefillAddress([manual], 'user_123')
    expect(result).toBe(manual)
  })

  it('returns undefined when there are no saved addresses', () => {
    expect(pickPrefillAddress([], 'user_123')).toBeUndefined()
  })
})

describe('splitName', () => {
  it('splits on the first space', () => {
    expect(splitName('Ivan Petrov')).toEqual({ firstName: 'Ivan', lastName: 'Petrov' })
  })

  it('keeps multi-word last names intact', () => {
    expect(splitName('Anna De La Cruz')).toEqual({ firstName: 'Anna', lastName: 'De La Cruz' })
  })

  it('puts a single-word name entirely in firstName', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })

  it('returns empty strings for undefined or blank input', () => {
    expect(splitName(undefined)).toEqual({ firstName: '', lastName: '' })
    expect(splitName('   ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('mergeEmptyAddressFields', () => {
  const empty = { firstName: '', lastName: '', email: '', phone: '', address: '', city: '', postalCode: '' }

  it('fills empty fields from the fallback', () => {
    const result = mergeEmptyAddressFields(empty, { firstName: 'Ivan', city: 'Riga' })
    expect(result.firstName).toBe('Ivan')
    expect(result.city).toBe('Riga')
    expect(result.lastName).toBe('')
  })

  it('never overwrites a field that already has a value (e.g. from a query param)', () => {
    const current = { ...empty, firstName: 'FromQueryParam' }
    const result = mergeEmptyAddressFields(current, { firstName: 'FromProfile' })
    expect(result.firstName).toBe('FromQueryParam')
  })

  it('ignores empty-string fallback values', () => {
    const result = mergeEmptyAddressFields(empty, { firstName: '' })
    expect(result.firstName).toBe('')
  })
})

describe('buildSaveBackAddress', () => {
  const fields = {
    firstName: 'Ivan',
    lastName: 'Petrov',
    email: 'typed-in-form@maybe-different.com',
    phone: '+37120000000',
    address: 'Brivibas 1',
    city: 'Riga',
    postalCode: 'LV-1010',
  }

  it('returns null for a guest (no user)', () => {
    expect(buildSaveBackAddress(null, fields)).toBeNull()
    expect(buildSaveBackAddress(undefined, fields)).toBeNull()
  })

  it('builds a SavedAddress keyed by the fixed checkout-default id', () => {
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result?.id).toBe('checkout_default_user_123')
  })

  it("uses the account's canonical email, not whatever was typed in the form", () => {
    // SavedAddress rows are looked up by exact User.email match (GET /api/user/addresses
    // filters `where: { email: user.email }`) — saving a form-typed email that differs
    // from the account's would make the row invisible to that lookup.
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result?.email).toBe('account@real.com')
  })

  it('carries over the rest of the submitted fields unchanged', () => {
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result).toEqual({
      id: 'checkout_default_user_123',
      firstName: 'Ivan',
      lastName: 'Petrov',
      email: 'account@real.com',
      phone: '+37120000000',
      address: 'Brivibas 1',
      city: 'Riga',
      postalCode: 'LV-1010',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checkout-address-prefill.test.ts`
Expected: FAIL — `lib/checkout-address-prefill.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/checkout-address-prefill.ts`:

```typescript
import type { SavedAddress } from './saved-addresses-store'

export type CheckoutAddressFields = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
}

export function checkoutDefaultAddressId(userId: string): string {
  return `checkout_default_${userId}`
}

export function pickPrefillAddress(
  savedAddresses: SavedAddress[],
  userId: string
): SavedAddress | undefined {
  const defaultId = checkoutDefaultAddressId(userId)
  return savedAddresses.find((candidate) => candidate.id === defaultId) ?? savedAddresses[0]
}

export function splitName(fullName: string | undefined): { firstName: string; lastName: string } {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }

  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  }
}

export function mergeEmptyAddressFields(
  current: CheckoutAddressFields,
  fallback: Partial<CheckoutAddressFields>
): CheckoutAddressFields {
  const result = { ...current }
  for (const key of Object.keys(current) as Array<keyof CheckoutAddressFields>) {
    const fallbackValue = fallback[key]
    if (!result[key] && fallbackValue) {
      result[key] = fallbackValue
    }
  }
  return result
}

export function buildSaveBackAddress(
  user: { id: string; email: string } | null | undefined,
  fields: CheckoutAddressFields
): SavedAddress | null {
  if (!user) return null

  return {
    id: checkoutDefaultAddressId(user.id),
    firstName: fields.firstName,
    lastName: fields.lastName,
    // The account's canonical email, not fields.email — see test comment for why.
    email: user.email,
    phone: fields.phone,
    address: fields.address,
    city: fields.city,
    postalCode: fields.postalCode,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checkout-address-prefill.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkout-address-prefill.ts lib/checkout-address-prefill.test.ts
git commit -m "feat: add pure helpers for checkout address prefill"
```

---

### Task 2: Wire prefill into checkout (read side)

**Files:**
- Modify: `app/[lang]/checkout/useCheckoutPage.tsx`

**Interfaces:**
- Consumes: `pickPrefillAddress`, `splitName`, `mergeEmptyAddressFields`, `CheckoutAddressFields` from Task 1, plus `useSavedAddresses` and `hydrateSavedAddressesFromServer` from `lib/saved-addresses-store.ts` (already exist, used by `app/[lang]/account/addresses/page.tsx`).
- Produces: `upsertForEmail` becomes available in `useCheckoutPageState` scope for Task 3 to consume.

This task only adds the *read* path (prefill on mount). The *write* path (save-back on submit) is Task 3, so this task's manual test only covers prefill.

- [ ] **Step 1: Add the new imports**

In `app/[lang]/checkout/useCheckoutPage.tsx`, find:

```typescript
import { useInvoicesStore } from '@/lib/invoices-store';
import { logAuditAction } from '@/lib/audit-log-store';
import { useCompanyStore } from '@/lib/company-store';
import { burstConfetti } from '@/lib/confetti';
import { useTurnstile } from '@/lib/use-turnstile';
import { type CheckoutFormData } from './CheckoutFormSections';
```

Replace with:

```typescript
import { useInvoicesStore } from '@/lib/invoices-store';
import { logAuditAction } from '@/lib/audit-log-store';
import { useCompanyStore } from '@/lib/company-store';
import { burstConfetti } from '@/lib/confetti';
import { useTurnstile } from '@/lib/use-turnstile';
import { useSavedAddresses, hydrateSavedAddressesFromServer } from '@/lib/saved-addresses-store';
import {
    pickPrefillAddress,
    splitName,
    mergeEmptyAddressFields,
    type CheckoutAddressFields,
} from '@/lib/checkout-address-prefill';
import { type CheckoutFormData } from './CheckoutFormSections';
```

- [ ] **Step 2: Pull in the saved-addresses store**

Find:

```typescript
    const { getCompany, syncFromDb } = useCompanyStore();
```

Replace with:

```typescript
    const { getCompany, syncFromDb } = useCompanyStore();
    const { getByEmail, upsertForEmail, replaceForEmail } = useSavedAddresses();
```

- [ ] **Step 3: Add the prefill effect**

Find (the `formData` state declaration — this anchor matters: the new effect must sit *after* `setFormData` is declared, not before, even though effect bodies only run after the full render completes and either ordering would technically work — keeping it after is the non-confusing, conventional order):

```typescript
    const [formData, setFormData] = useState<CheckoutFormData>(() => ({
        firstName: searchParams.get('firstName') ?? '',
        lastName: searchParams.get('lastName') ?? '',
        email: searchParams.get('email') ?? '',
        phone: searchParams.get('phone') ?? '',
        address: searchParams.get('address') ?? '',
        city: searchParams.get('city') ?? '',
        postalCode: searchParams.get('postalCode') ?? '',
        paymentMethod: 'card',
    }));
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
```

Replace with:

```typescript
    const [formData, setFormData] = useState<CheckoutFormData>(() => ({
        firstName: searchParams.get('firstName') ?? '',
        lastName: searchParams.get('lastName') ?? '',
        email: searchParams.get('email') ?? '',
        phone: searchParams.get('phone') ?? '',
        address: searchParams.get('address') ?? '',
        city: searchParams.get('city') ?? '',
        postalCode: searchParams.get('postalCode') ?? '',
        paymentMethod: 'card',
    }));

    // Prefill from the user's saved address / profile, but never clobber a field
    // that's already filled (e.g. from a "Use this address" query-param link above).
    React.useEffect(() => {
        if (!currentUser?.email || !currentUser?.id) return;
        let cancelled = false;
        void hydrateSavedAddressesFromServer(currentUser.email, replaceForEmail).then(() => {
            if (cancelled) return;
            const saved = pickPrefillAddress(getByEmail(currentUser.email), currentUser.id);
            const fallback: Partial<CheckoutAddressFields> = saved
                ? {
                      firstName: saved.firstName,
                      lastName: saved.lastName,
                      phone: saved.phone,
                      address: saved.address,
                      city: saved.city,
                      postalCode: saved.postalCode ?? '',
                      email: currentUser.email,
                  }
                : {
                      ...splitName(currentUser.name),
                      phone: currentUser.phone ?? '',
                      email: currentUser.email,
                  };
            setFormData((prev) => ({ ...prev, ...mergeEmptyAddressFields(prev, fallback) }));
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id, currentUser?.email]);
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification (prefill only)**

Run the dev server (see the `run` skill if unsure how this project starts it). Then:

1. Log in as a user that has at least one row in `SavedAddress` for their email (or create one first via `/account/addresses` → "Добавить адрес").
2. Add an item to the cart and go to `/checkout` with a plain URL (no query params).
3. Confirm firstName/lastName/phone/address/city/postalCode are pre-filled from the saved address.
4. Log in as a user with zero saved addresses but a filled-in profile name/phone.
5. Go to `/checkout` — confirm firstName/lastName/phone/email are filled from the profile, address/city/postalCode stay blank.
6. Open the "Использовать" link from `/account/addresses` for a *different* address than the one used in step 1 — confirm the query-param address wins and isn't overwritten by the profile fetch.

- [ ] **Step 6: Commit**

```bash
git add app/[lang]/checkout/useCheckoutPage.tsx
git commit -m "feat: prefill checkout form from saved address or profile"
```

---

### Task 3: Wire save-back into checkout (write side)

**Files:**
- Modify: `app/[lang]/checkout/useCheckoutPage.tsx`

**Interfaces:**
- Consumes: `upsertForEmail` (from Task 2's Step 2), `buildSaveBackAddress` (from Task 1).

- [ ] **Step 1: Add the import**

Find:

```typescript
import {
    pickPrefillAddress,
    splitName,
    mergeEmptyAddressFields,
    type CheckoutAddressFields,
} from '@/lib/checkout-address-prefill';
```

Replace with:

```typescript
import {
    pickPrefillAddress,
    splitName,
    mergeEmptyAddressFields,
    buildSaveBackAddress,
    type CheckoutAddressFields,
} from '@/lib/checkout-address-prefill';
```

- [ ] **Step 2: Add the save-back call to the order-success path**

Find (inside `handleSubmit`, right after the order is confirmed created server-side):

```typescript
        const order = { id: orderId, ...orderData };
        addOrder(order);

        // Сервер дебетовал/кредитовал баллы при создании заказа — подтягиваем свежий баланс.
        if (currentUser) {
            await syncBonusBalanceFromServer();
        }
```

Replace with:

```typescript
        const order = { id: orderId, ...orderData };
        addOrder(order);

        // Silently keep the address book in sync so next checkout prefills from it.
        // Fixed id → repeat orders update the same row instead of piling up duplicates.
        const addressToSave = buildSaveBackAddress(currentUser, formData);
        if (addressToSave) {
            upsertForEmail(addressToSave.email, addressToSave);
        }

        // Сервер дебетовал/кредитовал баллы при создании заказа — подтягиваем свежий баланс.
        if (currentUser) {
            await syncBonusBalanceFromServer();
        }
```

`upsertForEmail` already does an optimistic local update plus a fire-and-forget `POST /api/user/addresses` with `.catch(() => {})` inside `lib/saved-addresses-store.ts` — it cannot throw and cannot delay the redirect that follows.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full unit test suite**

Run: `npm run test:unit`
Expected: all pass, including the new `lib/checkout-address-prefill.test.ts` and the pre-existing `lib/saved-addresses-store.test.ts`.

- [ ] **Step 5: Manual verification (save-back, end to end)**

1. Log in as a user with **no** saved addresses.
2. Go to `/checkout`, fill the form manually with a fresh address, complete an order (use a payment method that doesn't require leaving the site, e.g. bank transfer/cash if eligible, to reach the confirmation redirect).
3. Open `/account/addresses` — confirm a new entry now exists with the address just used.
4. Go back to `/checkout` for a new order — confirm the form is now pre-filled with that address (this exercises Task 2's `pickPrefillAddress` picking the `checkout_default_<userId>` row).
5. Change the address in the checkout form and complete a second order.
6. Reload `/account/addresses` — confirm there is still exactly **one** auto-saved entry (not two), now showing the updated address. Any manually-added addresses from `/account/addresses` must be untouched.
7. Repeat steps 1-2 as a **guest** (no login) — confirm the order completes normally and nothing appears in any address book (there's no account to attach to).

- [ ] **Step 6: Run the project's full verification pass**

Use the `verify` skill (or, if unavailable, at minimum): `npm run test:unit`, `npx tsc --noEmit`, and a production build (`npm run build`) to make sure nothing else regressed.

- [ ] **Step 7: Commit**

```bash
git add app/[lang]/checkout/useCheckoutPage.tsx
git commit -m "feat: save checkout address back to the user's address book"
```
