# Locale Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/config/locale` real — default language, date format, timezone (server artifacts only), and price-symbol position actually affect the live site, instead of writing to an unread zustand store.

**Architecture:** One `KeyValueSetting` row (`'locale-config'`) holds `{ defaultLanguage, dateFormat, timezone, priceFormat }`, read/written through `lib/locale-config-server-store.ts` (mirrors the existing `lib/bonus-config-server-store.ts` pattern). A public `GET /api/locale-config` route lets the client hydrate a module-level cache in `lib/utils.ts` once at app start, so `formatDate`/`formatEuro` change behavior without any of their ~49 call sites being touched. An admin `GET/PUT /api/admin/locale-config` route lets the admin page read and save the real values.

**Tech Stack:** Next.js App Router route handlers, Prisma (`KeyValueSetting`), Zustand (unrelated — this feature does not use it), Vitest.

## Global Constraints

- Currency stays EUR everywhere, no conversion, no currency picker in the admin UI (spec section "Решение по объёму", point 1).
- `dateFormat` is a single global pattern applied everywhere **except** `formatDate` calls that pass explicit `options` (e.g. the blog's long-form date) — those stay locale-driven, unchanged (spec point 2).
- `timezone` affects **only** server-rendered artifacts (order emails). Client-rendered pages keep showing the visitor's own browser timezone — never force-overridden (spec point 3).
- `defaultLanguage` only applies to visitors with no `eshop_language` cookie/localStorage yet — returning visitors are never affected (spec point 4).
- `formatDate(value, locale, options?)` and `formatEuro(value, locale)` signatures must not change — all existing call sites stay untouched (spec, "Клиент" section).
- Every fetch is `.catch(() => {})` with a hardcoded default fallback (`DD.MM.YYYY` / `Europe/Riga` / `symbol_before` / `'ru'`) if the server is unreachable — matches existing `BonusConfigSync`/`getBonusProgramConfig` error-handling convention.
- `pointsExpiryDays`-style scheduled features, currency conversion, and client-side timezone override are explicitly out of scope (spec, "Вне рамок").

---

### Task 1: Shared locale config types + timezone-aware date formatter

**Files:**
- Create: `lib/locale-config.ts`
- Create: `lib/date-format.ts`
- Test: `lib/date-format.test.ts`

**Interfaces:**
- Produces: `LocaleConfig` type, `DEFAULT_LOCALE_CONFIG` const, `TIMEZONES` const array, `SupportedTimezone`/`DateFormatOption`/`PriceFormatOption` types (all from `lib/locale-config.ts`) — consumed by every later task.
- Produces: `formatDateWithPattern(date: Date, pattern: DateFormatOption, timeZone?: string): string` (from `lib/date-format.ts`) — consumed by Task 3 (client) and Task 6 (server email, with `timeZone` passed).

- [ ] **Step 1: Create `lib/locale-config.ts`**

```ts
import type { Language } from '@/data/translations'

export type DateFormatOption = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type PriceFormatOption = 'symbol_before' | 'symbol_after'

export const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Riga',
  'Europe/Moscow',
] as const

export type SupportedTimezone = (typeof TIMEZONES)[number]

export type LocaleConfig = {
  defaultLanguage: Language
  dateFormat: DateFormatOption
  timezone: SupportedTimezone
  priceFormat: PriceFormatOption
}

export const DEFAULT_LOCALE_CONFIG: LocaleConfig = {
  defaultLanguage: 'ru',
  dateFormat: 'DD.MM.YYYY',
  timezone: 'Europe/Riga',
  priceFormat: 'symbol_before',
}
```

No test for this file — it is pure types/constants (same as `lib/bonus-program.ts`'s `DEFAULT_BONUS_PROGRAM_CONFIG`, which also has no dedicated test). `tsc --noEmit` is the only check that applies here, run at the end of Task 2 once something imports it.

- [ ] **Step 2: Write the failing test for `formatDateWithPattern`**

Create `lib/date-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatDateWithPattern } from './date-format'

describe('formatDateWithPattern', () => {
  it('formats DD.MM.YYYY with zero-padded day and month', () => {
    expect(formatDateWithPattern(new Date(2026, 0, 5), 'DD.MM.YYYY')).toBe('05.01.2026')
  })

  it('formats MM/DD/YYYY', () => {
    expect(formatDateWithPattern(new Date(2026, 11, 25), 'MM/DD/YYYY')).toBe('12/25/2026')
  })

  it('formats YYYY-MM-DD', () => {
    expect(formatDateWithPattern(new Date(2026, 5, 9), 'YYYY-MM-DD')).toBe('2026-06-09')
  })

  it('pads single-digit day and month for all patterns', () => {
    const date = new Date(2026, 2, 3) // 3 March 2026
    expect(formatDateWithPattern(date, 'DD.MM.YYYY')).toBe('03.03.2026')
    expect(formatDateWithPattern(date, 'MM/DD/YYYY')).toBe('03/03/2026')
    expect(formatDateWithPattern(date, 'YYYY-MM-DD')).toBe('2026-03-03')
  })

  it('handles the last day of the year correctly', () => {
    expect(formatDateWithPattern(new Date(2026, 11, 31), 'YYYY-MM-DD')).toBe('2026-12-31')
  })

  it('applies a specific IANA timezone when provided, overriding local getters', () => {
    // 2026-01-01T23:30:00Z is already 2026-01-02 in Europe/Riga (UTC+2/+3) —
    // deterministic regardless of the test runner's own local timezone.
    const date = new Date('2026-01-01T23:30:00.000Z')
    expect(formatDateWithPattern(date, 'YYYY-MM-DD', 'Europe/Riga')).toBe('2026-01-02')
  })

  it('without timeZone, uses the Date object\'s own local getters', () => {
    const date = new Date(2026, 5, 15) // constructed in local time — no conversion needed
    expect(formatDateWithPattern(date, 'YYYY-MM-DD')).toBe('2026-06-15')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/date-format.test.ts`
Expected: FAIL — `Cannot find module './date-format'` (file doesn't exist yet).

- [ ] **Step 4: Implement `lib/date-format.ts`**

```ts
import type { DateFormatOption } from '@/lib/locale-config'

const pad2 = (n: number): string => String(n).padStart(2, '0')

function applyPattern(day: string, month: string, year: string, pattern: DateFormatOption): string {
  if (pattern === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (pattern === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}.${month}.${year}`
}

/**
 * Renders a date using a fixed, language-independent numeric pattern (admin-configured).
 * Without `timeZone`, uses the Date object's own local getters — correct for client-side
 * rendering, where "local" is the visitor's own browser timezone. Pass `timeZone` (IANA
 * name) for server-rendered artifacts (e.g. order emails) that need one consistent
 * business timezone regardless of where the Node process itself runs.
 */
export function formatDateWithPattern(date: Date, pattern: DateFormatOption, timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00'
    return applyPattern(get('day'), get('month'), get('year'), pattern)
  }

  return applyPattern(pad2(date.getDate()), pad2(date.getMonth() + 1), String(date.getFullYear()), pattern)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/date-format.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/locale-config.ts lib/date-format.ts lib/date-format.test.ts
git commit -m "feat(locale): add shared locale config types and timezone-aware date formatter"
```

---

### Task 2: KV-backed locale config store + API routes

**Files:**
- Create: `lib/locale-config-server-store.ts`
- Create: `app/api/admin/locale-config/route.ts`
- Create: `app/api/locale-config/route.ts`
- Test: `app/api/admin/locale-config/route.test.ts`

**Interfaces:**
- Consumes: `LocaleConfig`, `DEFAULT_LOCALE_CONFIG`, `TIMEZONES` (Task 1, `lib/locale-config.ts`).
- Produces: `getLocaleConfig(): Promise<LocaleConfig>`, `saveLocaleConfig(input: Partial<LocaleConfig>): Promise<LocaleConfig>` (from `lib/locale-config-server-store.ts`) — consumed by Task 4 (public route already wraps this), Task 6 (order emails call `getLocaleConfig()` directly), Task 7 (admin page calls the admin route, not this function directly).
- Produces: `GET /api/locale-config` (public, no auth) and `GET`/`PUT /api/admin/locale-config` (admin-gated) HTTP endpoints.

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/locale-config/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { GET, PUT } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/locale-config', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/locale-config', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('returns defaults when no config is stored yet', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)

    const res = await GET()
    const body = await res.json()

    expect(body).toMatchObject({
      defaultLanguage: 'ru',
      dateFormat: 'DD.MM.YYYY',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })
  })
})

describe('PUT /api/admin/locale-config', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD' }))

    expect(res.status).toBe(403)
  })

  it('normalizes and persists a valid partial update', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'YYYY-MM-DD', priceFormat: 'symbol_after' }))
    const body = await res.json()

    expect(body).toMatchObject({
      dateFormat: 'YYYY-MM-DD',
      priceFormat: 'symbol_after',
      defaultLanguage: 'ru',
    })
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'locale-config' } })
    )
  })

  it('falls back to the default for an invalid enum value instead of persisting garbage', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
    vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue(null)
    vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({})

    const res = await PUT(makeRequest({ dateFormat: 'not-a-format' }))
    const body = await res.json()

    expect(body.dateFormat).toBe('DD.MM.YYYY')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/admin/locale-config/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement `lib/locale-config-server-store.ts`**

```ts
import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_LOCALE_CONFIG, TIMEZONES, type LocaleConfig, type SupportedTimezone } from '@/lib/locale-config'
import type { Language } from '@/data/translations'

const LOCALE_CONFIG_KEY = 'locale-config'
const LANGUAGES: Language[] = ['ru', 'en', 'lv']
const DATE_FORMATS = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const
const PRICE_FORMATS = ['symbol_before', 'symbol_after'] as const

function normalize(input?: Partial<LocaleConfig> | null): LocaleConfig {
  const source = input ?? {}
  return {
    defaultLanguage: LANGUAGES.includes(source.defaultLanguage as Language)
      ? (source.defaultLanguage as Language)
      : DEFAULT_LOCALE_CONFIG.defaultLanguage,
    dateFormat: (DATE_FORMATS as readonly string[]).includes(source.dateFormat as string)
      ? (source.dateFormat as LocaleConfig['dateFormat'])
      : DEFAULT_LOCALE_CONFIG.dateFormat,
    timezone: (TIMEZONES as readonly string[]).includes(source.timezone as string)
      ? (source.timezone as SupportedTimezone)
      : DEFAULT_LOCALE_CONFIG.timezone,
    priceFormat: (PRICE_FORMATS as readonly string[]).includes(source.priceFormat as string)
      ? (source.priceFormat as LocaleConfig['priceFormat'])
      : DEFAULT_LOCALE_CONFIG.priceFormat,
  }
}

export async function getLocaleConfig(): Promise<LocaleConfig> {
  try {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: LOCALE_CONFIG_KEY } })
    if (!row) return DEFAULT_LOCALE_CONFIG
    return normalize(row.value as Partial<LocaleConfig>)
  } catch {
    return DEFAULT_LOCALE_CONFIG
  }
}

