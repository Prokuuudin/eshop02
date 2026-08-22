# Invitations Holders Server-Side Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `GET /api/admin/invitations` from loading every card-holder `User` row (currently ~10,746) on every visit to `/admin/invitations` and on every single-invite/WhatsApp/card-assign action; move search + pagination to the server, mirroring the pattern already proven on `/admin/client-barcodes` (`/api/admin/users?search=&skip=&take=`).

**Architecture:** `GET /api/admin/invitations` gains `search`/`skip`/`take`/`sort`/`dir` query params (reusing `parseOffsetPagination` from `lib/pagination.ts`), queries `User` with `where`+`orderBy`+`skip`+`take`, and returns `{ holders, total }` instead of the full array. The `InvitationToken` join (for `status`/`sentAt`) is bounded to just the fetched page's emails via a new optional `emails` filter on `readInvitations()`. Sorting by `name`/`email`/`cardNumber` (real `User` columns) happens server-side; sorting by `status` (a derived field, not a DB column) stays a client-side re-sort of the currently-loaded page only — the table already only ever shows one page (50 rows) at a time, so this is not a behavior regression. Bulk-select ("select all") already only ever targets the current page's checkboxes (`pageSelectableHolderIds` from `pagedHolders`, `app/[lang]/admin/invitations/page.tsx:324-325`) — there is no "select all across pages" today, so nothing about bulk-send semantics changes.

**Tech Stack:** Next.js route handler (`app/api/admin/invitations/route.ts`), Prisma (`prisma.user`, `prisma.invitationToken`), React client state (`app/[lang]/admin/invitations/page.tsx`), Vitest (`vitest.config.ts`, mocked-Prisma unit tests colocated as `route.test.ts` — see `app/api/admin/media/route.test.ts` and `app/api/admin/orders/route.test.ts` for the established mocking convention).

**Spec:** No separate spec doc — this plan implements a follow-up optimization to the feature specified in `docs/superpowers/specs/2026-07-06-client-card-invitations-design.md` / `docs/superpowers/plans/2026-07-06-client-card-invitations.md` (segment A, "держатели карты"). Scope and design were worked out in conversation: confirmed current row count (10,746 `User` rows with `cardNumber != null`, via a one-off Prisma count against the Neon dev copy), confirmed the existing "select all" only ever operates per-page (not across the full filtered set), and confirmed the codebase's established server-side-pagination pattern via `app/api/admin/users/route.ts` + `app/[lang]/admin/client-barcodes/useAdminClientBarcodesPage.tsx`.

## Global Constraints

- Do not change `POST /api/admin/invitations` (email-sending logic) — this plan touches `GET` only.
- Do not change the "select all" semantics — it must keep meaning "all checkboxes on the current page," exactly as today.
- Do not add new dependencies. Reuse `lib/pagination.ts::parseOffsetPagination` (already used by `app/api/admin/users/route.ts`).
- Default page size stays `50` (`INVITATIONS_PAGE_SIZE` in `app/[lang]/admin/invitations/invitation-models.ts:30`, unchanged).
- No React Testing Library / component-test convention exists in this repo's admin pages (checked: no `*.test.tsx` under `app/[lang]/admin/**`). The client-side task is verified manually via the dev server, matching how `app/[lang]/admin/client-barcodes/page.tsx` (the pattern being mirrored) is itself untested at the component level.

---

## Task 1: Bound the invitation-token join to specific emails

