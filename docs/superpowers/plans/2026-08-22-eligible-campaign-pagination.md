# Eligible-Campaign (Segment B) Server-Side Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `GET /api/admin/card-rules-campaign` from loading every card-less `User` row (currently ~38,135 — larger than segment A's 10,746 before its own fix) on every visit to the "Без карты" tab of `/admin/invitations`, and on every routine action on that tab. Move search + pagination server-side, mirroring the exact pattern already shipped for segment A ("С картой") in `docs/superpowers/plans/2026-08-22-invitations-holders-pagination.md`.

**Architecture:** `GET /api/admin/card-rules-campaign` gains `search`/`skip`/`take`/`sort`/`dir` query params (reusing `parseOffsetPagination` from `lib/pagination.ts`, default take 50) and returns `{ state, totalEligible, total, users }` instead of `{ state, totalEligible, users }` with `users` unbounded. `totalEligible` keeps its existing meaning — the TRUE stable count of every card-less eligible user, always computed with the base `ELIGIBLE_WHERE` regardless of search (this endpoint already got this right for its "Получателей" campaign stat; segment A's endpoint originally conflated "stable total" with "current filtered total" and that bug had to be fixed in a review round — this plan avoids repeating it from the start). The new `total` field is the count matching the current search, used for pagination math and the "X found" display. `POST` (the actual cursor-based batch-sending logic, already correctly bounded via `take: CAMPAIGN_BATCH_SIZE` and an `id`-cursor) is untouched — this plan only fixes the GET-for-display path.

Client-side, `app/[lang]/admin/invitations/page.tsx`'s segment B block is rewired the same way segment A was: `loadCampaign` becomes search/page/sort-driven (debounced search, 300ms), `eligibleUsers` holds one server page (≤50 rows) instead of the full list, sorting by `status` (derived from `campaign?.cursor`, not a DB column) stays a client-side re-sort of the current page with no refetch, sorting by `name`/`email` (real columns) triggers a real refetch. Unlike segment A, there is no bulk-select UI on this tab (sending happens only via the cursor-driven "Начать рассылку" button, which POSTs and updates `campaign` state directly — untouched by this plan) — so there is no selection-semantics risk to protect here at all, which makes this a strictly simpler task than segment A's Task 3 was.

This plan bakes in, from the start, the two fixes segment A's plan needed a review round to discover: (1) the search input and the empty-state message must not be gated on a count that can legitimately hit zero (a zero-match search must stay recoverable, with a message that says "no matches" rather than "nothing exists"), and (2) `loading` must not unmount the table/pager on every refetch — only on the genuine first cold load; subsequent refetches dim the still-mounted table via opacity + `aria-busy`. Task 2 also fixes a latent coupling bug: the single `useEffect` that currently fires both `loadHolders()` and `loadCampaign()` together on any dependency change means every segment-A search/sort/page action already spuriously refetches segment B's data too (harmless before this plan since segment B's old GET was already a flat fetch of everything, but wasteful; after this plan it would also spuriously reset segment B's page/search-driven fetch state). This plan splits that into two independent effects, one per loader.

**Tech Stack:** Next.js route handler (`app/api/admin/card-rules-campaign/route.ts`), Prisma (`prisma.user`), React client state (`app/[lang]/admin/invitations/page.tsx`), Vitest (mocked-Prisma unit tests colocated as `route.test.ts`, same convention as `app/api/admin/invitations/route.test.ts`, `app/api/admin/media/route.test.ts`, `app/api/admin/orders/route.test.ts`).

**Spec:** No separate spec doc — this is a follow-up to the same original feature spec as the invitations-holders plan (`docs/superpowers/specs/2026-07-06-client-card-invitations-design.md`, segment B, "Остальные клиенты"). Design and scope for this specific optimization were worked out in conversation, informed directly by the review history of `docs/superpowers/plans/2026-08-22-invitations-holders-pagination.md` (that plan's final whole-branch review flagged this exact gap as its "obvious follow-up," Out-of-Scope Observation #7 — confirmed via a one-off Prisma count against the Neon dev copy: 38,135 eligible rows).

## Global Constraints

- Do not change `POST /api/admin/card-rules-campaign` (the actual batch-sending logic) — this plan touches `GET` only.
- Do not change `isEligibleRulesRecipient`, `ELIGIBLE_WHERE`, `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_LOCK_MS`, or any cursor/state semantics in `lib/invitations.ts` — untouched by this plan.
- Do not add new dependencies. Reuse `lib/pagination.ts::parseOffsetPagination` (same helper segment A's fix already uses).
- Default page size stays `50` (`INVITATIONS_PAGE_SIZE` from `app/[lang]/admin/invitations/invitation-models.ts`, already imported as `PAGE_SIZE` in `page.tsx`, unchanged).
- `totalEligible` must remain the TRUE unconditional count (unaffected by search) everywhere it's already used today: the segment-toggle badge ("Без карты N") and the "Получателей" campaign stat. Do not let the new filtered `total` leak into either of those two places.
- There is no bulk-select UI in segment B (confirmed: no `Checkbox`/`selectedIds` anywhere in the segment-B render block) — do not add one; this plan does not touch sending semantics at all.
- No React Testing Library / component-test convention exists in this repo for admin pages (same as segment A) — the client-side task is verified manually via the dev server plus TypeScript/eslint, not a new test suite.

---

## Task 1: Server-side search + pagination for `GET /api/admin/card-rules-campaign`

**Files:**
- Modify: `app/api/admin/card-rules-campaign/route.ts` (`GET` only — lines 31-51 in the current file; `POST`, `ELIGIBLE_WHERE`, both error classes untouched)
- Test: `app/api/admin/card-rules-campaign/route.test.ts` (new file)

**Interfaces:**
- Consumes: nothing new (uses the existing `ELIGIBLE_WHERE` constant and `readCampaign` already in the file).
- Produces: `GET /api/admin/card-rules-campaign?search=&skip=&take=&sort=&dir=` → `{ state: CampaignState, totalEligible: number, total: number, users: EligibleUser[] }` where `EligibleUser` matches `app/[lang]/admin/invitations/invitation-models.ts:21` (`{ id: string; name: string | null; email: string }`, unchanged shape — just a page instead of everything). `sort` accepts `name | email`; anything else (including missing) falls back to the existing default `orderBy: { id: 'asc' }`. Task 2 calls this shape.

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/card-rules-campaign/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { userFindManyMock, userCountMock, requireAdminMock, readCampaignMock } = vi.hoisted(() => ({
  userFindManyMock: vi.fn(),
  userCountMock: vi.fn(),
  requireAdminMock: vi.fn(),
  readCampaignMock: vi.fn(),
}))

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: userFindManyMock, count: userCountMock } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
vi.mock('@/lib/invitation-emails', () => ({ buildRulesEmail: vi.fn() }))
vi.mock('@/lib/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invitations')>()
  return { ...actual, readCampaign: readCampaignMock }
})

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const DEFAULT_STATE = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
const ELIGIBLE_WHERE = {
  cardNumber: null,
  platformRole: { not: 'admin' },
  email: { contains: '@', not: { endsWith: '@client.local' } },
}

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/card-rules-campaign${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN_USER)
  userFindManyMock.mockResolvedValue([])
  userCountMock.mockResolvedValue(0)
  readCampaignMock.mockResolvedValue(DEFAULT_STATE)
})