export async function saveLocaleConfig(input: Partial<LocaleConfig>): Promise<LocaleConfig> {
  const existing = await getLocaleConfig()
  const next = normalize({ ...existing, ...input })

  await prisma.keyValueSetting.upsert({
    where: { key: LOCALE_CONFIG_KEY },
    create: { key: LOCALE_CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })

  return next
}
```

- [ ] **Step 4: Implement `app/api/admin/locale-config/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import type { LocaleConfig } from '@/lib/locale-config'
import { getLocaleConfig, saveLocaleConfig } from '@/lib/locale-config-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getLocaleConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const payload = (await request.json()) as Partial<LocaleConfig>
    const saved = await saveLocaleConfig(payload)
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_locale_config' }, { status: 400 })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/admin/locale-config/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Implement the public `app/api/locale-config/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getLocaleConfig } from '@/lib/locale-config-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getLocaleConfig()
  return NextResponse.json(config)
}
```

No dedicated test for this route — it has no logic beyond delegating to `getLocaleConfig()`, matching the existing convention for other public read-only routes (`app/api/categories/route.ts`, `app/api/bonus-config/route.ts` — neither has a test file).

- [ ] **Step 7: Run `tsc` to confirm Task 1 + Task 2 compile together**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/locale-config-server-store.ts app/api/admin/locale-config/route.ts app/api/admin/locale-config/route.test.ts app/api/locale-config/route.ts
git commit -m "feat(locale): add KV-backed locale config store and API routes"
```