**Files:**
- Modify: `lib/invitations.ts:62-75` (`readInvitations`)
- Test: `lib/invitations.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `readInvitations(db: Db, emails?: string[]): Promise<ProInvitation[]>` — when `emails` is passed, only tokens for those (already-lowercased) emails are fetched; when omitted, behavior is unchanged (fetches all tokens, as today). Task 2 relies on this new optional second parameter.

- [ ] **Step 1: Write the failing test**

Add to `lib/invitations.test.ts` (new `describe` block, after the existing `describe('configuration', ...)` block):

```ts
describe('readInvitations', () => {
  it('fetches every token when no email filter is given', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const db = { invitationToken: { findMany } } as unknown as ExtendedPrismaClient
    await readInvitations(db)
    expect(findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { createdAt: 'desc' } })
  })

  it('scopes the query to the given emails', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const db = { invitationToken: { findMany } } as unknown as ExtendedPrismaClient
    await readInvitations(db, ['a@b.lv', 'c@d.lv'])
    expect(findMany).toHaveBeenCalledWith({
      where: { email: { in: ['a@b.lv', 'c@d.lv'] } },
      orderBy: { createdAt: 'desc' },
    })
  })
})
```

Also add `readInvitations` to the existing import at the top of `lib/invitations.test.ts:1-4`:

```ts
import {
  deriveStatus, hashInviteToken, isEligibleRulesRecipient, newInviteToken,
  readCampaign, readInvitations, resolveInviteLang, INVITE_BATCH_SIZE, type ProInvitation,
} from './invitations'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts lib/invitations.test.ts`
Expected: FAIL — `readInvitations` currently always calls `findMany({ orderBy: { createdAt: 'desc' } })` (no `where` key at all), so both new assertions mismatch.

- [ ] **Step 3: Write minimal implementation**

In `lib/invitations.ts`, replace lines 62-75:

```ts
export async function readInvitations(db: Db, emails?: string[]): Promise<ProInvitation[]> {
  const rows = await db.invitationToken.findMany({
    where: emails ? { email: { in: emails } } : undefined,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    cardNumber: row.cardNumber,
    language: resolveInviteLang(row.language),
    sentAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    status: row.status as ProInvitation['status'],
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts lib/invitations.test.ts`
Expected: PASS (all `describe` blocks in the file, including the two new tests)

- [ ] **Step 5: Commit**

```bash
git add lib/invitations.ts lib/invitations.test.ts
git commit -m "feat(invitations): allow readInvitations to scope by email"
```

---

## Task 2: Server-side search + pagination for `GET /api/admin/invitations`

**Files:**
- Modify: `app/api/admin/invitations/route.ts:1-66` (imports + `GET`, `POST` untouched)
- Test: `app/api/admin/invitations/route.test.ts` (new file)

**Interfaces:**
- Consumes: `readInvitations(db, emails?)` from Task 1.
- Produces: `GET /api/admin/invitations?search=&skip=&take=&sort=&dir=` → `{ total: number, holders: Holder[] }` where `Holder` matches `app/[lang]/admin/invitations/invitation-models.ts:1-10` (unchanged shape, just now a page instead of everything). `sort` accepts `name | email | cardNumber` (anything else, including `status` or missing, falls back to `email asc`). Task 3 calls this shape.

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/invitations/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { userFindManyMock, userCountMock, requireAdminMock, readInvitationsMock, deriveStatusMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  userCountMock: vi.fn(),
  requireAdminMock: vi.fn(),
  readInvitationsMock: vi.fn(),
  deriveStatusMock: vi.fn(),
}))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: userFindManyMock, count: userCountMock } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({ buildInviteEmail: vi.fn(), pickInviteTemplate: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.test') }))
vi.mock('@/lib/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invitations')>()
  return { ...actual, readInvitations: readInvitationsMock, deriveStatus: deriveStatusMock }
})

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/invitations${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
  userFindManyMock.mockResolvedValue([])
  userCountMock.mockResolvedValue(0)
  readInvitationsMock.mockResolvedValue([])
})

describe('GET /api/admin/invitations', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('defaults to a 50-row page ordered by email, with no search filter', async () => {
    await GET(makeGetRequest())
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cardNumber: { not: null } },
        orderBy: { email: 'asc' },
        skip: 0,
        take: 50,
      })
    )
    expect(userCountMock).toHaveBeenCalledWith({ where: { cardNumber: { not: null } } })
  })

  it('applies search across name/email/phone/cardNumber and pagination params', async () => {
    await GET(makeGetRequest('?search=maija&skip=50&take=50&sort=name&dir=desc'))
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cardNumber: { not: null },
          OR: [
            { name: { contains: 'maija', mode: 'insensitive' } },
            { email: { contains: 'maija', mode: 'insensitive' } },
            { phone: { contains: 'maija', mode: 'insensitive' } },
            { cardNumber: { contains: 'maija', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'desc' },
        skip: 50,
        take: 50,
      })
    )
  })

  it('bounds the invitation-token join to the fetched page emails and returns total', async () => {
    userFindManyMock.mockResolvedValue([
      { id: 'u1', name: 'Maija', email: 'Maija@Example.LV', phone: null, cardNumber: '1001' },
    ])
    userCountMock.mockResolvedValue(1)
    readInvitationsMock.mockResolvedValue([])
    deriveStatusMock.mockReturnValue('none')

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(readInvitationsMock).toHaveBeenCalledWith(expect.anything(), ['maija@example.lv'])
    expect(json.total).toBe(1)
    expect(json.holders).toEqual([
      { userId: 'u1', name: 'Maija', email: 'Maija@Example.LV', phone: null, cardNumber: '1001', status: 'none', sentAt: null, inviteUrl: null },
    ])
  })

  it('falls back to email sort for an unknown or status sort key', async () => {
    await GET(makeGetRequest('?sort=status'))
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { email: 'asc' } }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts app/api/admin/invitations/route.test.ts`
Expected: FAIL — current `GET` takes no `NextRequest` argument, never calls `prisma.user.count`, never passes `skip`/`take`/`OR`/dynamic `orderBy`, and calls `readInvitations(prisma)` with no second argument.

- [ ] **Step 3: Write minimal implementation**

In `app/api/admin/invitations/route.ts`, add the import (near the other `@/lib/*` imports at the top):

```ts
import { parseOffsetPagination } from '@/lib/pagination'
```

Replace the `GET` function (lines 27-66) with:

```ts
const HOLDER_SORT_FIELDS = ['name', 'email', 'cardNumber'] as const
type HolderSortField = (typeof HOLDER_SORT_FIELDS)[number]

// GET: держатели карт (постранично) + статусы приглашений
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const sortParam = searchParams.get('sort')
    const sortField: HolderSortField = (HOLDER_SORT_FIELDS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as HolderSortField)
      : 'email'
    const sortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })

    const where: Record<string, unknown> = { cardNumber: { not: null } }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { cardNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const orderBy =
      sortField === 'name' ? { name: sortDir } as const
      : sortField === 'cardNumber' ? { cardNumber: sortDir } as const
      : { email: sortDir } as const

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true, cardNumber: true },
        orderBy,
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ])

    const emails = rows.map((u) => u.email.toLowerCase())
    const invitations = await readInvitations(prisma, emails)
    const byEmail = new Map<string, (typeof invitations)[number]>()
    // readInvitations is newest-first; keep the current invitation on resends.
    for (const invitation of invitations) {
      if (!byEmail.has(invitation.email)) byEmail.set(invitation.email, invitation)
    }

    return NextResponse.json({
      total,
      holders: rows.map((u) => {
        const inv = byEmail.get(u.email.toLowerCase())
        const status = inv ? deriveStatus(inv) : 'none'
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          cardNumber: u.cardNumber,
          status,
          sentAt: inv?.sentAt ?? null,
          // Ссылку показываем только пока инвайт живой — админ может скопировать вручную
          inviteUrl: null,
        }
      }),
    })
  } catch (e) {
    logApiError("[admin/invitations GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

Note: `where` is passed to both `findMany` and `count` by reference — safe here since neither call mutates it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts app/api/admin/invitations/route.test.ts`
Expected: PASS (all 5 tests)

Also run the full unit suite to confirm nothing else broke:

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/invitations/route.ts app/api/admin/invitations/route.test.ts
git commit -m "feat(invitations): paginate and search card holders server-side"
```

---

## Task 3: Wire the invitations page to the paginated endpoint

**Files:**
- Modify: `app/[lang]/admin/invitations/page.tsx` (holders state/fetch block: lines 17-18, 26-29, 47-55, 284-325, 442, 465, 496-503, 524-530, 550, 640-641; see step-by-step below for exact replacements)

**Interfaces:**
- Consumes: `GET /api/admin/invitations?search=&skip=&take=&sort=&dir=` → `{ total, holders }` from Task 2.
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Replace holder state + add debounce**

Replace lines 17-18 and 26-29 in `app/[lang]/admin/invitations/page.tsx`:

```ts
    const [holders, setHolders] = useState<Holder[]>([]);
    const [holdersTotal, setHoldersTotal] = useState(0);
    const [loading, setLoading] = useState(true);
```

```ts
    const [holderSearch, setHolderSearch] = useState('');
    const [debouncedHolderSearch, setDebouncedHolderSearch] = useState('');
    const [holderSort, setHolderSort] = useState<{ key: HolderSortKey; dir: SortDir } | null>(null);
    const [holderPage, setHolderPage] = useState(0);
    const [segment, setSegment] = useState<'withCard' | 'withoutCard'>('withCard');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedHolderSearch(holderSearch.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [holderSearch]);
```

- [ ] **Step 2: Replace `loadHolders` to call the server with search/page/sort**

Replace lines 47-55 (`loadHolders`):

```ts
    const holderServerSortField: 'name' | 'email' | 'cardNumber' | null =
        holderSort && holderSort.key !== 'status' ? holderSort.key : null;
    const holderServerSortDir = holderSort?.dir ?? null;

    const loadHolders = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ take: '50', skip: String(holderPage * 50) });
            if (debouncedHolderSearch) params.set('search', debouncedHolderSearch);
            if (holderServerSortField) {
                params.set('sort', holderServerSortField);
                params.set('dir', holderServerSortDir ?? 'asc');
            }
            const res = await fetch(`/api/admin/invitations?${params}`);
            const json = await res.json();
            if (res.ok) {
                setHolders(json.holders ?? []);
                setHoldersTotal(json.total ?? 0);
            }
        } finally {
            setLoading(false);
        }
    }, [debouncedHolderSearch, holderPage, holderServerSortField, holderServerSortDir]);
