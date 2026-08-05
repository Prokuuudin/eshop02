# Admin Content Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the dead 3/4 of the banner/content-block/showcase admin surface, and wire delivery/payment copy, the header logo, and store name/hours/phone into the existing `lib/content-registry.ts` + `useSiteContent()` override mechanism so `/admin/content` can actually change them.

**Architecture:** No new mechanism. Everything reuses the Neon-KV-backed override system that already powers the 7 registry sections shipped 2026-07-14: text overrides resolve through `t()` (`translations[lang][key]` as base, `useSiteContent()` override on top), image overrides resolve through `resolveImageSrc()`. New content becomes editable by (a) existing as a `t()`-driven string or `resolveImageSrc()`-driven `src`, and (b) being listed in `lib/content-registry.ts`. Dead admin surface (unused banner types, content-blocks, Showcases) is deleted outright — confirmed zero live rows in Neon (`Banner` table has 1 row, type `sale`; `ContentBlock` table has 0 rows) and zero test coverage referencing any of it.

**Tech Stack:** Next.js App Router (`app/[lang]/...`), React 19 client components for admin forms, Prisma/Neon for `Banner`/existing KV stores, Vitest for `content-registry.test.ts`.

## Global Constraints

- No Prisma schema changes, no new migrations. The `ContentBlock` Prisma model/table stays declared in `prisma/schema.prisma` untouched — only application code (API routes, admin UI, the `lib/banners-server-store.ts` read/write layer) stops using it. (See `feedback_no_schema_changes` memory: don't touch the live Neon schema.)
- `data/stores.ts` `address`, `city`, and `geo` fields are NOT touched — they stay hardcoded Latvian constants per the standing "addresses always Latvian" requirement. Only `name`, `hours`, `phone` move to translations.
- `COMPANY` legal/bank fields are NOT touched, except the one-line `officeAddress` postal-code fix in Task 5 (adds the missing `LV-1073`, doesn't change street/city).
- Every new translation key must exist in `ru`, `en`, and `lv` — `lib/content-registry.test.ts` asserts this automatically for anything added to `CONTENT_REGISTRY`; treat a failing run of that test as a blocking error, not a warning.
- Follow existing code conventions: flat `Record<string, string>` translation dicts in `data/translations/{lang}/common.ts`, dot-namespaced keys, `'use client'` only where a file is a genuine client boundary (most edited files already are).

---

## Part A — Remove dead CMS surface

### Task 1: Delete dead DeliveryInfo/PaymentInfo components

**Files:**
- Delete: `components/DeliveryInfo.tsx`
- Delete: `components/PaymentInfo.tsx`

**Interfaces:** None — these components are not imported anywhere (verified via repo-wide grep for `DeliveryInfo`/`PaymentInfo` — zero matches outside the two files themselves).

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "DeliveryInfo\|PaymentInfo" --include="*.tsx" --include="*.ts" .` (excluding the two files themselves and this plan/spec)
Expected: no import sites found (only the component definitions and this plan document).

- [ ] **Step 2: Delete both files**

```bash
git rm components/DeliveryInfo.tsx components/PaymentInfo.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (these files had no consumers, so removing them can't break anything that compiled before).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: delete dead DeliveryInfo/PaymentInfo components

Never imported anywhere — the live /delivery and /payment routes
render their own inline copy in app/[lang]/delivery-payment/page.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Narrow banner types to `sale` only

**Files:**
- Modify: `app/[lang]/admin/content/banners/banner-model.ts`
- Modify: `lib/banners-server-store.ts`
- Modify: `app/[lang]/admin/content/banners/BannersTab.tsx`
- Modify: `app/api/admin/banners/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BannerType` narrows from `'hero' | 'promo' | 'sale' | 'info'` to `'sale'` everywhere it's declared. Any later task that touches banners must use only `'sale'`.

Live Neon data check (already run, not part of this task): `Banner` table has exactly one row, `type: 'sale'`. `ContentBlock` table has 0 rows. Narrowing/removing is safe — nothing gets orphaned.

- [ ] **Step 1: Narrow the type in both model files**

In `app/[lang]/admin/content/banners/banner-model.ts`, change:

```ts
export type BannerType = 'hero' | 'promo' | 'sale' | 'info'
```
to:
```ts
export type BannerType = 'sale'
```

and change:
```ts
export const EMPTY_BANNER: BannerForm = {
  type: 'promo', title: '', subtitle: '', image: '', link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark', active: true,
}
```
to:
```ts
export const EMPTY_BANNER: BannerForm = {
  type: 'sale', title: '', subtitle: '', image: '', link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#ffffff', textColor: 'dark', active: true,
}
```

and change:
```ts
export const BANNER_TYPE_LABELS: Record<BannerType, string> = {
  hero: 'Главный герой', promo: 'Промо', sale: 'Скидка/Акция', info: 'Информационный',
}
```
to:
```ts
export const BANNER_TYPE_LABELS: Record<BannerType, string> = {
  sale: 'Скидка/Акция',
}
```

In `lib/banners-server-store.ts`, change the same `BannerType` line:
```ts
export type BannerType = 'hero' | 'promo' | 'sale' | 'info'
```
to:
```ts
export type BannerType = 'sale'
```

- [ ] **Step 2: Remove the type `<Select>` from the banner form**

In `app/[lang]/admin/content/banners/BannersTab.tsx`, delete the entire "Тип" field block (the `<div className="space-y-1">...<Select value={bannerForm.type}>...</Select></div>` spanning what is currently lines 69–96, right before the `<LocaleTextField label="Заголовок...`). The form no longer offers a type choice — there's only one type, so nothing to pick. Also delete the now-unused `BannerType` import from the `banner-model` import list at the top of the file (keep `BANNER_TYPE_LABELS`, `CTA_STYLE_LABELS`, `toLocaleForm`, `CtaStyle`, `TextColor`).

The banner list further down still shows `{BANNER_TYPE_LABELS[banner.type]}` as a badge — leave that as-is, it now always renders "Скидка/Акция", which is accurate and harmless.

- [ ] **Step 3: Default new banners to `type: 'sale'` server-side**

In `app/api/admin/banners/route.ts`, in the `POST` handler, change:
```ts
type: item.type ?? 'promo',
```
to:
```ts
type: 'sale',
```
(drop the `item.type ??` — there's only one possible value now, no reason to trust client input for it.)

- [ ] **Step 4: Typecheck and run existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all existing suites still pass (no test references `BannerType`'s removed members).

- [ ] **Step 5: Commit**

```bash
git add app/\[lang\]/admin/content/banners/banner-model.ts lib/banners-server-store.ts app/\[lang\]/admin/content/banners/BannersTab.tsx app/api/admin/banners/route.ts
git commit -m "$(cat <<'EOF'
refactor(admin): narrow banner types to sale-only

hero/promo/info banners never rendered anywhere on the storefront —
only /api/banners?type=sale is ever fetched (SaleSection, Footer).
Confirmed zero non-sale rows in Neon before narrowing. Removes a
type selector that let admins configure something with no visible
effect.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Remove the content-block feature entirely

**Files:**
- Delete: `app/[lang]/admin/content/banners/ContentBlocksTab.tsx`
- Modify: `app/[lang]/admin/content/banners/banner-model.ts`
- Modify: `app/[lang]/admin/content/banners/useBannerContentManager.ts`
- Modify: `app/[lang]/admin/content/banners/page.tsx`
- Modify: `lib/banners-server-store.ts`
- Modify: `app/api/admin/banners/route.ts`
- Modify: `app/api/admin/banners/[id]/route.ts`
- Modify: `app/api/banners/route.ts`

**Interfaces:**
- Consumes: Task 2's narrowed `BannerType` (this task builds on the same files).
- Produces: `BannersData` becomes `{ banners: Banner[] }` (no `blocks` field). `readBannersData`/`writeBannersData` only touch `prisma.banner`. The public `/api/banners` response drops the `blocks` key.

Confirmed via live Neon query: `ContentBlock` table has 0 rows — nothing is lost by cutting this off, and no migration is needed since we're not touching the Prisma schema, just retiring the app-code path that reads/writes it.

- [ ] **Step 1: Strip `ContentBlock`/`BlockType` from the two model files**

In `app/[lang]/admin/content/banners/banner-model.ts`, delete the `BlockType`, `ContentBlock`, `ContentBlockForm`, `EMPTY_BLOCK`, and `BLOCK_TYPE_LABELS` declarations (everything block-related), keeping the banner-related exports (`BannerType`, `Banner`, `TextColor`, `CtaStyle`, `BannerForm`, `EMPTY_BANNER`, `BANNER_TYPE_LABELS`, `CTA_STYLE_LABELS`, `toLocaleForm`).

In `lib/banners-server-store.ts`, delete `BlockType`, `ContentBlock`, `mapDbToBlock`, and rewrite the file's data-access functions to drop blocks:

```ts
export type BannersData = {
  banners: Banner[]
}
```

```ts
export async function readBannersData(): Promise<BannersData> {
  const banners = await prisma.banner.findMany({ orderBy: { order: 'asc' } })
  return { banners: banners.map(mapDbToBanner) }
}

export async function writeBannersData(data: BannersData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const b of data.banners) {
      await tx.banner.upsert({
        where: { id: b.id },
        create: {
          id: b.id, type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
        update: {
          type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
      })
    }
  })
}
```

Also remove the now-unused `ContentBlock as PrismaContentBlock` from the `import type { Banner as PrismaBanner, ContentBlock as PrismaContentBlock } from '@/generated/prisma/client'` line (keep `Banner as PrismaBanner`).

- [ ] **Step 2: Delete `ContentBlocksTab.tsx`**

```bash
git rm app/\[lang\]/admin/content/banners/ContentBlocksTab.tsx
```

- [ ] **Step 3: Strip the blocks branch out of `useBannerContentManager.ts`**

Remove: the `blocks` state (`const [blocks, setBlocks] = React.useState<ContentBlock[]>([])`), block form state (`blockForm`, `editingBlockId`, `showBlockForm`), the `data.blocks` line in `loadData`, and the entire "Block CRUD" section (`onSaveBlock`, `onDeleteBlock`, `onToggleBlock`, `onMoveBlock`, `onEditBlock`, `resetBlockForm`). Update `loadData`'s fetch typing and the final `return` to match:

```ts
const loadData = React.useCallback(async () => {
    try {
      const res = await fetch('/api/admin/banners', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { banners: Banner[] }
      setBanners(data.banners.sort((a, b) => a.order - b.order))
    } catch {
      showMsg('Не удалось загрузить данные.', true)
    } finally {
      setLoading(false)
    }
  }, [])
```

```ts
  return {
    banners, loading, saving, message,
    bannerForm, setBannerForm, editingBannerId, showBannerForm, setShowBannerForm,
    uploadingBannerImage, onBannerImageUpload,
    onSaveBanner, onDeleteBanner, onToggleBanner, onMoveBanner, onEditBanner, resetBannerForm,
  }
```

Update the `EMPTY_BLOCK`/`ContentBlock`/`ContentBlockForm` import at the top of the file — drop them, keep `EMPTY_BANNER, type Banner, type BannerForm`.

- [ ] **Step 4: Drop the blocks tab from the banners page**

In `app/[lang]/admin/content/banners/page.tsx`:
- Remove `import ContentBlocksTab from './ContentBlocksTab'`.
- Change `const { banners, blocks, loading, message } = state;` to `const { banners, loading, message } = state;`.
- Remove the `<TabsTrigger value="blocks">Контентные блоки ({blocks.length})</TabsTrigger>` trigger.
- Remove the `<ContentBlocksTab state={state} />` render line and its preceding comment.
- Since there's now only one tab, simplify `<Tabs defaultValue="banners">...<TabsList>...</TabsList>...<BannersTab state={state} /></Tabs>` — this can stay as a single-tab `Tabs` (harmless), or you can drop the `Tabs`/`TabsList`/`TabsTrigger` wrapper entirely and render `<BannersTab state={state} />` directly with just the existing header. Prefer dropping the tab chrome since a single-tab tab bar is confusing UI — remove the `Tabs`/`TabsList`/`TabsTrigger` import and wrapper, render `<BannersTab state={state} />` directly under the `{loading ? ... : (...)}` block.

- [ ] **Step 5: Drop the `kind: 'block'` branches from the two banner API routes**

In `app/api/admin/banners/route.ts`, the `POST` handler's `if (body.kind === 'banner') { ... } ` / block-fallthrough structure becomes banner-only:

```ts
export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as { item: Partial<Banner> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    const item = body.item
    const maxOrder = data.banners.reduce((m, b) => Math.max(m, b.order), 0)
    const banner: Banner = {
      id: `banner-${Date.now()}`,
      type: 'sale',
      title: item.title ?? '',
      subtitle: item.subtitle ?? '',
      image: item.image ?? '',
      link: item.link ?? '',
      ctaLabel: item.ctaLabel ?? '',
      ctaStyle: item.ctaStyle ?? 'primary',
      bgColor: item.bgColor ?? '#ffffff',
      textColor: item.textColor ?? 'dark',
      active: item.active ?? true,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    }
    data.banners.push(banner)
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json(banner)
  } catch {
    return NextResponse.json({ error: 'failed_to_create' }, { status: 400 })
  }
}
```

Drop the `type Banner, type ContentBlock` import down to `type Banner`.

In `app/api/admin/banners/[id]/route.ts`, the `PUT` and `DELETE` handlers drop their block branches:

```ts
export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const body = (await request.json()) as { item: Partial<Banner> }
    const data = await readBannersData()
    const now = new Date().toISOString()

    const idx = data.banners.findIndex((b) => b.id === id)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    data.banners[idx] = { ...data.banners[idx], ...body.item, id, updatedAt: now }
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json(data.banners[idx])
  } catch {
    return NextResponse.json({ error: 'failed_to_update' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const { id } = await params
    const data = await readBannersData()

    const bannerIdx = data.banners.findIndex((b) => b.id === id)
    if (bannerIdx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    data.banners.splice(bannerIdx, 1)
    await writeBannersData(data)
    revalidatePath('/')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 400 })
  }
}
```

Drop the `type Banner, type ContentBlock` import down to `type Banner`.

- [ ] **Step 6: Drop `blocks` from the public `/api/banners` response**

In `app/api/banners/route.ts`, remove the `blocks: data.blocks.filter(...)...` part of the returned object:

```ts
export async function GET(request: NextRequest): Promise<Response> {
  const type = request.nextUrl.searchParams.get('type')
  const data = await readBannersData()
  return NextResponse.json({
    banners: data.banners
      .filter((b) => b.active && (!type || b.type === type))
      .sort((a, b) => a.order - b.order)
      .map((b) => ({ ...b, link: sanitizeStoredLink(b.link) })),
  })
}
```

- [ ] **Step 7: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all suites pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(admin): remove content-block feature

No storefront code ever fetched or rendered content-blocks — only
/admin/content/banners could create them, into a table that never
had a reader. Confirmed 0 rows in Neon before removal. The
ContentBlock Prisma model/table stays declared in schema.prisma
(no migration) — only the dead application-code path is cut.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remove the Showcases feature

**Files:**
- Delete: `app/[lang]/admin/marketing/showcases/page.tsx`
- Delete: `app/api/admin/showcases/route.ts`
- Delete: `app/api/admin/showcases/[id]/route.ts`
- Delete: `data/showcases.json`
- Modify: `components/admin/AdminHeaderNav.tsx`
- Modify: `components/AppBreadcrumbs.tsx`
- Modify: `data/translations/{ru,en,lv}/admin.ts`
- Modify: `data/translations/{ru,en,lv}/common.ts`

**Interfaces:** None — Showcases writes to `data/showcases.json`, which nothing on the storefront reads (verified: only the admin page and its two API routes reference `showcases` in any `.ts`/`.tsx` file).

- [ ] **Step 1: Delete the feature's own files**

```bash
git rm app/\[lang\]/admin/marketing/showcases/page.tsx
git rm app/api/admin/showcases/route.ts
git rm app/api/admin/showcases/\[id\]/route.ts
git rm data/showcases.json
```

- [ ] **Step 2: Remove the nav entry**

In `components/admin/AdminHeaderNav.tsx`, remove this line from the `marketing` section's `items` array:
```ts
{ title: 'marketing.showcases', href: '/admin/marketing/showcases' },
```
and remove the three inline label lines (one per embedded ru/en/lv label dictionary in the same file):
```ts
'marketing.showcases': 'Подборки и витрины',
```
```ts
'marketing.showcases': 'Showcases and collections',
```
```ts
'marketing.showcases': 'Vitrinas un izlases',
```

- [ ] **Step 3: Remove the breadcrumb mapping**

In `components/AppBreadcrumbs.tsx`, remove:
```ts
showcases: 'breadcrumb.showcases',
```

- [ ] **Step 4: Remove the now-unused translation keys**

Remove `'admin.sidebar.marketing.showcases': '...'` from `data/translations/ru/admin.ts`, `data/translations/en/admin.ts`, `data/translations/lv/admin.ts`.

Remove `'breadcrumb.showcases': '...'` from `data/translations/ru/common.ts`, `data/translations/en/common.ts`, `data/translations/lv/common.ts`.

- [ ] **Step 5: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(admin): remove Showcases feature

Wrote to data/showcases.json; nothing on the storefront ever read
that file. Pure dead admin surface — an admin could curate
"showcases" that had no effect anywhere on the site.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Part B — Delivery/Payment page → registry

### Task 5: Add `deliveryPayment.*` translation keys

**Files:**
- Modify: `data/translations/ru/common.ts`
- Modify: `data/translations/en/common.ts`
- Modify: `data/translations/lv/common.ts`
- Modify: `data/company.ts`

**Interfaces:**
- Produces: ~56 new `deliveryPayment.*` keys (listed below), present in all three language dicts. Task 6 consumes these exact key names.

The existing `deliveryPayment.*` keys (`deliveryPayment.title`, `.deliveryTitle`, `.courier`, `.pickup`, `.regions`, `.paymentTitle`, `.card`, `.cash`, `.online`, `.note`, `.tips.1-3`, and the FAQ-schema-only `.paymentSteps.*`/`.paymentHelp.*`/`.deliverySteps.*`/`.deliveryHelp.*`/`.paymentNote`/`.deliveryNote`) stay untouched — they're used elsewhere (FAQ JSON-LD schema, `deliveryPayment.tips.*` visible on the page). The new keys below are more deeply namespaced (`deliveryPayment.methods.*`, `deliveryPayment.rules.*`, etc.) so there's no collision.

- [ ] **Step 1: Fix `COMPANY.officeAddress` to include the postal code**

In `data/company.ts`, change:
```ts
officeAddress: 'Rencēnu iela 10A, Rīga, Latvija',
```
to:
```ts
officeAddress: 'Rencēnu iela 10A, Rīga, LV-1073, Latvija',
```
(Task 6 replaces two literal `Rencēnu iela 10A, Rīga, LV-1073` occurrences in the delivery-payment page with `{COMPANY.officeAddress}` — without this fix, the displayed text would silently lose its postal code.)

- [ ] **Step 2: Add the new keys to `data/translations/ru/common.ts`**

Add these entries anywhere inside the `ruCommon` object (e.g. right after the existing `deliveryPayment.*` block):

```ts
  'deliveryPayment.methods.title': 'Способы доставки',
  'deliveryPayment.methods.courierLatvia.label': 'Доставка курьером по Латвии',
  'deliveryPayment.methods.courierLatvia.price': 'Стоимость — от 10 €',
  'deliveryPayment.methods.courierLatvia.freeNote': 'При заказе на сумму свыше 200 € доставка по Латвии осуществляется бесплатно.',
  'deliveryPayment.methods.omniva.label': 'Доставка в пакоматы OMNIVA',
  'deliveryPayment.methods.omniva.price': 'Стоимость — от 4 €',
  'deliveryPayment.methods.omniva.maxSize': 'Максимальный размер посылки: 38 × 64 × 19 см',
  'deliveryPayment.methods.omniva.weight': 'Вес — до 30 кг',
  'deliveryPayment.methods.pickup.label': 'Самовывоз из магазинов — бесплатно',
  'deliveryPayment.methods.pickup.intro': 'Оплаченный заказ можно получить в одном из наших магазинов:',
  'deliveryPayment.rules.title': 'Правила курьерской доставки',
  'deliveryPayment.rules.item1': 'Курьер ожидает получение заказа не более 10 минут.',
  'deliveryPayment.rules.item2': 'При получении необходимо указать имя, фамилию и поставить подпись в накладной.',
  'deliveryPayment.rules.item3': 'Заказ считается доставленным после подписания документов получателем или его представителем.',
  'deliveryPayment.rules.item4': 'При получении обязательно проверьте упаковку в присутствии курьера. Если упаковка повреждена, это необходимо зафиксировать в накладной.',
  'deliveryPayment.rules.item5': 'Если получатель отсутствует по указанному адресу или отказывается принимать заказ, повторная доставка или переадресация оплачивается отдельно.',
  'deliveryPayment.rules.item6': 'Доставка осуществляется по рабочим дням с 8:00 до 17:00.',
  'deliveryPayment.rules.item7': 'Перед доставкой получатель получает SMS с информацией о времени и адресе доставки.',
  'deliveryPayment.rules.item8': 'Если необходимо изменить время или адрес доставки, просьба заранее связаться с курьерской службой по номеру, указанному в SMS.',
  'deliveryPayment.rules.item9': 'Если получатель не отвечает на звонок курьера или адрес меняется в день доставки, заказ переносится на следующий рабочий день.',
  'deliveryPayment.rules.item10': 'Стоимость повторной доставки — 5 €.',
  'deliveryPayment.return.title': 'Возврат товара',
  'deliveryPayment.return.intro': 'Вы можете вернуть товар в течение 14 дней с момента получения заказа.',
  'deliveryPayment.return.conditionsTitle': 'Условия возврата:',
  'deliveryPayment.return.condition1': 'товар не был в использовании;',
  'deliveryPayment.return.condition2': 'сохранён товарный вид;',
  'deliveryPayment.return.condition3': 'сохранена оригинальная неповреждённая упаковка.',
  'deliveryPayment.return.refundNote': 'После получения и проверки товара возврат денежных средств будет произведён на ваш банковский счёт.',
  'deliveryPayment.return.exceptionIntro': 'Обратите внимание! Согласно правилам дистанционной торговли, товары не подлежат возврату, если:',
  'deliveryPayment.return.exceptionItem1': 'была вскрыта упаковка товара, который по соображениям гигиены и здоровья не может быть возвращён обратно.',
  'deliveryPayment.contacts.title': 'Вопросы по доставке',
  'deliveryPayment.contacts.intro': 'Свяжитесь с нашей службой поддержки:',
  'deliveryPayment.payment.methods.title': 'Способы оплаты',
  'deliveryPayment.payment.card.label': 'Оплата банковской картой',
  'deliveryPayment.payment.card.note': 'Оплата картой доступна при получении заказа в офисе интернет-магазина:',
  'deliveryPayment.payment.cash.label': 'Оплата наличными',
  'deliveryPayment.payment.cash.note': 'Оплата наличными осуществляется при получении заказа в офисе интернет-магазина:',
  'deliveryPayment.payment.transfer.label': 'Оплата банковским переводом',
  'deliveryPayment.payment.transfer.note1': 'После оформления заказа на вашу электронную почту будет отправлен счёт для оплаты.',
  'deliveryPayment.payment.transfer.note2': 'При оплате банковским переводом обязательно укажите номер заказа в назначении платежа.',
  'deliveryPayment.payment.transfer.requisitesTitle': 'Реквизиты для оплаты',
  'deliveryPayment.payment.leasing.label': 'Оплата через Lateko Līzings',
  'deliveryPayment.payment.leasing.note': 'Также доступна оплата с использованием услуг Lateko Līzings.',
  'deliveryPayment.payment.how.title': 'Как происходит оплата',
  'deliveryPayment.payment.how.step1': 'Оформите заказ на сайте.',
  'deliveryPayment.payment.how.step2': 'Выберите способ и адрес доставки.',
  'deliveryPayment.payment.how.step3': 'Получите счёт на указанную электронную почту.',
  'deliveryPayment.payment.how.step4': 'Оплатите заказ выбранным способом.',
  'deliveryPayment.payment.security.title': 'Безопасность платежей',
  'deliveryPayment.payment.security.intro': 'Все платежи на нашем сайте защищены с помощью современных технологий шифрования (SSL/TLS).',
  'deliveryPayment.payment.security.item1': 'Данные банковских карт не сохраняются и не передаются третьим лицам.',
  'deliveryPayment.payment.security.item2': 'Оплата проходит через сертифицированные платёжные шлюзы.',
  'deliveryPayment.payment.security.item3': 'Мы соблюдаем стандарты безопасности PCI DSS.',
  'deliveryPayment.payment.security.note': 'Если у вас возникли вопросы по безопасности платежей, свяжитесь с нашей службой поддержки.',
  'deliveryPayment.support.title': 'Вопросы по оплате',
  'deliveryPayment.support.intro': 'Наша служба поддержки поможет решить вопросы, связанные с оплатой заказа.',
  'deliveryPayment.support.skypeLabel': 'Skype',
```

- [ ] **Step 3: Add the same keys to `data/translations/en/common.ts`**

```ts
  'deliveryPayment.methods.title': 'Delivery methods',
  'deliveryPayment.methods.courierLatvia.label': 'Courier delivery in Latvia',
  'deliveryPayment.methods.courierLatvia.price': 'Cost — from €10',
  'deliveryPayment.methods.courierLatvia.freeNote': 'For orders over €200, delivery within Latvia is free.',
  'deliveryPayment.methods.omniva.label': 'Delivery to OMNIVA parcel lockers',
  'deliveryPayment.methods.omniva.price': 'Cost — from €4',
  'deliveryPayment.methods.omniva.maxSize': 'Maximum parcel size: 38 × 64 × 19 cm',
  'deliveryPayment.methods.omniva.weight': 'Weight — up to 30 kg',
  'deliveryPayment.methods.pickup.label': 'Pickup from stores — free',
  'deliveryPayment.methods.pickup.intro': 'A paid order can be picked up at one of our stores:',
  'deliveryPayment.rules.title': 'Courier delivery rules',
  'deliveryPayment.rules.item1': 'The courier waits no more than 10 minutes for the order to be received.',
  'deliveryPayment.rules.item2': 'Upon receipt, you must state your first and last name and sign the delivery note.',
  'deliveryPayment.rules.item3': 'The order is considered delivered once the documents are signed by the recipient or their representative.',
  'deliveryPayment.rules.item4': "Please check the packaging in the courier's presence upon receipt. If the packaging is damaged, this must be noted on the delivery note.",
  'deliveryPayment.rules.item5': 'If the recipient is not present at the specified address or refuses to accept the order, redelivery or redirection is charged separately.',
  'deliveryPayment.rules.item6': 'Delivery takes place on business days from 8:00 to 17:00.',
  'deliveryPayment.rules.item7': 'Before delivery, the recipient receives an SMS with the delivery time and address.',
  'deliveryPayment.rules.item8': 'If you need to change the delivery time or address, please contact the courier service in advance using the number provided in the SMS.',
  'deliveryPayment.rules.item9': "If the recipient does not answer the courier's call or the address changes on the delivery day, the order is postponed to the next business day.",
  'deliveryPayment.rules.item10': 'The cost of redelivery is €5.',
  'deliveryPayment.return.title': 'Product returns',
  'deliveryPayment.return.intro': 'You can return a product within 14 days of receiving your order.',
  'deliveryPayment.return.conditionsTitle': 'Return conditions:',
  'deliveryPayment.return.condition1': 'the product has not been used;',
  'deliveryPayment.return.condition2': 'its retail appearance is preserved;',
  'deliveryPayment.return.condition3': 'the original undamaged packaging is preserved.',
  'deliveryPayment.return.refundNote': 'After we receive and inspect the product, the refund will be issued to your bank account.',
  'deliveryPayment.return.exceptionIntro': 'Please note: under distance-trading rules, products are not eligible for return if:',
  'deliveryPayment.return.exceptionItem1': 'the packaging has been opened on a product that, for hygiene and health reasons, cannot be returned.',
  'deliveryPayment.contacts.title': 'Delivery questions',
  'deliveryPayment.contacts.intro': 'Contact our support team:',
  'deliveryPayment.payment.methods.title': 'Payment methods',
  'deliveryPayment.payment.card.label': 'Payment by bank card',
  'deliveryPayment.payment.card.note': 'Card payment is available when receiving your order at our office:',
  'deliveryPayment.payment.cash.label': 'Cash payment',
  'deliveryPayment.payment.cash.note': 'Cash payment is made when receiving your order at our office:',
  'deliveryPayment.payment.transfer.label': 'Payment by bank transfer',
  'deliveryPayment.payment.transfer.note1': 'After placing your order, an invoice will be sent to your email.',
  'deliveryPayment.payment.transfer.note2': 'When paying by bank transfer, be sure to include the order number in the payment reference.',
  'deliveryPayment.payment.transfer.requisitesTitle': 'Payment details',
  'deliveryPayment.payment.leasing.label': 'Payment via Lateko Līzings',
  'deliveryPayment.payment.leasing.note': 'Payment using Lateko Līzings services is also available.',
  'deliveryPayment.payment.how.title': 'How payment works',
  'deliveryPayment.payment.how.step1': 'Place your order on the website.',
  'deliveryPayment.payment.how.step2': 'Choose a delivery method and address.',
  'deliveryPayment.payment.how.step3': 'Receive an invoice at your email address.',
  'deliveryPayment.payment.how.step4': 'Pay for your order using your chosen method.',
  'deliveryPayment.payment.security.title': 'Payment security',
  'deliveryPayment.payment.security.intro': 'All payments on our website are protected using modern encryption technology (SSL/TLS).',
  'deliveryPayment.payment.security.item1': 'Bank card details are not stored or shared with third parties.',
  'deliveryPayment.payment.security.item2': 'Payments are processed through certified payment gateways.',
  'deliveryPayment.payment.security.item3': 'We comply with PCI DSS security standards.',
  'deliveryPayment.payment.security.note': 'If you have any questions about payment security, contact our support team.',
  'deliveryPayment.support.title': 'Payment questions',
  'deliveryPayment.support.intro': 'Our support team is happy to help with any questions about paying for your order.',
  'deliveryPayment.support.skypeLabel': 'Skype',
```

- [ ] **Step 4: Add the same keys to `data/translations/lv/common.ts`**

```ts
  'deliveryPayment.methods.title': 'Piegādes veidi',
  'deliveryPayment.methods.courierLatvia.label': 'Kurjera piegāde Latvijā',
  'deliveryPayment.methods.courierLatvia.price': 'Cena — no 10 €',
  'deliveryPayment.methods.courierLatvia.freeNote': 'Pasūtījumiem virs 200 €, piegāde Latvijā ir bez maksas.',
  'deliveryPayment.methods.omniva.label': 'Piegāde uz OMNIVA pakomātiem',
  'deliveryPayment.methods.omniva.price': 'Cena — no 4 €',
  'deliveryPayment.methods.omniva.maxSize': 'Maksimālais sūtījuma izmērs: 38 × 64 × 19 cm',
  'deliveryPayment.methods.omniva.weight': 'Svars — līdz 30 kg',
  'deliveryPayment.methods.pickup.label': 'Saņemšana veikalos — bez maksas',
  'deliveryPayment.methods.pickup.intro': 'Apmaksātu pasūtījumu var saņemt kādā no mūsu veikaliem:',
  'deliveryPayment.rules.title': 'Kurjera piegādes noteikumi',
  'deliveryPayment.rules.item1': 'Kurjers gaida pasūtījuma saņemšanu ne ilgāk kā 10 minūtes.',
  'deliveryPayment.rules.item2': 'Saņemot, jānorāda vārds, uzvārds un jāparakstās pavadzīmē.',
  'deliveryPayment.rules.item3': 'Pasūtījums tiek uzskatīts par piegādātu pēc dokumentu parakstīšanas no saņēmēja vai tā pārstāvja puses.',
  'deliveryPayment.rules.item4': 'Saņemot, obligāti pārbaudiet iepakojumu kurjera klātbūtnē. Ja iepakojums ir bojāts, tas jāatzīmē pavadzīmē.',
  'deliveryPayment.rules.item5': 'Ja saņēmējs nav sastopams norādītajā adresē vai atsakās pieņemt pasūtījumu, atkārtota piegāde vai adreses maiņa tiek apmaksāta atsevišķi.',
  'deliveryPayment.rules.item6': 'Piegāde notiek darba dienās no plkst. 8:00 līdz 17:00.',
  'deliveryPayment.rules.item7': 'Pirms piegādes saņēmējs saņem SMS ar piegādes laiku un adresi.',
  'deliveryPayment.rules.item8': 'Ja nepieciešams mainīt piegādes laiku vai adresi, lūdzu, sazinieties ar kurjeru dienestu iepriekš pa SMS norādīto numuru.',
  'deliveryPayment.rules.item9': 'Ja saņēmējs neatbild uz kurjera zvanu vai adrese mainās piegādes dienā, pasūtījums tiek pārcelts uz nākamo darba dienu.',
  'deliveryPayment.rules.item10': 'Atkārtotas piegādes maksa — 5 €.',
  'deliveryPayment.return.title': 'Preces atgriešana',
  'deliveryPayment.return.intro': 'Preci var atgriezt 14 dienu laikā no pasūtījuma saņemšanas brīža.',
  'deliveryPayment.return.conditionsTitle': 'Atgriešanas nosacījumi:',
  'deliveryPayment.return.condition1': 'prece nav lietota;',
  'deliveryPayment.return.condition2': 'saglabāts preces izskats;',
  'deliveryPayment.return.condition3': 'saglabāts oriģinālais nebojātais iepakojums.',
  'deliveryPayment.return.refundNote': 'Pēc preces saņemšanas un pārbaudes nauda tiks atgriezta jūsu bankas kontā.',
  'deliveryPayment.return.exceptionIntro': 'Lūdzu, ņemiet vērā! Saskaņā ar distances tirdzniecības noteikumiem, preces nav atgriežamas, ja:',
  'deliveryPayment.return.exceptionItem1': 'atvērts iepakojums precei, kuru higiēnas un veselības apsvērumu dēļ nevar atgriezt atpakaļ.',
  'deliveryPayment.contacts.title': 'Jautājumi par piegādi',
  'deliveryPayment.contacts.intro': 'Sazinieties ar mūsu atbalsta dienestu:',
  'deliveryPayment.payment.methods.title': 'Apmaksas veidi',
  'deliveryPayment.payment.card.label': 'Apmaksa ar bankas karti',
  'deliveryPayment.payment.card.note': 'Apmaksa ar karti ir pieejama, saņemot pasūtījumu mūsu birojā:',
  'deliveryPayment.payment.cash.label': 'Apmaksa skaidrā naudā',
  'deliveryPayment.payment.cash.note': 'Apmaksa skaidrā naudā notiek, saņemot pasūtījumu mūsu birojā:',
  'deliveryPayment.payment.transfer.label': 'Apmaksa ar bankas pārskaitījumu',
  'deliveryPayment.payment.transfer.note1': 'Pēc pasūtījuma noformēšanas uz jūsu e-pastu tiks nosūtīts rēķins apmaksai.',
  'deliveryPayment.payment.transfer.note2': 'Veicot apmaksu ar pārskaitījumu, obligāti norādiet pasūtījuma numuru maksājuma mērķī.',
  'deliveryPayment.payment.transfer.requisitesTitle': 'Rekvizīti apmaksai',
  'deliveryPayment.payment.leasing.label': 'Apmaksa caur Lateko Līzings',
  'deliveryPayment.payment.leasing.note': 'Pieejama arī apmaksa, izmantojot Lateko Līzings pakalpojumus.',
  'deliveryPayment.payment.how.title': 'Kā notiek apmaksa',
  'deliveryPayment.payment.how.step1': 'Noformējiet pasūtījumu mājaslapā.',
  'deliveryPayment.payment.how.step2': 'Izvēlieties piegādes veidu un adresi.',
  'deliveryPayment.payment.how.step3': 'Saņemiet rēķinu uz norādīto e-pastu.',
  'deliveryPayment.payment.how.step4': 'Apmaksājiet pasūtījumu izvēlētajā veidā.',
  'deliveryPayment.payment.security.title': 'Maksājumu drošība',
  'deliveryPayment.payment.security.intro': 'Visi maksājumi mūsu mājaslapā ir aizsargāti ar mūsdienīgām šifrēšanas tehnoloģijām (SSL/TLS).',
  'deliveryPayment.payment.security.item1': 'Bankas karšu dati netiek saglabāti un netiek nodoti trešajām personām.',
  'deliveryPayment.payment.security.item2': 'Apmaksa notiek caur sertificētiem maksājumu vārtejām.',
  'deliveryPayment.payment.security.item3': 'Mēs ievērojam PCI DSS drošības standartus.',
  'deliveryPayment.payment.security.note': 'Ja jums ir jautājumi par maksājumu drošību, sazinieties ar mūsu atbalsta dienestu.',
  'deliveryPayment.support.title': 'Jautājumi par apmaksu',
  'deliveryPayment.support.intro': 'Mūsu atbalsta dienests palīdzēs atrisināt jautājumus, kas saistīti ar pasūtījuma apmaksu.',
  'deliveryPayment.support.skypeLabel': 'Skype',
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (these are plain object literal additions, `Record<string, string>` accepts them).

- [ ] **Step 6: Commit**

```bash
git add data/translations/ru/common.ts data/translations/en/common.ts data/translations/lv/common.ts data/company.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add deliveryPayment.* translation keys

~56 new keys covering every semantic chunk of the delivery/payment
page copy (currently hardcoded Russian JSX) in ru/en/lv. Also fixes
COMPANY.officeAddress to include its postal code, LV-1073, which
Task 6 needs when deduplicating two literal address occurrences.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite `delivery-payment/page.tsx` to use the new keys

**Files:**
- Modify: `app/[lang]/delivery-payment/page.tsx`

**Interfaces:**
- Consumes: all keys from Task 5, `COMPANY.officeAddress` (fixed in Task 5), `stores` from `data/stores.ts` (`id`, `city`, `address` — untouched fields).
- Produces: no change to the file's exported shape (`DeliveryPaymentContent`) or its `params` prop — `/delivery` and `/payment` (via `app/[lang]/delivery/page.tsx` and `app/[lang]/payment/page.tsx`) keep working unmodified.

- [ ] **Step 1: Import `stores`**

Add to the top imports:
```ts
import { stores } from '@/data/stores'
```

- [ ] **Step 2: Replace the delivery-methods accordion content**

Replace the `<AccordionItem value="methods">` block's `<AccordionContent>` (currently lines 88–127) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content leading-6">
                                    <ul className="list-disc space-y-5 pl-5">
                                        <li>
                                            <b>{t('deliveryPayment.methods.courierLatvia.label')}</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>{t('deliveryPayment.methods.courierLatvia.price')}</li>
                                            </ul>
                                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                                {t('deliveryPayment.methods.courierLatvia.freeNote')}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.methods.omniva.label')}</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>{t('deliveryPayment.methods.omniva.price')}</li>
                                                <li>{t('deliveryPayment.methods.omniva.maxSize')}</li>
                                                <li>{t('deliveryPayment.methods.omniva.weight')}</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.methods.pickup.label')}</b>
                                            <div className="delivery-info__shops mt-2 text-sm">
                                                {t('deliveryPayment.methods.pickup.intro')}
                                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                                    {stores.map((store) => (
                                                        <li key={store.id}>{store.city[language]} — {store.address[language]}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </li>
                                    </ul>
                                </AccordionContent>
```

Note the trigger label right above it (currently the literal `Способы доставки`) becomes `{t('deliveryPayment.methods.title')}`.

- [ ] **Step 3: Replace the delivery-rules accordion content**

Replace the `<AccordionItem value="rules">` trigger (`Правила курьерской доставки`) with `{t('deliveryPayment.rules.title')}`, and its `<AccordionContent>` (currently lines 136–176) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="delivery-info__list list-disc space-y-3 pl-5 leading-6">
                                        <li>{t('deliveryPayment.rules.item1')}</li>
                                        <li>{t('deliveryPayment.rules.item2')}</li>
                                        <li>{t('deliveryPayment.rules.item3')}</li>
                                        <li>{t('deliveryPayment.rules.item4')}</li>
                                        <li>{t('deliveryPayment.rules.item5')}</li>
                                        <li>{t('deliveryPayment.rules.item6')}</li>
                                        <li>{t('deliveryPayment.rules.item7')}</li>
                                        <li>{t('deliveryPayment.rules.item8')}</li>
                                        <li>{t('deliveryPayment.rules.item9')}</li>
                                        <li>{t('deliveryPayment.rules.item10')}</li>
                                    </ul>
                                </AccordionContent>
```

- [ ] **Step 4: Replace the return-policy accordion content**

Replace the `<AccordionItem value="return">` trigger (`Возврат товара`) with `{t('deliveryPayment.return.title')}`, and its `<AccordionContent>` (currently lines 185–207) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <p className="mb-4 leading-6">{t('deliveryPayment.return.intro')}</p>
                                    <div className="mb-2 font-medium">{t('deliveryPayment.return.conditionsTitle')}</div>
                                    <ul className="mb-4 list-disc space-y-2 pl-5">
                                        <li>{t('deliveryPayment.return.condition1')}</li>
                                        <li>{t('deliveryPayment.return.condition2')}</li>
                                        <li>{t('deliveryPayment.return.condition3')}</li>
                                    </ul>
                                    <p className="mb-3 leading-6">{t('deliveryPayment.return.refundNote')}</p>
                                    <div className="text-xs leading-5 text-gray-500">
                                        {t('deliveryPayment.return.exceptionIntro')}
                                        <br />• {t('deliveryPayment.return.exceptionItem1')}
                                    </div>
                                </AccordionContent>
```

- [ ] **Step 5: Replace the delivery-contacts accordion content**

Replace the `<AccordionItem value="contacts">` trigger (`Вопросы по доставке`) with `{t('deliveryPayment.contacts.title')}`, and inside its `<AccordionContent>` (currently lines 216–247) replace the intro line and the phone/email labels — keep the phone/skype/email values and `href`s exactly as they are:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3">{t('deliveryPayment.contacts.intro')}</div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            {t('contact.phoneLabel')}:{' '}
                                            <a
                                                href="tel:+37127067730"
                                                className="text-blue-600 hover:underline"
                                            >
                                                +371 27067730
                                            </a>
                                        </li>
                                        <li>
                                            {t('deliveryPayment.support.skypeLabel')}:{' '}
                                            <a
                                                href="skype:ShopForHair?chat"
                                                className="text-blue-600 hover:underline"
                                            >
                                                ShopForHair
                                            </a>
                                        </li>
                                        <li>
                                            {t('contact.emailLabel')}:{' '}
                                            <a
                                                href="mailto:info@hairshop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                info@hairshop.lv
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
```

- [ ] **Step 6: Replace the payment-methods accordion content**

Replace the `<AccordionItem value="methods">` trigger under the payment section (`Способы оплаты`) with `{t('deliveryPayment.payment.methods.title')}`, and its `<AccordionContent>` (currently lines 266–324) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="payment-info__list list-disc space-y-5 pl-5 leading-6">
                                        <li>
                                            <b>{t('deliveryPayment.payment.card.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.card.note')}
                                                <br />
                                                {COMPANY.officeAddress}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.cash.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.cash.note')}
                                                <br />
                                                {COMPANY.officeAddress}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.transfer.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.transfer.note1')}
                                                <br />
                                                {t('deliveryPayment.payment.transfer.note2')}
                                            </div>
                                            <div className="payment-info__bank mt-3 space-y-1 rounded bg-slate-100 p-4 dark:bg-gray-700">
                                                <div className="font-bold">
                                                    {t('deliveryPayment.payment.transfer.requisitesTitle')}
                                                </div>
                                                <div>
                                                    <b>{COMPANY.name}</b>
                                                </div>
                                                <div>{COMPANY.legalAddress}</div>
                                                <div>{t('contact.regNumberLabel')}: {COMPANY.regNumber}</div>
                                                <div>{t('contact.vatLabel')}: {COMPANY.vatNumber}</div>
                                                <div>
                                                    <b>{t('contact.bankLabel')}:</b> {COMPANY.bankName}
                                                </div>
                                                <div>
                                                    <b>{t('contact.bankAccountLabel')}:</b> {COMPANY.bankAccount}
                                                </div>
                                                <div>
                                                    <b>{t('contact.swiftLabel')}:</b> {COMPANY.swift}
                                                </div>
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.leasing.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.leasing.note')}
                                            </div>
                                        </li>
                                    </ul>
                                </AccordionContent>
```

- [ ] **Step 7: Replace the "how payment works" accordion content**

Replace the `<AccordionItem value="how">` trigger (`Как происходит оплата`) with `{t('deliveryPayment.payment.how.title')}`, and its `<AccordionContent>` (currently lines 333–340) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ol className="list-decimal space-y-2 pl-5 leading-6">
                                        <li>{t('deliveryPayment.payment.how.step1')}</li>
                                        <li>{t('deliveryPayment.payment.how.step2')}</li>
                                        <li>{t('deliveryPayment.payment.how.step3')}</li>
                                        <li>{t('deliveryPayment.payment.how.step4')}</li>
                                    </ol>
                                </AccordionContent>
```

- [ ] **Step 8: Replace the payment-security accordion content**

Replace the `<AccordionItem value="security">` trigger (`Безопасность платежей`) with `{t('deliveryPayment.payment.security.title')}`, and its `<AccordionContent>` (currently lines 349–368) with:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-4 leading-6">{t('deliveryPayment.payment.security.intro')}</div>
                                    <ul className="mb-3 list-disc space-y-2 pl-5 leading-6">
                                        <li>{t('deliveryPayment.payment.security.item1')}</li>
                                        <li>{t('deliveryPayment.payment.security.item2')}</li>
                                        <li>{t('deliveryPayment.payment.security.item3')}</li>
                                    </ul>
                                    <div className="text-xs leading-5 text-gray-500">
                                        {t('deliveryPayment.payment.security.note')}
                                    </div>
                                </AccordionContent>
```

- [ ] **Step 9: Replace the payment-support accordion content**

Replace the `<AccordionItem value="support">` trigger (`Вопросы по оплате`) with `{t('deliveryPayment.support.title')}`, and inside its `<AccordionContent>` (currently lines 377–411) replace the intro and labels the same way as Step 5:

```tsx
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3 leading-6">{t('deliveryPayment.support.intro')}</div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            {t('contact.phoneLabel')}:{' '}
                                            <a
                                                href="tel:+37127067730"
                                                className="text-blue-600 hover:underline"
                                            >
                                                +371 27067730
                                            </a>
                                        </li>
                                        <li>
                                            {t('deliveryPayment.support.skypeLabel')}:{' '}
                                            <a
                                                href="skype:ShopForHair?chat"
                                                className="text-blue-600 hover:underline"
                                            >
                                                ShopForHair
                                            </a>
                                        </li>
                                        <li>
                                            {t('contact.emailLabel')}:{' '}
                                            <a
                                                href="mailto:info@hairshop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                info@hairshop.lv
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Visual check on dev server**

Run: `npm run dev`, open `/delivery` and `/payment` (both languages worth spot-checking: default and `/en/delivery`). Confirm the rendered text matches the original Russian copy exactly (word-for-word — this is a pure refactor, not a content change) and that the pickup-store list under "Самовывоз" now lists all 8 stores from `data/stores.ts` instead of the old hardcoded 7.

- [ ] **Step 12: Commit**

```bash
git add app/\[lang\]/delivery-payment/page.tsx
git commit -m "$(cat <<'EOF'
feat(delivery-payment): wire page copy through t()

Replaces ~56 hardcoded Russian strings with deliveryPayment.* keys
(added in the previous commit), so /admin/content can edit them.
Pickup-store list now derives from data/stores.ts instead of a
hand-maintained duplicate (was already 1 store short of the real
8-store list). Office address in the payment section now goes
through COMPANY.officeAddress instead of a literal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Add Delivery/Payment sections to the content registry

**Files:**
- Modify: `lib/content-registry.ts`

**Interfaces:**
- Consumes: every key added in Task 5.
- Produces: two new `ContentSection` entries, ids `delivery` and `payment`, appended to `CONTENT_REGISTRY`.

- [ ] **Step 1: Append the two sections**

Add before the final `]` that closes `CONTENT_REGISTRY`:

```ts
  {
    id: 'delivery',
    title: 'Доставка',
    entries: [
      { type: 'text', key: 'deliveryPayment.methods.title', label: 'Заголовок «Способы доставки»' },
      { type: 'text', key: 'deliveryPayment.methods.courierLatvia.label', label: 'Курьер по Латвии — заголовок' },
      { type: 'text', key: 'deliveryPayment.methods.courierLatvia.price', label: 'Курьер по Латвии — цена' },
      { type: 'text', key: 'deliveryPayment.methods.courierLatvia.freeNote', label: 'Курьер по Латвии — условие бесплатной доставки', multiline: true },
      { type: 'text', key: 'deliveryPayment.methods.omniva.label', label: 'OMNIVA — заголовок' },
      { type: 'text', key: 'deliveryPayment.methods.omniva.price', label: 'OMNIVA — цена' },
      { type: 'text', key: 'deliveryPayment.methods.omniva.maxSize', label: 'OMNIVA — макс. размер' },
      { type: 'text', key: 'deliveryPayment.methods.omniva.weight', label: 'OMNIVA — макс. вес' },
      { type: 'text', key: 'deliveryPayment.methods.pickup.label', label: 'Самовывоз — заголовок' },
      { type: 'text', key: 'deliveryPayment.methods.pickup.intro', label: 'Самовывоз — вводный текст', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.title', label: 'Заголовок «Правила курьерской доставки»' },
      { type: 'text', key: 'deliveryPayment.rules.item1', label: 'Правило 1', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item2', label: 'Правило 2', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item3', label: 'Правило 3', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item4', label: 'Правило 4', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item5', label: 'Правило 5', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item6', label: 'Правило 6', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item7', label: 'Правило 7', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item8', label: 'Правило 8', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item9', label: 'Правило 9', multiline: true },
      { type: 'text', key: 'deliveryPayment.rules.item10', label: 'Правило 10' },
      { type: 'text', key: 'deliveryPayment.return.title', label: 'Заголовок «Возврат товара»' },
      { type: 'text', key: 'deliveryPayment.return.intro', label: 'Возврат — вводный текст', multiline: true },
      { type: 'text', key: 'deliveryPayment.return.conditionsTitle', label: 'Возврат — заголовок условий' },
      { type: 'text', key: 'deliveryPayment.return.condition1', label: 'Условие возврата 1' },
      { type: 'text', key: 'deliveryPayment.return.condition2', label: 'Условие возврата 2' },
      { type: 'text', key: 'deliveryPayment.return.condition3', label: 'Условие возврата 3' },
      { type: 'text', key: 'deliveryPayment.return.refundNote', label: 'Возврат — про возврат средств', multiline: true },
      { type: 'text', key: 'deliveryPayment.return.exceptionIntro', label: 'Возврат — исключения, вводный текст', multiline: true },
      { type: 'text', key: 'deliveryPayment.return.exceptionItem1', label: 'Возврат — исключение 1', multiline: true },
      { type: 'text', key: 'deliveryPayment.contacts.title', label: 'Заголовок «Вопросы по доставке»' },
      { type: 'text', key: 'deliveryPayment.contacts.intro', label: 'Вопросы по доставке — вводный текст' },
    ],
  },
  {
    id: 'payment',
    title: 'Оплата',
    entries: [
      { type: 'text', key: 'deliveryPayment.payment.methods.title', label: 'Заголовок «Способы оплаты»' },
      { type: 'text', key: 'deliveryPayment.payment.card.label', label: 'Оплата картой — заголовок' },
      { type: 'text', key: 'deliveryPayment.payment.card.note', label: 'Оплата картой — пояснение', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.cash.label', label: 'Оплата наличными — заголовок' },
      { type: 'text', key: 'deliveryPayment.payment.cash.note', label: 'Оплата наличными — пояснение', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.transfer.label', label: 'Банковский перевод — заголовок' },
      { type: 'text', key: 'deliveryPayment.payment.transfer.note1', label: 'Банковский перевод — пояснение 1', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.transfer.note2', label: 'Банковский перевод — пояснение 2', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.transfer.requisitesTitle', label: 'Заголовок «Реквизиты для оплаты»' },
      { type: 'text', key: 'deliveryPayment.payment.leasing.label', label: 'Lateko Līzings — заголовок' },
      { type: 'text', key: 'deliveryPayment.payment.leasing.note', label: 'Lateko Līzings — пояснение', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.how.title', label: 'Заголовок «Как происходит оплата»' },
      { type: 'text', key: 'deliveryPayment.payment.how.step1', label: 'Шаг оплаты 1' },
      { type: 'text', key: 'deliveryPayment.payment.how.step2', label: 'Шаг оплаты 2' },
      { type: 'text', key: 'deliveryPayment.payment.how.step3', label: 'Шаг оплаты 3' },
      { type: 'text', key: 'deliveryPayment.payment.how.step4', label: 'Шаг оплаты 4' },
      { type: 'text', key: 'deliveryPayment.payment.security.title', label: 'Заголовок «Безопасность платежей»' },
      { type: 'text', key: 'deliveryPayment.payment.security.intro', label: 'Безопасность — вводный текст', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.security.item1', label: 'Безопасность — пункт 1', multiline: true },
      { type: 'text', key: 'deliveryPayment.payment.security.item2', label: 'Безопасность — пункт 2' },
      { type: 'text', key: 'deliveryPayment.payment.security.item3', label: 'Безопасность — пункт 3' },
      { type: 'text', key: 'deliveryPayment.payment.security.note', label: 'Безопасность — примечание', multiline: true },
      { type: 'text', key: 'deliveryPayment.support.title', label: 'Заголовок «Вопросы по оплате»' },
      { type: 'text', key: 'deliveryPayment.support.intro', label: 'Вопросы по оплате — вводный текст', multiline: true },
      { type: 'text', key: 'deliveryPayment.support.skypeLabel', label: 'Лейбл «Skype»' },
    ],
  },
```

- [ ] **Step 2: Run the registry test**

Run: `npx vitest run lib/content-registry.test.ts`
Expected: 5/5 pass — every key above must resolve in `translations.ru`, `.en`, `.lv` (from Task 5), section ids/keys must be unique.

- [ ] **Step 3: Manual check in admin**

On the dev server, open `/admin/content`, expand "Доставка" and "Оплата", edit one field in each (e.g. `deliveryPayment.rules.item1`), save, then reload `/delivery` and confirm the override shows. Click "Сбросить к базовому" and confirm it reverts.

- [ ] **Step 4: Commit**

```bash
git add lib/content-registry.ts
git commit -m "$(cat <<'EOF'
feat(admin): add Delivery/Payment sections to content registry

/admin/content can now edit every piece of the delivery/payment page
copy wired in the previous two commits.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Part C — Logo → registry

### Task 8: Wire the header logo through `resolveImageSrc` + registry section

**Files:**
- Modify: `components/HeaderLogo.tsx`
- Modify: `lib/content-registry.ts`

**Interfaces:**
- Consumes: `useSiteContent()` from `lib/use-site-content.ts` (existing hook, already used the same way in `components/Brands.tsx`).
- Produces: new registry section `header-logo`.

- [ ] **Step 1: Wire `HeaderLogo.tsx`**

Replace the full file:

```tsx
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';
import { useSiteContent } from '@/lib/use-site-content';

export default function HeaderLogo(): React.ReactElement {
    const { t } = useTranslation();
    const { resolveImageSrc } = useSiteContent();
    return (
        <Link
            href="/"
            className="header__brand relative flex items-center gap-3 w-[120px] min-[400px]:w-[180px]"
            style={{ height: 96, minWidth: 100, minHeight: 72 }}
        >
            <Image
                src={resolveImageSrc('/logo.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 block h-[72px] w-auto origin-left -translate-y-1/2 scale-125 dark:hidden min-[400px]:h-[108px]"
            />
            <Image
                src={resolveImageSrc('/logo-white.svg')}
                alt={t('header.logoAlt')}
                width={204}
                height={108}
                priority
                sizes="204px"
                className="absolute left-0 top-1/2 hidden h-[72px] w-auto origin-left -translate-y-1/2 scale-125 dark:block min-[400px]:h-[108px]"
            />
        </Link>
    );
}
```

(`Header.tsx`, the only importer, is already `'use client'`, so this hook works without adding a directive to this file.)

- [ ] **Step 2: Add the registry section**

Add to `lib/content-registry.ts`, before the closing `]`:

```ts
  {
    id: 'header-logo',
    title: 'Логотип',
    entries: [
      { type: 'image', src: '/logo.svg', label: 'Логотип (светлая тема)' },
      { type: 'image', src: '/logo-white.svg', label: 'Логотип (тёмная тема)' },
    ],
  },
```

- [ ] **Step 3: Run the registry test**

Run: `npx vitest run lib/content-registry.test.ts`
Expected: pass — `/logo.svg` and `/logo-white.svg` must exist under `public/` (they already do, they're the current bundled assets).

- [ ] **Step 4: Manual check**

On the dev server, open `/admin/content`, expand "Логотип", upload a PNG/JPG replacement for one variant, save, and confirm the header logo changes across the site. Try uploading an `.svg` — expect it to be rejected by the existing uploader (XSS policy from the 2026-07-14 uploads work), which is expected, not a bug to fix here.

- [ ] **Step 5: Commit**

```bash
git add components/HeaderLogo.tsx lib/content-registry.ts
git commit -m "$(cat <<'EOF'
feat(admin): make the header logo admin-editable

Wires HeaderLogo.tsx through resolveImageSrc() and adds it to the
content registry, same mechanism as every other registry image.
SVG uploads stay blocked (existing XSS policy) — override must be a
raster replacement.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Part D — Stores → registry (name/hours/phone)

### Task 9: Add `stores.<id>.*` translation keys

**Files:**
- Modify: `data/translations/ru/common.ts`
- Modify: `data/translations/en/common.ts`
- Modify: `data/translations/lv/common.ts`

**Interfaces:**
- Produces: for each of the 8 store ids (`riga-office`, `imanta`, `plavnieki`, `daugavpils`, `liepaja`, `valmiera`, `rezekne`, `jelgava`), 5 keys: `stores.<id>.name`, `.hours1`, `.hours2`, `.hours3`, `.phone`. All values are copied verbatim from the current `data/stores.ts` (no new translation — this is pure relocation), except `phone`, which is language-invariant and gets the same value repeated in all three dicts.

- [ ] **Step 1: Add to `data/translations/ru/common.ts`**

```ts
  'stores.riga-office.name': 'Рига Офис',
  'stores.riga-office.hours1': 'Рабочие дни: с 09:00 до 17:00',
  'stores.riga-office.hours2': 'Суббота: выходной',
  'stores.riga-office.hours3': 'Воскресенье: выходной',
  'stores.riga-office.phone': '+37127067730',
  'stores.imanta.name': 'Рига (Иманта)',
  'stores.imanta.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.imanta.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.imanta.hours3': 'Воскресенье: с 10:00 до 16:00',
  'stores.imanta.phone': '+37122015204',
  'stores.plavnieki.name': 'Рига (Плявниеки)',
  'stores.plavnieki.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.plavnieki.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.plavnieki.hours3': 'Воскресенье: с 10:00 до 16:00',
  'stores.plavnieki.phone': '+37127091811',
  'stores.daugavpils.name': 'Даугавпилс',
  'stores.daugavpils.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.daugavpils.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.daugavpils.hours3': 'Воскресенье: с 10:00 до 16:00',
  'stores.daugavpils.phone': '+37125151630',
  'stores.liepaja.name': 'Лиепая',
  'stores.liepaja.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.liepaja.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.liepaja.hours3': 'Воскресенье: выходной',
  'stores.liepaja.phone': '+37120043999',
  'stores.valmiera.name': 'Валмиера',
  'stores.valmiera.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.valmiera.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.valmiera.hours3': 'Воскресенье: выходной',
  'stores.valmiera.phone': '+37125151629',
  'stores.rezekne.name': 'Резекне',
  'stores.rezekne.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.rezekne.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.rezekne.hours3': 'Воскресенье: с 10:00 до 16:00',
  'stores.rezekne.phone': '+37120125353',
  'stores.jelgava.name': 'Елгава',
  'stores.jelgava.hours1': 'Рабочие дни: с 09:00 до 19:00',
  'stores.jelgava.hours2': 'Суббота: с 10:00 до 16:00',
  'stores.jelgava.hours3': 'Воскресенье: выходной',
  'stores.jelgava.phone': '+37120125353',
```

- [ ] **Step 2: Add to `data/translations/en/common.ts`**

```ts
  'stores.riga-office.name': 'Riga Office',
  'stores.riga-office.hours1': 'Weekdays: 09:00-17:00',
  'stores.riga-office.hours2': 'Saturday: closed',
  'stores.riga-office.hours3': 'Sunday: closed',
  'stores.riga-office.phone': '+37127067730',
  'stores.imanta.name': 'Riga (Imanta)',
  'stores.imanta.hours1': 'Weekdays: 09:00-19:00',
  'stores.imanta.hours2': 'Saturday: 10:00-16:00',
  'stores.imanta.hours3': 'Sunday: 10:00-16:00',
  'stores.imanta.phone': '+37122015204',
  'stores.plavnieki.name': 'Riga (Plavnieki)',
  'stores.plavnieki.hours1': 'Weekdays: 09:00-19:00',
  'stores.plavnieki.hours2': 'Saturday: 10:00-16:00',
  'stores.plavnieki.hours3': 'Sunday: 10:00-16:00',
  'stores.plavnieki.phone': '+37127091811',
  'stores.daugavpils.name': 'Daugavpils',
  'stores.daugavpils.hours1': 'Weekdays: 09:00-19:00',
  'stores.daugavpils.hours2': 'Saturday: 10:00-16:00',
  'stores.daugavpils.hours3': 'Sunday: 10:00-16:00',
  'stores.daugavpils.phone': '+37125151630',
  'stores.liepaja.name': 'Liepaja',
  'stores.liepaja.hours1': 'Weekdays: 09:00-19:00',
  'stores.liepaja.hours2': 'Saturday: 10:00-16:00',
  'stores.liepaja.hours3': 'Sunday: closed',
  'stores.liepaja.phone': '+37120043999',
  'stores.valmiera.name': 'Valmiera',
  'stores.valmiera.hours1': 'Weekdays: 09:00-19:00',
  'stores.valmiera.hours2': 'Saturday: 10:00-16:00',
  'stores.valmiera.hours3': 'Sunday: closed',
  'stores.valmiera.phone': '+37125151629',
  'stores.rezekne.name': 'Rezekne',
  'stores.rezekne.hours1': 'Weekdays: 09:00-19:00',
  'stores.rezekne.hours2': 'Saturday: 10:00-16:00',
  'stores.rezekne.hours3': 'Sunday: 10:00-16:00',
  'stores.rezekne.phone': '+37120125353',
  'stores.jelgava.name': 'Jelgava',
  'stores.jelgava.hours1': 'Weekdays: 09:00-19:00',
  'stores.jelgava.hours2': 'Saturday: 10:00-16:00',
  'stores.jelgava.hours3': 'Sunday: closed',
  'stores.jelgava.phone': '+37120125353',
```

- [ ] **Step 3: Add to `data/translations/lv/common.ts`**

```ts
  'stores.riga-office.name': 'Rīgas birojs',
  'stores.riga-office.hours1': 'Darba dienas: 09:00-17:00',
  'stores.riga-office.hours2': 'Sestdiena: slēgts',
  'stores.riga-office.hours3': 'Svētdiena: slēgts',
  'stores.riga-office.phone': '+37127067730',
  'stores.imanta.name': 'Rīga (Imanta)',
  'stores.imanta.hours1': 'Darba dienas: 09:00-19:00',
  'stores.imanta.hours2': 'Sestdiena: 10:00-16:00',
  'stores.imanta.hours3': 'Svētdiena: 10:00-16:00',
  'stores.imanta.phone': '+37122015204',
  'stores.plavnieki.name': 'Rīga (Pļavnieki)',
  'stores.plavnieki.hours1': 'Darba dienas: 09:00-19:00',
  'stores.plavnieki.hours2': 'Sestdiena: 10:00-16:00',
  'stores.plavnieki.hours3': 'Svētdiena: 10:00-16:00',
  'stores.plavnieki.phone': '+37127091811',
  'stores.daugavpils.name': 'Daugavpils',
  'stores.daugavpils.hours1': 'Darba dienas: 09:00-19:00',
  'stores.daugavpils.hours2': 'Sestdiena: 10:00-16:00',
  'stores.daugavpils.hours3': 'Svētdiena: 10:00-16:00',
  'stores.daugavpils.phone': '+37125151630',
  'stores.liepaja.name': 'Liepāja',
  'stores.liepaja.hours1': 'Darba dienas: 09:00-19:00',
  'stores.liepaja.hours2': 'Sestdiena: 10:00-16:00',
  'stores.liepaja.hours3': 'Svētdiena: slēgts',
  'stores.liepaja.phone': '+37120043999',
  'stores.valmiera.name': 'Valmiera',
  'stores.valmiera.hours1': 'Darba dienas: 09:00-19:00',
  'stores.valmiera.hours2': 'Sestdiena: 10:00-16:00',
  'stores.valmiera.hours3': 'Svētdiena: slēgts',
  'stores.valmiera.phone': '+37125151629',
  'stores.rezekne.name': 'Rēzekne',
  'stores.rezekne.hours1': 'Darba dienas: 09:00-19:00',
  'stores.rezekne.hours2': 'Sestdiena: 10:00-16:00',
  'stores.rezekne.hours3': 'Svētdiena: 10:00-16:00',
  'stores.rezekne.phone': '+37120125353',
  'stores.jelgava.name': 'Jelgava',
  'stores.jelgava.hours1': 'Darba dienas: 09:00-19:00',
  'stores.jelgava.hours2': 'Sestdiena: 10:00-16:00',
  'stores.jelgava.hours3': 'Svētdiena: slēgts',
  'stores.jelgava.phone': '+37120125353',
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add data/translations/ru/common.ts data/translations/en/common.ts data/translations/lv/common.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add stores.<id>.* translation keys

Relocates name/hours/phone for all 8 stores from data/stores.ts into
translations, verbatim — no wording changes. Task 10 removes the
fields from data/stores.ts once every reader is switched over
(Task 11).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Trim `data/stores.ts`

**Files:**
- Modify: `data/stores.ts`

**Interfaces:**
- Produces: `stores` array entries shrink to `{ id, city, address, phone?, geo? }` — wait, no: `phone` is removed too (moved to translations in Task 9). Final shape: `{ id: string; city: LangMap; address: LangMap; geo?: { latitude: number; longitude: number } }`. This is a breaking change to the type — Task 11 (same PR) must land together, or the build fails. Do not merge this task without Task 11.

- [ ] **Step 1: Remove `name`, `hours`, `phone` from every store entry**

Rewrite the file to:

```ts
// Адреса магазинов всегда на латышском во всех языках интерфейса (требование заказчика).
export const stores = [
  {
    id: 'riga-office',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    address: {
      ru: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
      en: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
      lv: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
    },
    geo: { latitude: 56.9254541, longitude: 24.2023317 },
  },
  {
    id: 'imanta',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    address: {
      ru: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
      en: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
      lv: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
    },
    geo: { latitude: 56.9554319, longitude: 24.0058872 },
  },
  {
    id: 'plavnieki',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    address: {
      ru: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
      en: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
      lv: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
    },
    geo: { latitude: 56.9402831, longitude: 24.2025771 },
  },
  {
    id: 'daugavpils',
    city: { ru: "Даугавпилс", en: "Daugavpils", lv: "Daugavpils" },
    address: {
      ru: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
      en: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
      lv: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
    },
    geo: { latitude: 55.8726243, longitude: 26.5207536 },
  },
  {
    id: 'liepaja',
    city: { ru: "Лиепая", en: "Liepaja", lv: "Liepāja" },
    address: {
      ru: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
      en: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
      lv: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
    },
    geo: { latitude: 56.50886, longitude: 21.00872 },
  },
  {
    id: 'valmiera',
    city: { ru: "Валмиера", en: "Valmiera", lv: "Valmiera" },
    address: {
      ru: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
      en: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
      lv: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
    },
    geo: { latitude: 57.5302211, longitude: 25.4305242 },
  },
  {
    id: 'rezekne',
    city: { ru: "Резекне", en: "Rezekne", lv: "Rēzekne" },
    address: {
      ru: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
      en: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
      lv: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
    },
    geo: { latitude: 56.5128169, longitude: 27.3349656 },
  },
  {
    id: 'jelgava',
    city: { ru: "Елгава", en: "Jelgava", lv: "Jelgava" },
    address: {
      ru: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
      en: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
      lv: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
    },
  },
];
```

(`jelgava` never had a `geo` field — unchanged, still doesn't.)

- [ ] **Step 2: Leave typechecking to Task 11**

Do not run `tsc --noEmit` standalone here — every consumer in Task 11 still references the now-removed fields, so the build is red between Task 10 and Task 11. That's expected; verify at the end of Task 11 instead.

- [ ] **Step 3: Stage but don't commit yet**

```bash
git add data/stores.ts
```

Carry this staged change into Task 11 and commit both together (Task 11's commit step covers this file too) — the codebase must never be committed in a broken intermediate state.

---

### Task 11: Update the 6 consumers of `store.name`/`store.hours`/`store.phone`

**Files:**
- Modify: `components/Stores.tsx`
- Modify: `app/[lang]/contact/page.tsx`
- Modify: `app/[lang]/checkout/page.tsx`
- Modify: `app/[lang]/checkout/CheckoutFormSections.tsx`
- Modify: `lib/invoice-template.ts`
- Modify: `scripts/fix-pickup-order-addresses.ts`

**Interfaces:**
- Consumes: `stores.<id>.name` / `.hours1-3` / `.phone` keys from Task 9, trimmed `stores` shape from Task 10.

`app/api/orders/route.ts` was in the original broad grep but doesn't actually read `store.name`/`.hours`/`.phone` (confirmed) — no change needed there.

- [ ] **Step 1: `components/Stores.tsx`**

```tsx
import React from 'react';
import Image from 'next/image';
import { stores } from '@/data/stores';
import type { Language } from '@/data/translations';
import { getServerContent } from '@/lib/server-translation';

export default async function Stores({ language }: { language: Language }): Promise<React.JSX.Element> {
    const { t } = await getServerContent(language);

    return (
        <section className="stores py-8" id="stores">
            <div className="w-full px-4">
                <div className="mb-4">
                    <h2 className="stores__title text-2xl font-semibold">{t('stores.title')}</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {stores.map((store) => (
                        <article
                            key={store.id}
                            id={store.id}
                            className="store-card p-4 border rounded-lg flex flex-col items-center bg-slate-50 dark:bg-gray-800 shadow overflow-hidden"
                        >
                            <Image
                                src={`/stores/${store.id}.jpg`}
                                alt={t(`stores.${store.id}.name`)}
                                width={320}
                                height={180}
                                className="mb-2 rounded w-full h-40 object-cover"
                            />
                            <h3 className="text-lg font-bold mb-1">{t(`stores.${store.id}.name`)}</h3>
                            <p className="text-sm text-gray-600 mb-1">{store.address.lv}</p>
                            <p className="text-sm text-gray-600 mb-1">
                                {t('stores.phone') ?? 'Телефон'}: {t(`stores.${store.id}.phone`)}
                            </p>
                            <div className="text-sm text-gray-600">
                                {t('stores.hours') ?? 'Время работы'}:
                                <ul className="ml-4 list-disc">
                                    <li>{t(`stores.${store.id}.hours1`)}</li>
                                    <li>{t(`stores.${store.id}.hours2`)}</li>
                                    <li>{t(`stores.${store.id}.hours3`)}</li>
                                </ul>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
```

- [ ] **Step 2: `app/[lang]/contact/page.tsx`**

At line ~164, change:
```ts
      name: `Hairshop-Pro — ${store.name[language]}`,
```
to:
```ts
      name: `Hairshop-Pro — ${t(`stores.${store.id}.name`)}`,
```

At line ~167, change:
```ts
      telephone: store.phone,
```
to:
```ts
      telephone: t(`stores.${store.id}.phone`),
```

(`t` and `language` are already in scope — this component calls `useTranslation()` at its top.)

- [ ] **Step 3: `app/[lang]/checkout/page.tsx`**

At lines ~212-223, replace:
```tsx
                                                {stores.map((store) => {
                                                        const lang = language as 'ru' | 'en' | 'lv';
                                                        return (
                                                            <SelectItem
                                                                key={store.id}
                                                                value={store.id}
                                                            >
                                                                {store.name[lang] ?? store.name.ru}{' '}
                                                                â€” {store.address.lv}
                                                            </SelectItem>
                                                        );
                                                    })}
```
with:
```tsx
                                                {stores.map((store) => (
                                                        <SelectItem
                                                                key={store.id}
                                                                value={store.id}
                                                            >
                                                                {t(`stores.${store.id}.name`)} — {store.address.lv}
                                                            </SelectItem>
                                                    ))}
```

(Drops the `lang` intermediate variable — `t()` is already bound to the page's current language. Also fixes a pre-existing mojibake bug on this exact line, `â€”` → `—`, while it's being rewritten anyway.)

- [ ] **Step 4: `app/[lang]/checkout/CheckoutFormSections.tsx`**

At line 130, in `DeliverySection` (this component isn't currently wired into any page — `checkout/page.tsx` has its own separate pickup-store `<Select>`, handled in Step 3 above — but it still must compile), change:
```tsx
<SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name[language] ?? store.name.ru} — {store.address.lv}</SelectItem>)}</SelectContent>
```
to:
```tsx
<SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{t(`stores.${store.id}.name`)} — {store.address.lv}</SelectItem>)}</SelectContent>
```

(`t` is already a prop of `DeliverySectionProps`, used elsewhere in this component — no new plumbing needed. `language` prop becomes unused in this file if it was only used here — check with a search for other `language` uses in the file before removing the prop; if still used elsewhere in `DeliverySectionProps`, leave the prop as-is.)

- [ ] **Step 5: `lib/invoice-template.ts`**

Add the import:
```ts
import { translations } from '@/data/translations'
```

Change:
```ts
  return { address: `${store.name.lv} — ${store.address.lv}`, city: store.city.lv }
```
to:
```ts
  return { address: `${translations.lv[`stores.${store.id}.name`]} — ${store.address.lv}`, city: store.city.lv }
```

(The function's doc comment already states the store address must stay Latvian in both invoice languages — this preserves that: always reads the `lv` dict directly, regardless of `InvoiceLang`.)

- [ ] **Step 6: `scripts/fix-pickup-order-addresses.ts`**

Add the import:
```ts
import { translations } from '../data/translations'
```

Change:
```ts
    const address = `${store.name.lv} — ${store.address.lv}`
```
to:
```ts
    const address = `${translations.lv[`stores.${store.id}.name`]} — ${store.address.lv}`
```

- [ ] **Step 7: Typecheck and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all suites pass. This is the point where Task 10's type change and this task's consumer updates must both be in place — if `tsc` still complains about `store.name`/`store.hours`/`store.phone` anywhere, grep for it (`grep -rn "store\.name\|store\.hours\|store\.phone" --include="*.ts" --include="*.tsx" .`) and fix the remaining site.

- [ ] **Step 8: Manual check on dev server**

Open `/stores` — all 8 cards render name/hours/phone correctly in the active language. Open `/contact` — page loads without console errors (JSON-LD schema references resolve). Start a checkout with delivery method "pickup" — store dropdown shows correct localized names. If you can trigger an invoice generation (or just read the code path), confirm `lvDeliveryAddress` still returns the Latvian store name.

- [ ] **Step 9: Commit (both Task 10 and Task 11 together)**

```bash
git add data/stores.ts components/Stores.tsx app/\[lang\]/contact/page.tsx app/\[lang\]/checkout/page.tsx app/\[lang\]/checkout/CheckoutFormSections.tsx lib/invoice-template.ts scripts/fix-pickup-order-addresses.ts
git commit -m "$(cat <<'EOF'
refactor(stores): move name/hours/phone to translations

data/stores.ts keeps only id/city/address/geo — address stays a
fixed Latvian constant per the standing requirement, but name/hours/
phone now resolve through t('stores.<id>.*') so /admin/content can
edit them. Updates all 6 consumers. Drive-by fix: mojibake em-dash
in checkout/page.tsx's pickup-store dropdown label.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Add 8 store sections to the content registry

**Files:**
- Modify: `lib/content-registry.ts`

**Interfaces:**
- Consumes: every `stores.<id>.*` key from Task 9.

- [ ] **Step 1: Append 8 sections**

Add before the closing `]` of `CONTENT_REGISTRY` (after the `payment` and `header-logo` sections added in Tasks 7 and 8):

```ts
  {
    id: 'store-riga-office',
    title: 'Магазин — Рига Офис',
    entries: [
      { type: 'text', key: 'stores.riga-office.name', label: 'Название' },
      { type: 'text', key: 'stores.riga-office.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.riga-office.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.riga-office.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.riga-office.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-imanta',
    title: 'Магазин — Рига (Иманта)',
    entries: [
      { type: 'text', key: 'stores.imanta.name', label: 'Название' },
      { type: 'text', key: 'stores.imanta.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.imanta.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.imanta.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.imanta.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-plavnieki',
    title: 'Магазин — Рига (Плявниеки)',
    entries: [
      { type: 'text', key: 'stores.plavnieki.name', label: 'Название' },
      { type: 'text', key: 'stores.plavnieki.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.plavnieki.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.plavnieki.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.plavnieki.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-daugavpils',
    title: 'Магазин — Даугавпилс',
    entries: [
      { type: 'text', key: 'stores.daugavpils.name', label: 'Название' },
      { type: 'text', key: 'stores.daugavpils.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.daugavpils.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.daugavpils.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.daugavpils.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-liepaja',
    title: 'Магазин — Лиепая',
    entries: [
      { type: 'text', key: 'stores.liepaja.name', label: 'Название' },
      { type: 'text', key: 'stores.liepaja.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.liepaja.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.liepaja.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.liepaja.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-valmiera',
    title: 'Магазин — Валмиера',
    entries: [
      { type: 'text', key: 'stores.valmiera.name', label: 'Название' },
      { type: 'text', key: 'stores.valmiera.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.valmiera.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.valmiera.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.valmiera.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-rezekne',
    title: 'Магазин — Резекне',
    entries: [
      { type: 'text', key: 'stores.rezekne.name', label: 'Название' },
      { type: 'text', key: 'stores.rezekne.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.rezekne.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.rezekne.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.rezekne.phone', label: 'Телефон' },
    ],
  },
  {
    id: 'store-jelgava',
    title: 'Магазин — Елгава',
    entries: [
      { type: 'text', key: 'stores.jelgava.name', label: 'Название' },
      { type: 'text', key: 'stores.jelgava.hours1', label: 'Часы работы — строка 1' },
      { type: 'text', key: 'stores.jelgava.hours2', label: 'Часы работы — строка 2' },
      { type: 'text', key: 'stores.jelgava.hours3', label: 'Часы работы — строка 3' },
      { type: 'text', key: 'stores.jelgava.phone', label: 'Телефон' },
    ],
  },
```

- [ ] **Step 2: Run the registry test**

Run: `npx vitest run lib/content-registry.test.ts`
Expected: 5/5 pass.

- [ ] **Step 3: Manual check**

On `/admin/content`, expand one store section, edit the phone number, save, switch language tab, confirm it needs editing again there too (expected friction, documented in the spec — not a bug). Reload `/stores` and confirm the override is visible.

- [ ] **Step 4: Commit**

```bash
git add lib/content-registry.ts
git commit -m "$(cat <<'EOF'
feat(admin): add 8 store sections to content registry

Completes the store-content wiring from the previous two commits —
/admin/content can now edit every store's name, hours, and phone.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

### Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit test suite**

Run: `npx vitest run`
Expected: all suites pass, including `lib/content-registry.test.ts` (now validating 13 sections instead of 7).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds, no new warnings tied to any file touched in this plan.

- [ ] **Step 4: Manual smoke pass on dev server**

Run `npm run dev` and walk through:
- `/delivery`, `/payment` (ru, en) — content matches pre-change wording, pickup list shows 8 stores.
- `/stores` — all 8 cards correct in ru/en/lv.
- `/contact` — loads clean, no console errors from the JSON-LD `storeSchemas` block.
- Header logo renders correctly light/dark.
- `/admin/content` — "Доставка", "Оплата", "Логотип", and all 8 "Магазин — …" sections present, each edits and resets correctly.
- `/admin/content/banners` — only banner management, no "Контентные блоки" tab, no type selector (always creates `sale`).
- `/admin/marketing/showcases` — route no longer exists (404), no longer in the sidebar.
- Checkout pickup-flow (`app/[lang]/checkout/page.tsx`) — store dropdown shows correct localized names, no mojibake.

- [ ] **Step 5: Push**

```bash
git push origin main
```

(Per standing preference: push immediately after a green commit, no need to ask each time — see `feedback_push_immediately` memory. Confirm no force-push or destructive flags are needed; this is a fast-forward push of 12 sequential commits.)