---

### Task 3: Wire `formatDate`/`formatEuro` to the locale config

**Files:**
- Modify: `lib/utils.ts`
- Test: `lib/utils.test.ts` (new file)

**Interfaces:**
- Consumes: `LocaleConfig`, `DEFAULT_LOCALE_CONFIG` (Task 1), `formatDateWithPattern` (Task 1).
- Produces: `setLocaleFormatConfig(config: LocaleConfig): void` (from `lib/utils.ts`) — consumed by Task 4 (`LocaleConfigSync`).
- `formatDate`/`formatEuro` signatures are unchanged (`formatDate(value, locale, options?)`, `formatEuro(value, locale)`).

- [ ] **Step 1: Write the failing test**

Create `lib/utils.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { formatEuro, formatDate, setLocaleFormatConfig } from './utils'
import { DEFAULT_LOCALE_CONFIG } from './locale-config'

afterEach(() => {
  setLocaleFormatConfig(DEFAULT_LOCALE_CONFIG)
})

describe('formatEuro', () => {
  it('puts the symbol before the amount by default', () => {
    expect(formatEuro(10, 'en-US')).toBe('€10.00')
  })

  it('puts the symbol after the amount when configured', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, priceFormat: 'symbol_after' })
    expect(formatEuro(10, 'en-US')).toBe('10.00 €')
  })
})

describe('formatDate', () => {
  it('uses the configured global pattern when no options are passed', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, dateFormat: 'YYYY-MM-DD' })
    expect(formatDate(new Date(2026, 2, 5), 'ru-RU')).toBe('2026-03-05')
  })

  it('ignores the configured pattern when explicit options are passed', () => {
    setLocaleFormatConfig({ ...DEFAULT_LOCALE_CONFIG, dateFormat: 'YYYY-MM-DD' })
    const result = formatDate(new Date(2026, 2, 5), 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    expect(result).toBe('March 5, 2026')
  })

  it('defaults to DD.MM.YYYY before any config is loaded', () => {
    expect(formatDate(new Date(2026, 2, 5), 'ru-RU')).toBe('05.03.2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/utils.test.ts`