```

- [ ] **Step 3: Update the load effect**

Replace lines 71-76:

```ts
    useEffect(() => {
        queueMicrotask(() => {
            void loadHolders();
            void loadCampaign();
        });
    }, [loadHolders, loadCampaign]);
```

(unchanged code, listed here only so the diff context is unambiguous — `loadHolders` now carries the new dependency array from Step 2, so this effect already refires correctly on search/page/sort changes without further edits.)

- [ ] **Step 4: Collapse local filtering/pagination down to the current server page**

Replace lines 284-325 (`normalizedSearch` through `allPageHoldersSelected`):

```ts
    const displayedHolders = useMemo(() => {
        if (!holderSort || holderSort.key !== 'status') return holders;
        const mul = holderSort.dir === 'asc' ? 1 : -1;
        return [...holders].sort((a, b) => (HOLDER_STATUS_RANK[a.status] - HOLDER_STATUS_RANK[b.status]) * mul);
    }, [holders, holderSort]);
```

```ts
    const pageSelectableHolderIds = displayedHolders.filter((h) => h.status !== 'accepted').map((h) => h.userId);
    const allPageHoldersSelected = pageSelectableHolderIds.length > 0 && pageSelectableHolderIds.every((id) => selectedIds.has(id));
```

- [ ] **Step 5: Update the sort-toggle handler to reset the page**

Line 309-316 (`toggleHolderSort`) is unchanged in behavior but now also drives a server refetch through `loadHolders`'s dependency array for the 3 server-sortable keys — no edit needed here, it already calls `setHolderPage(0)` before updating `holderSort`.

- [ ] **Step 6: Replace the holders pager block**

Replace lines 318-323 (`holderPageCount` through `pagedHolders`):

```ts
    const holderPageCount = Math.max(1, Math.ceil(holdersTotal / PAGE_SIZE));
    const effectiveHolderPage = Math.min(holderPage, holderPageCount - 1);