describe('GET /api/admin/card-rules-campaign', () => {
  it('rejects non-admins', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('defaults to a 50-row page ordered by id asc, with no search filter', async () => {
    await GET(makeGetRequest())
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: ELIGIBLE_WHERE,
        orderBy: { id: 'asc' },
        skip: 0,
        take: 50,
      })
    )
    expect(userCountMock).toHaveBeenNthCalledWith(1, { where: ELIGIBLE_WHERE })
  })

  it('applies search across name/email and pagination/sort params, keeping totalEligible unfiltered', async () => {
    await GET(makeGetRequest('?search=anna&skip=50&take=50&sort=name&dir=desc'))
    const expectedFilteredWhere = {
      ...ELIGIBLE_WHERE,
      OR: [
        { name: { contains: 'anna', mode: 'insensitive' } },
        { email: { contains: 'anna', mode: 'insensitive' } },
      ],
    }
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedFilteredWhere,
        orderBy: { name: 'desc' },
        skip: 50,
        take: 50,
      })
    )
    // First count call is always the unfiltered totalEligible; second is the filtered total.
    expect(userCountMock).toHaveBeenNthCalledWith(1, { where: ELIGIBLE_WHERE })
    expect(userCountMock).toHaveBeenNthCalledWith(2, { where: expectedFilteredWhere })
  })

  it('returns state, the unfiltered totalEligible, the filtered total, and the page of users', async () => {
    readCampaignMock.mockResolvedValue({ ...DEFAULT_STATE, sentCount: 3 })
    userCountMock.mockResolvedValueOnce(38135).mockResolvedValueOnce(2)
    userFindManyMock.mockResolvedValue([
      { id: 'u1', name: 'Anna', email: 'anna@example.lv' },
      { id: 'u2', name: null, email: 'anna2@example.lv' },
    ])

    const res = await GET(makeGetRequest('?search=anna'))
    const json = await res.json()

    expect(json.state.sentCount).toBe(3)
    expect(json.totalEligible).toBe(38135)
    expect(json.total).toBe(2)
    expect(json.users).toEqual([
      { id: 'u1', name: 'Anna', email: 'anna@example.lv' },
      { id: 'u2', name: null, email: 'anna2@example.lv' },
    ])
  })

  it('falls back to id-asc order for an unknown sort key', async () => {
    await GET(makeGetRequest('?sort=bogus'))
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'asc' } }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts app/api/admin/card-rules-campaign/route.test.ts`
Expected: FAIL — current `GET` takes no arguments, never calls `prisma.user.count` more than once, never applies a search `where`, and always returns the full unbounded `users` array with no `total` field.

- [ ] **Step 3: Write minimal implementation**

In `app/api/admin/card-rules-campaign/route.ts`, add the import (near the other `@/lib/*` imports at the top):

```ts
import { parseOffsetPagination } from '@/lib/pagination'
```

Replace the `GET` function (current lines 31-51) with:

```ts
const ELIGIBLE_SORT_FIELDS = ['name', 'email'] as const
type EligibleSortField = (typeof ELIGIBLE_SORT_FIELDS)[number]

export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const sortParam = searchParams.get('sort')
    const sortField: EligibleSortField | null = (ELIGIBLE_SORT_FIELDS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as EligibleSortField)
      : null
    const sortDir = searchParams.get('dir') === 'desc' ? 'desc' : 'asc'
    const { skip, take } = parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 100 })

    const where: Record<string, unknown> = search
      ? {
          ...ELIGIBLE_WHERE,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : ELIGIBLE_WHERE

    const orderBy =
      sortField === 'name' ? { name: sortDir } as const
      : sortField === 'email' ? { email: sortDir } as const
      : { id: 'asc' as const }

    const [state, totalEligible, total, users] = await Promise.all([
      readCampaign(prisma),
      prisma.user.count({ where: ELIGIBLE_WHERE }),
      prisma.user.count({ where }),
      // id asc (default) — тот же порядок, в котором курсор кампании проходит получателей
      // (см. POST ниже), иначе sent-статус по курсору будет врать при дефолтной сортировке
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true },
        orderBy,
        skip,
        take,
      }),
    ])
    return NextResponse.json({ state, totalEligible, total, users })
  } catch (e) {
    logApiError("[card-rules-campaign GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

Note: when `search` is empty, `where` is the exact same object reference as `ELIGIBLE_WHERE`, so the two `count` calls redundantly run the identical query twice — accepted (matches the review-tested precedent from segment A's Task 2, which also always ran a count regardless of filter state; the redundant count is cheap and keeping the code path uniform is worth more than micro-optimizing away one indexed count query).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts app/api/admin/card-rules-campaign/route.test.ts`
Expected: PASS (all 5 tests)

Also run the full unit suite to confirm nothing else broke:

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/card-rules-campaign/route.ts app/api/admin/card-rules-campaign/route.test.ts
git commit -m "feat(card-rules-campaign): paginate and search eligible users server-side"
```

---

## Task 2: Wire segment B to the paginated endpoint (and decouple it from segment A's fetch effect)

**Files:**
- Modify: `app/[lang]/admin/invitations/page.tsx` (state block: current lines 44-53, 80-99; segment-B `useMemo`/handlers: current lines 339-373; segment-B JSX: current lines 663-732 — see step-by-step below for exact replacements against the file as it stands today, post segment-A fix)

**Interfaces:**
- Consumes: `GET /api/admin/card-rules-campaign?search=&skip=&take=&sort=&dir=` → `{ state, totalEligible, total, users }` from Task 1.
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Add debounced search + filtered-total state, and split the load effect**

Replace the segment-B state block (current lines 44-53):

```ts
    // Кампания сегмента B
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [totalEligible, setTotalEligible] = useState(0);
    const [eligibleFilteredTotal, setEligibleFilteredTotal] = useState(0);
    const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
    const [eligibleLoading, setEligibleLoading] = useState(true);
    const [eligibleSearch, setEligibleSearch] = useState('');
    const [debouncedEligibleSearch, setDebouncedEligibleSearch] = useState('');
    const [eligibleSort, setEligibleSort] = useState<{ key: EligibleSortKey; dir: SortDir } | null>(null);
    const [eligiblePage, setEligiblePage] = useState(0);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const stopRequested = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedEligibleSearch(eligibleSearch.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [eligibleSearch]);
```

- [ ] **Step 2: Rewrite `loadCampaign` to call the server with search/page/sort**

Replace `loadCampaign` (current lines 80-92):

```ts
    const eligibleServerSortField: 'name' | 'email' | null =
        eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.key : null;
    const eligibleServerSortDir = eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.dir : null;

    const loadCampaign = useCallback(async () => {
        setEligibleLoading(true);
        try {
            const params = new URLSearchParams({ take: '50', skip: String(eligiblePage * 50) });
            if (debouncedEligibleSearch) params.set('search', debouncedEligibleSearch);
            if (eligibleServerSortField) {
                params.set('sort', eligibleServerSortField);
                params.set('dir', eligibleServerSortDir ?? 'asc');
            }
            const res = await fetch(`/api/admin/card-rules-campaign?${params}`);
            if (res.ok) {
                const json = await res.json();
                setCampaign(json.state);
                setTotalEligible(json.totalEligible ?? 0);
                setEligibleFilteredTotal(json.total ?? 0);
                setEligibleUsers(json.users ?? []);
            }
        } finally {
            setEligibleLoading(false);
        }
    }, [debouncedEligibleSearch, eligiblePage, eligibleServerSortField, eligibleServerSortDir]);
```

- [ ] **Step 3: Split the combined load effect into two independent effects**

Replace the combined effect (current lines 94-99):

```ts
    useEffect(() => {
        queueMicrotask(() => void loadHolders());
    }, [loadHolders]);

    useEffect(() => {
        queueMicrotask(() => void loadCampaign());
    }, [loadCampaign]);
```

This is the fix for the latent coupling bug described in this plan's Architecture section: before this change, both loaders lived in one effect keyed on `[loadHolders, loadCampaign]`, so every segment-A search/sort/page action (which changes `loadHolders`'s identity) also re-ran `loadCampaign()` needlessly, and — as of this task — vice versa. Splitting them means each tab's actions only ever refetch that tab's own data.

- [ ] **Step 4: Collapse local filtering/pagination down to the current server page**

Replace the segment-B derived-state block (current lines 339-373, from `const normalizedEligibleSearch` through `pagedEligible`):

```ts
    const displayedEligible = useMemo(() => {
        if (!eligibleSort || eligibleSort.key !== 'status') return eligibleUsers;
        const mul = eligibleSort.dir === 'asc' ? 1 : -1;
        return [...eligibleUsers].sort((a, b) => (Number(isEligibleSent(a.id)) - Number(isEligibleSent(b.id))) * mul);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eligibleUsers, eligibleSort, campaign?.cursor]);

    const toggleEligibleSort = (key: EligibleSortKey) => {
        setEligiblePage(0);
        setEligibleSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    const eligiblePageCount = Math.max(1, Math.ceil(eligibleFilteredTotal / PAGE_SIZE));
    const effectiveEligiblePage = Math.min(eligiblePage, eligiblePageCount - 1);
```

Note `isEligibleSent` (the line just above this block, current line 337: `const isEligibleSent = (userId: string) => !!campaign?.cursor && userId <= campaign.cursor;`) is unchanged — it's a pure per-row check against `campaign.cursor`, never depended on the full `eligibleUsers` array, so pagination doesn't affect its correctness at all.

- [ ] **Step 5: Update the JSX — badge, search input, loading/empty/table, pager**

Segment-toggle badge (current lines 451-452, inside the "Без карты" button) is **already correct and needs no change** — it already reads `{totalEligible.toLocaleString('ru-RU')}`, the stable unfiltered total. Confirm this after your edits above still compiles unchanged; do not touch it.

Section header (current lines 668-672):

```tsx
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Клиенты без карты', 'Clients without a card', 'Klienti bez kartes')}{' '}
                            <span className="text-muted-foreground font-normal text-base">
                                {debouncedEligibleSearch
                                    ? `${eligibleFilteredTotal.toLocaleString('ru-RU')} / ${totalEligible.toLocaleString('ru-RU')}`
                                    : totalEligible.toLocaleString('ru-RU')}
                            </span>
                        </h2>
```

Search input (current lines 675-682) — remove the `!eligibleLoading && eligibleUsers.length > 0 &&` wrapper so it always renders:

```tsx
                    <Input
                        value={eligibleSearch}
                        onChange={(e) => { setEligibleSearch(e.target.value); setEligiblePage(0); }}
                        placeholder={l('Поиск по имени или email…', 'Search by name or email…', 'Meklēt pēc vārda vai e-pasta…')}
                        className="max-w-sm"
                    />
```

Loading / empty / table block (current lines 684-728, from `{eligibleLoading ? (` through the closing `)}` right before the pager) — replace the whole conditional with:

```tsx
                    {eligibleLoading && eligibleUsers.length === 0 ? (
                        <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : eligibleFilteredTotal === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {debouncedEligibleSearch
                                ? l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')
                                : l('Нет клиентов без карты.', 'No clients without a card.', 'Nav klientu bez kartes.')}
                        </div>
                    ) : (
                        <div className={`overflow-y-auto max-h-[60vh] rounded-md border border-border transition-opacity ${eligibleLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`} aria-busy={eligibleLoading}>
                            <table className="w-full table-fixed text-sm">
```

The `<table className="w-full table-fixed text-sm">` line and everything after it (thead, tbody, the row map, closing `</table>`) stays exactly as-is — only the wrapping `<div className="overflow-y-auto ...">` tag's className changes (adding `transition-opacity`/conditional `opacity-60 pointer-events-none`) and gains `aria-busy={eligibleLoading}`. This removes the old separate `filteredEligible.length === 0` branch entirely — with `eligibleFilteredTotal === 0` already covering "nothing matches" (it comes from the server's filtered count, which is exactly what `eligibleUsers` reflects), that third branch would be dead code, same reasoning as segment A's equivalent fix.

Table row map (current line 711): `{pagedEligible.map((u) => {` becomes `{displayedEligible.map((u) => {`.

Pager (current lines 730-731) — remove `!eligibleLoading &&`:

```tsx
                    {eligibleFilteredTotal > PAGE_SIZE &&
                        renderPager(effectiveEligiblePage, eligiblePageCount, eligibleFilteredTotal, setEligiblePage)}
```

"Получателей" campaign stat (current line 747) is **already correct and needs no change** — it already reads `{totalEligible.toLocaleString('ru-RU')}`. Confirm it still compiles; do not touch it.

- [ ] **Step 6: Start the dev server and verify manually**

Run: `npm run dev`

In a browser, open `/ru/admin/invitations`, click the "Без карты" tab, as an admin:
1. Confirm the tab badge and the "Получателей" stat both show the real total (~38,000+) and never change while typing in the search box.
2. Type a name/email fragment into the search box; confirm the table updates (after the 300ms debounce) to matching rows, and the section-header count updates to `X / totalEligible`.
3. Search for something with zero matches; confirm the search box stays visible and editable, and the message says "no matches" (not "no clients without a card").
4. Clear the search; confirm the full list view (paginated) comes back and the search box never disappeared.
5. Click the "Имя"/"Email" column headers; confirm the network tab shows a new `GET /api/admin/card-rules-campaign?...sort=...` request per click, table re-sorts.
6. Click "Статус"; confirm the currently-visible page re-sorts instantly with **no** network request.
7. Use "Далее"/"Назад"; confirm the pager stays visible throughout (does not disappear) and the table dims briefly rather than being replaced by a loading line.
8. While on the "С картой" tab, perform a holder search/sort/page action; open the Network tab and confirm this does **not** also fire a `GET /api/admin/card-rules-campaign` request (Step 3's effect split). Conversely, while on "Без карты", perform an eligible search/sort/page action and confirm it does **not** fire a `GET /api/admin/invitations` request.
9. Click "Начать рассылку" briefly (or just confirm the button renders and is wired — do not necessarily let a real campaign batch send during manual testing unless you can safely stop it) and confirm the campaign stats box still updates from the POST response as before, independent of the paginated list underneath it.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `app/[lang]/admin/invitations/page.tsx`

Run: `npx eslint "app/[lang]/admin/invitations/page.tsx"`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add "app/[lang]/admin/invitations/page.tsx"
git commit -m "feat(invitations): drive the eligible-clients table from the paginated API"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 delivers the server contract (mirroring the already-reviewed segment-A pattern exactly), Task 2 wires the UI to it and fixes the two render-logic mistakes segment A's plan only caught in review, plus a coupling bug that only became live once both loaders are dependency-driven. No gaps.
- **No selection-semantics risk:** verified (not assumed) that segment B has no bulk-select UI at all — grepped the current file for `Checkbox`/`selectedIds`/`toggleSelectMany` within the segment-B JSX range and found none; `runCampaign`/`resetCampaign` are POST-driven and untouched by this plan.
- **`isEligibleSent` correctness under pagination:** verified it's a pure per-row function of `campaign.cursor`, never reads the full `eligibleUsers` array — so paginating that array cannot change any individual row's computed status.
- **Learned from segment A's review history:** the final whole-branch review on the segment-A plan found 2 Important bugs (zero-match search dead end, table/pager unmounting on every refetch) that both trace to that plan's own Step 2/Step 7 code. This plan's Task 2 Steps 1-5 write the *already-fixed* shape of that pattern directly (unconditional search input, `loading && length === 0` cold-load gate, dimmed-not-unmounted table, un-gated pager, message branching on active search) rather than repeating the mistake and relying on another review round to catch it.
- **Type consistency:** `EligibleUser`/`EligibleSortKey` (`app/[lang]/admin/invitations/invitation-models.ts:21-22`) are unchanged; the new `eligibleFilteredTotal`/`debouncedEligibleSearch` names are used consistently across all of Task 2's steps; `totalEligible` keeps its pre-existing meaning everywhere it already appears.