Expected: FAIL — `setLocaleFormatConfig is not exported by lib/utils.ts` (or similar).

- [ ] **Step 3: Modify `lib/utils.ts`**

Replace the full file content:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Language } from '@/data/translations'
import { DEFAULT_LOCALE_CONFIG, type LocaleConfig } from '@/lib/locale-config'
import { formatDateWithPattern } from '@/lib/date-format'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs))
}

export function getLocaleFromLanguage(language: Language): string {
  if (language === 'ru') return 'ru-RU'
  if (language === 'lv') return 'lv-LV'
  return 'en-US'
}

// Populated once by LocaleConfigSync (app/providers.tsx) after fetching the
// admin-configured settings — formatDate/formatEuro read it directly so none
// of their ~49 call sites across the app need to change.
let localeFormatConfig: LocaleConfig = DEFAULT_LOCALE_CONFIG

export function setLocaleFormatConfig(config: LocaleConfig): void {
  localeFormatConfig = config
}

export function formatEuro(value: number, locale: string): string {
  const amount = value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return localeFormatConfig.priceFormat === 'symbol_after' ? `${amount} €` : `€${amount}`
}

export function formatDate(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (options) return new Date(value).toLocaleDateString(locale, options)
  return formatDateWithPattern(new Date(value), localeFormatConfig.dateFormat)
}

export default cn
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/utils.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite to confirm no existing caller broke**