```

- [ ] **Step 7: Update the badges and rendering to use `holdersTotal` / `displayedHolders`**

Line 442, inside the segment toggle button — replace `{holders.length}` with `{holdersTotal.toLocaleString('ru-RU')}`:

```tsx
                        {l('С картой', 'With a card', 'Ar karti')}{' '}
                        <span className="text-muted-foreground font-normal">{holdersTotal.toLocaleString('ru-RU')}</span>
```

Line 464-466, section header — search no longer needs a separate "N found / M total" split since filtering is server-side now (there is only one relevant total: what currently matches):

```tsx
                            <span className="text-muted-foreground font-normal text-base">
                                {holdersTotal.toLocaleString('ru-RU')}
                            </span>
```

Line 497 (`holders.length > 0` guard before the search `<Input>`) — replace with `holdersTotal > 0`.

Line 507 (`holders.length === 0`) — replace with `holdersTotal === 0`.

Line 515 (`filteredHolders.length === 0`) — replace with `displayedHolders.length === 0`.

Line 526 (`Checkbox checked={allPageHoldersSelected}`) — unchanged, already reads the Step 4 variables.

Line 550 (`{pagedHolders.map((h) => (`) — replace with `{displayedHolders.map((h) => (`.

Lines 640-641 (pager call) — replace with:

```tsx
                    {!loading && holdersTotal > PAGE_SIZE &&
                        renderPager(effectiveHolderPage, holderPageCount, holdersTotal, setHolderPage)}
```

- [ ] **Step 8: Start the dev server and verify manually**

Run: `npm run dev`

In a browser, open `/ru/admin/invitations` as an admin:
1. Confirm the "С картой" tab badge shows the real total (should read the same number as before this change — e.g. ~10,700+, not 50).
2. Type a name/email/card-number fragment into the search box; confirm the table updates (after the 300ms debounce) to only matching rows, and the header count updates to the matched total.
3. Click the "Карта" and "Имя"/"Email" column headers; confirm the network tab shows a new `GET /api/admin/invitations?...sort=...` request per click, and the table re-renders sorted.
4. Click "Статус" column header; confirm the currently-visible page re-sorts instantly with **no** network request (open DevTools Network tab and verify no new request fires).
5. Use "Далее"/"Назад" pager buttons; confirm the page changes and the row count stays ≤ 50.
6. Check a couple of checkboxes, click "Отправить выбранным"; confirm it still only affects the checked rows (no behavior change from before).
7. Open the Network tab, click "Пригласить" on a single row; confirm the follow-up `GET /api/admin/invitations` request now carries `skip`/`take` query params (i.e., it's requesting one page, not the full list).

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `app/[lang]/admin/invitations/page.tsx`

Run: `npx eslint "app/[lang]/admin/invitations/page.tsx"`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add "app/[lang]/admin/invitations/page.tsx"
git commit -m "feat(invitations): drive the card-holders table from the paginated API"
```

---

## Self-Review Notes

- **Spec coverage:** the only "spec" here is the conversation-derived goal (stop loading ~10.7k rows per visit/per action) — Task 2 delivers the server contract, Task 3 wires the UI to it, Task 1 is the shared prerequisite both depend on. No gaps.
- **Selection semantics:** verified in Task planning (not just assumed) that "select all" already only ever covers the current page (`app/[lang]/admin/invitations/page.tsx:324-325` before this plan) — confirmed by reading the code, not guessed. Nothing in this plan changes that.
- **Bonus side-effect (documented, not hidden):** every single-row action (`Пригласить`, WhatsApp, card assignment) calls `loadHolders()` on completion. Before this plan, that refetched the *entire* unbounded list every time; after Task 2+3, it refetches just the current 50-row page — an incidental additional win from the same root-cause fix, not a separate task.
- **Type consistency:** `Holder` type (`app/[lang]/admin/invitations/invitation-models.ts:1-10`) is unchanged; `HolderSortKey`/`SortDir` are unchanged; the new `holdersTotal` name is used consistently across Task 3's steps.