Run: `npx vitest run`
Expected: all files pass (formatEuro/formatDate signatures unchanged, so no other test file's assertions should be affected).

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/utils.test.ts
git commit -m "feat(locale): make formatDate/formatEuro respect the admin-configured locale"
```

---

### Task 4: Hydrate the config app-wide on mount

**Files:**
- Modify: `app/providers.tsx`

**Interfaces:**
- Consumes: `GET /api/locale-config` (Task 2), `setLocaleFormatConfig` (Task 3).
- No test — `providers.tsx` has no existing test coverage anywhere in this repo (no `@testing-library` dependency is installed), and `BonusConfigSync` (the component this mirrors) also has none. Verified manually in Step 3.

- [ ] **Step 1: Add the import**

In `app/providers.tsx`, add to the existing import block (which already has `import { useAdminStore } from '@/lib/admin-store'` from the earlier bonus-config work):

```ts
import { setLocaleFormatConfig } from '@/lib/utils'
```

- [ ] **Step 2: Add the `LocaleConfigSync` component and mount it**

Add this function right after the existing `BonusConfigSync` function:

```tsx
// Date/price format + default-language settings are admin-configured (KV-backed) —
// hydrate the real value once app-wide so formatDate/formatEuro (lib/utils.ts)
// reflect it everywhere without threading a config prop through every call site.
function LocaleConfigSync(): null {
  useEffect(() => {
    fetch('/api/locale-config')
      .then((r) => r.json())
      .then((config) => setLocaleFormatConfig(config))
      .catch(() => {})
  }, [])
  return null
}
```

In the `Providers` component's JSX, add `<LocaleConfigSync />` right after `<BonusConfigSync />`:

```tsx
        <SeedAccounts />
        <AuthStoreProvider />
        <BonusConfigSync />
        <LocaleConfigSync />
        <WishlistScopeSync />
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Open the site in a browser with DevTools Network tab open. Confirm a `GET /api/locale-config` request fires once on load and returns `{"defaultLanguage":"ru","dateFormat":"DD.MM.YYYY","timezone":"Europe/Riga","priceFormat":"symbol_before"}` (the defaults, since nothing has been saved to the KV row yet).

- [ ] **Step 4: Run `tsc` and the full test suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/providers.tsx
git commit -m "feat(locale): hydrate locale config app-wide on mount"
```

---

### Task 5: Admin-configured default language for new visitors

**Files:**
- Modify: `lib/i18n-context.tsx`

**Interfaces:**
- Consumes: `GET /api/locale-config` (Task 2).
- No test — no test infra exists for React context providers in this repo (confirmed: no `@testing-library/*` in `package.json`). Verified manually in Step 2.

- [ ] **Step 1: Replace the language-loading `useEffect`**

In `lib/i18n-context.tsx`, replace:

```tsx
  // Load language from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language | null
    if (savedLanguage && ['ru', 'en', 'lv'].includes(savedLanguage)) {
      setLanguageState(savedLanguage)
    }
    setMounted(true)
  }, [])
```

with:

```tsx
  // Load language from localStorage on mount. If there's no saved preference
  // yet, use the admin-configured default instead of a hardcoded fallback —
  // only first-time visitors pay this extra round-trip.
  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language | null
    if (savedLanguage && ['ru', 'en', 'lv'].includes(savedLanguage)) {
      setLanguageState(savedLanguage)
      setMounted(true)
      return
    }

    fetch('/api/locale-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (config?.defaultLanguage && ['ru', 'en', 'lv'].includes(config.defaultLanguage)) {
          setLanguageState(config.defaultLanguage)
        }
      })
      .catch(() => {})
      .finally(() => setMounted(true))
  }, [])
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. In an incognito/private browser window (no `eshop_language` in localStorage), open DevTools Network tab, load the site. Confirm `GET /api/locale-config` fires before the page renders (the component returns `null` until `mounted`). Then reload the same window (now `eshop_language` is set) — confirm the request does **not** fire again.

- [ ] **Step 3: Run `tsc`**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n-context.tsx
git commit -m "feat(locale): use admin-configured default language for first-time visitors"
```

---

### Task 6: Order emails use the configured timezone and date pattern

**Files:**
- Modify: `app/api/orders/route.ts`
- Modify: `app/api/orders/route.test.ts`

**Interfaces:**
- Consumes: `getLocaleConfig` (Task 2), `formatDateWithPattern` (Task 1).

- [ ] **Step 1: Extend the existing test file's mocks**

In `app/api/orders/route.test.ts`, add this mock alongside the existing ones at the top:

```ts
vi.mock('@/lib/locale-config-server-store', () => ({
  getLocaleConfig: vi.fn(),
}))
```

Add the import:

```ts
import { getLocaleConfig } from '@/lib/locale-config-server-store'
```

In the `beforeEach` block, add a default mock so the existing 3 tests keep passing unchanged:

```ts
    vi.mocked(getLocaleConfig).mockResolvedValue({
      defaultLanguage: 'ru',
      dateFormat: 'DD.MM.YYYY',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })
```

- [ ] **Step 2: Write the new failing test**

Add this test inside the existing `describe('POST /api/orders — admin notification', ...)` block:

```ts
  it('formats the admin email date using the configured pattern and timezone', async () => {
    vi.mocked(getLocaleConfig).mockResolvedValue({
      defaultLanguage: 'ru',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'Europe/Riga',
      priceFormat: 'symbol_before',
    })

    await POST(makeRequest({ ...VALID_ORDER, createdAt: '2026-06-16T10:00:00.000Z' }))
    await vi.waitFor(() => expect(vi.mocked(sendEmail).mock.calls.length).toBeGreaterThanOrEqual(1))

    const adminCall = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'admin@shop.com')
    const [, , html] = adminCall!
    // 10:00 UTC is safely within 2026-06-16 in Europe/Riga regardless of DST offset.
    expect(html).toContain('2026-06-16')
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: FAIL — the email still contains the old `ru-RU`/`Europe/Riga`-hardcoded `toLocaleString` output, not `2026-06-16`.

- [ ] **Step 4: Modify `app/api/orders/route.ts`**

Add imports at the top, alongside the existing ones:

```ts
import { getLocaleConfig } from '@/lib/locale-config-server-store'
import { formatDateWithPattern } from '@/lib/date-format'
```

Replace:

```ts
  // Admin notification is intentionally in Russian regardless of order.language
  const date = new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Riga' })
```

with:

```ts
  // Admin notification is intentionally in Russian regardless of order.language.
  // Date/time use the admin-configured business timezone + date pattern, not the
  // Node process's own timezone (which varies by hosting region).
  const localeConfig = await getLocaleConfig()
  const orderDate = new Date(order.createdAt)
  const dateStr = formatDateWithPattern(orderDate, localeConfig.dateFormat, localeConfig.timezone)
  const timeStr = orderDate.toLocaleTimeString('en-GB', {
    timeZone: localeConfig.timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
  const date = `${dateStr} ${timeStr}`
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat(locale): order emails use the admin-configured timezone and date pattern"
```

---

### Task 7: Rewrite the admin locale settings page

**Files:**
- Modify: `app/admin/config/locale/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/admin/locale-config` (Task 2), `TIMEZONES`/`DEFAULT_LOCALE_CONFIG`/`LocaleConfig`/`DateFormatOption`/`PriceFormatOption`/`SupportedTimezone` (Task 1).
- No test — no admin page in this codebase has component-level test coverage. Verified manually in Step 2.

- [ ] **Step 1: Replace the full file content**

Replace all of `app/admin/config/locale/page.tsx` with:

```tsx
'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TIMEZONES,
  DEFAULT_LOCALE_CONFIG,
  type LocaleConfig,
  type DateFormatOption,
  type PriceFormatOption,
  type SupportedTimezone,
} from '@/lib/locale-config'
import type { Language } from '@/data/translations'

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'

const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  lv: 'Latviešu',
}

const DATE_FORMAT_LABELS: Record<DateFormatOption, string> = {
  'DD.MM.YYYY': 'DD.MM.YYYY (27.05.2026)',
  'MM/DD/YYYY': 'MM/DD/YYYY (05/27/2026)',
  'YYYY-MM-DD': 'YYYY-MM-DD (2026-05-27)',
}

const TIMEZONE_LABELS: Record<SupportedTimezone, string> = {
  UTC: 'UTC (UTC+0)',
  'Europe/London': 'Europe/London (UTC+0/+1)',
  'Europe/Riga': 'Europe/Riga (UTC+2/+3)',
  'Europe/Moscow': 'Europe/Moscow (UTC+3)',
}

const PRICE_FORMAT_LABELS: Record<PriceFormatOption, string> = {
  symbol_before: 'Символ до числа (€ 100.00)',
  symbol_after: 'Символ после числа (100.00 €)',
}

function formatPricePreview(format: PriceFormatOption): string {
  return format === 'symbol_before' ? '€ 1 234.56' : '1 234.56 €'
}

export default function AdminLocalePage() {
  const [config, setConfig] = useState<LocaleConfig>(DEFAULT_LOCALE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string>('')

  // Load the admin-authoritative config directly — don't seed from a
  // possibly-stale client cache (same reasoning as app/admin/bonus/page.tsx).
  useEffect(() => {
    fetch('/api/admin/locale-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LocaleConfig | null) => { if (data) setConfig(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pricePreview = formatPricePreview(config.priceFormat)

  const persist = (next: LocaleConfig, successMessage: string): void => {
    setConfig(next)
    fetch('/api/admin/locale-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {})
    setMessage(successMessage)
    setTimeout(() => setMessage(''), 3000)
  }

  const handleSave = (): void => persist(config, 'Настройки сохранены')
  const handleReset = (): void => persist(DEFAULT_LOCALE_CONFIG, 'Настройки сброшены к умолчанию')

  if (loading) {
    return (
      <AdminGate>
        <main className="w-full py-4">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </main>
      </AdminGate>
    )
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Локализация
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Настройте язык по умолчанию, формат даты, часовой пояс и формат цены.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Язык интерфейса</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Язык по умолчанию для новых пользователей и неавторизованных посетителей сайта.
              </p>
            </div>

            <div className="max-w-xs space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Язык по умолчанию
              </label>
              <Select
                value={config.defaultLanguage}
                onValueChange={(v) => setConfig((c) => ({ ...c, defaultLanguage: v as Language }))}
              >
                <SelectTrigger className={SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {LANGUAGE_LABELS[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Валюта</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Магазин работает только в евро — конвертация в другие валюты не поддерживается.
              </p>
            </div>
            <div className="max-w-xs">
              <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                EUR — Евро (€)
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Дата и время</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Формат даты применяется на всём сайте и в письмах. Часовой пояс — только для писем и уведомлений (клиентские страницы всегда показывают время браузера посетителя).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Формат даты
                </label>
                <Select
                  value={config.dateFormat}
                  onValueChange={(v) => setConfig((c) => ({ ...c, dateFormat: v as DateFormatOption }))}
                >
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormatOption[]).map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {DATE_FORMAT_LABELS[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Часовой пояс (для писем)
                </label>
                <Select
                  value={config.timezone}
                  onValueChange={(v) => setConfig((c) => ({ ...c, timezone: v as SupportedTimezone }))}
                >
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {TIMEZONE_LABELS[tz]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Формат цены</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Расположение символа валюты относительно суммы.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Расположение символа
                </label>
                <Select
                  value={config.priceFormat}
                  onValueChange={(v) => setConfig((c) => ({ ...c, priceFormat: v as PriceFormatOption }))}
                >
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['symbol_before', 'symbol_after'] as PriceFormatOption[]).map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {PRICE_FORMAT_LABELS[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Превью цены
                </label>
                <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground">
                  {pricePreview}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" onClick={handleReset}>
            Сбросить к умолчанию
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </div>
      </main>
    </AdminGate>
  )
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. Log in as admin, visit `/admin/config/locale`. Confirm:
- No currency `Select` — just a static "EUR — Евро (€)" line.
- Change "Формат даты" to `YYYY-MM-DD`, click "Сохранить", reload the page — the select still shows `YYYY-MM-DD` (persisted via the KV row, not local-only).
- Visit `/order/<any existing order id>` or the account order history — dates now render as `YYYY-MM-DD` (Task 3/4 wiring).

- [ ] **Step 3: Run `tsc`**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/config/locale/page.tsx
git commit -m "feat(locale): admin locale page reads/writes the real KV config, drops currency picker"
```

---

### Task 8: Remove the dead zustand store and verify the full suite

**Files:**
- Delete: `lib/locale-settings-store.ts`

- [ ] **Step 1: Confirm nothing still imports it**

Run: `grep -rln "locale-settings-store" --include="*.ts" --include="*.tsx" app components lib`
Expected: no output (Task 7 already removed the only importer, `app/admin/config/locale/page.tsx`).

- [ ] **Step 2: Delete the file**

```bash
git rm lib/locale-settings-store.ts
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass (no file references the deleted store).

- [ ] **Step 4: Run `tsc`**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(locale): remove dead locale-settings-store (superseded by KV-backed config)"
```
