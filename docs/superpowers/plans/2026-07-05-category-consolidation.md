# Category Consolidation to 5 Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the site's product categories to exactly 5 (`hair`, `nails`, `face`, `body`, `equipment`), reclassify every live product into one of them using the recovered multi-tag MSSQL data, and remove all `new` (Разное) references from code.

**Architecture:** A committed Node/tsx script rebuilds `Product.category` for all 6378 live rows from a curated tag→bucket dictionary applied to the multi-tag MSSQL export, independent of the frontend. Frontend/admin code changes are a mechanical removal of the `'new'` value from every array/union/UI list that enumerates categories, plus moving two subcategory groups (`leg-care`/`hand-care` → `body`, the six former `new` subcategories → `equipment`).

**Tech Stack:** Next.js/TypeScript, Prisma + `pg` (raw pool for the bulk update, matching existing migration scripts), Vitest, Playwright.

## Global Constraints

- Do not change the `Product` table schema — this is a values-only update on the existing `category` column (per project convention: no schema changes to the live Neon DB).
- Keep existing category ids unchanged: `hair`, `nails`, `face`, `body`, `equipment`. Only `new` is removed.
- The `badges` array / `'new'` badge (new-arrival flag) is a separate system from `CategoryType` and must not be touched.
- The bulk DB update is destructive-ish (rewrites `category` on ~6378 live rows backing the production site hairshop-pro.lv.vercel.app) — it must run dry-run first, be reviewed, and only then applied with an explicit `--apply` flag. Do not run `--apply` without showing the dry-run report first.

---

## Task 1: Recategorization script (dry run)

**Files:**
- Create: `scripts/recategorize-products.ts`

**Interfaces:**
- Produces: a CLI script runnable as `npx tsx scripts/recategorize-products.ts` (dry run, prints report, no writes) or `npx tsx scripts/recategorize-products.ts --apply` (writes to DB). No other task depends on its internals — Task 4 just re-invokes it with `--apply`.

- [ ] **Step 1: Verify the prerequisite data file is present**

Run: `node -e "console.log(require('fs').existsSync('C:/Temp/product_category_map.json'))"`
Expected: `true`

This file is the recovered MSSQL `Product_Category_Mapping` export (productId + catName pairs, multi-tag per product) from the 2026-06-28 session. There is no script to regenerate it — it would require a live MSSQL connection. If it's missing, stop and get it back before continuing.

- [ ] **Step 2: Write the script**

```ts
/**
 * Recategorize all live products into the 5 final categories
 * (hair/nails/face/body/equipment), replacing the broken single-tag
 * mapping from scripts/migrate-from-mssql.ts with a multi-tag confident
 * map. See docs/superpowers/specs/2026-07-05-category-consolidation-design.md.
 *
 * Prerequisite: C:/Temp/product_category_map.json must exist — the
 * recovered MSSQL Product_Category_Mapping export (productId + catName,
 * multi-tag per product) from the 2026-06-28 session. There is no script
 * to regenerate it (would require a live MSSQL connection).
 *
 * Usage:
 *   npx tsx scripts/recategorize-products.ts            # dry run, report only
 *   npx tsx scripts/recategorize-products.ts --apply     # writes to DB
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

type Bucket = 'hair' | 'nails' | 'face' | 'body' | 'equipment'

// Real MSSQL taxonomy leaves + well-known brand-as-functional-signal tags.
// Anything not listed here (pure brand names, promo tags like AKCIJAS/
// DĀVANAS, structural nodes like KATEGORIJAS/DAŽĀDI) is intentionally
// left unmapped: on multi-tag products another tag will resolve it, and
// fully-unresolvable products fall back to `equipment` (see PRIORITY/
// resolveBucket below), not `hair` — the whole point of this rewrite is
// to stop the old broken mapping from dumping everything into hair.
const HAIR: string[] = [
  'ŠAMPŪNI', 'VEIDOŠANAS LĪDZEKĻI', 'KONDICIONIERI', 'KONDICIONERI', 'KONDICIONIERIS',
  'MATU PAPILDKOPŠANA', 'MATU MASKAS', 'MASKAS', 'MATU KRĀSOŠANAI UN BALINĀŠANAI',
  'MATU KRĀSOŠANA UN BALINĀŠANA', 'MATU KOPŠANAI UN BALINĀŠANAI', 'BARBERSHOP KOSMĒTIKA',
  'BARBERSHOP', 'MATU KOSMĒTIKA', 'MATU VEIDOŠANA', 'MATIEM', 'SHAMPOO', 'CONDITIONER',
  'HAIR MASKS', 'DSD DE LUXE', 'INEBRYA', 'REUZEL', 'FRENCHI', 'OLAPLEX', 'KEUNE 1922',
  'PEPTIDE REPAIR RESCUE', 'PH 4.5 COLOR FREEZE', 'HYALURONIC MOISTURE KICK',
  'COLLAGEN VOLUME BOOST', 'FRIZZ AWAY', 'Q10+ TIME RESTORE', 'NOIR REPAIR',
  'TURQUOISE HYDRA COMPLEX', 'BLANC VOLUME UP', 'PLATINUM ABSOLUTE BLOND',
  'KERATIN PROTEIN', 'KERATIN PROTEIN PERLE', 'KERATIN SERIJA', 'ARGAN TREATMENT DORE',
  'ROSE CURLY DREAM', 'ARGENT', 'R-TWO', 'ADDITIONAL CARE', 'EXTRA CARE', 'ILLAMINACTION',
  'AMPOULES', 'DIKSON PRIME HAIR COLOR MASK', 'DIKSON', 'FUDGE URBAN', 'MOROCCANOIL', 'K18',
  'BEARDBURYS', 'DEAR BARBER', 'BY MY BEARD', 'BATISTE', 'GOLDWELL', 'OROFLUIDO',
  'SCHWARZKOPF PROFESSIONAL', 'BLACK PROFESSIONAL LINE', "L`OREAL PROFESSIONNEL",
  "L'OREAL PROFESSIONNEL", "L`OREAL KIDS", 'SUBRINA PROFESSIONAL', 'LAB 35', 'PRO-TOX',
  'KALLOS PLEX BOND BUILDER', 'JADE', 'ROYAL TREATMENT', 'BIOELIXIRE',
  'CHARLES WORTHINGTON', 'HAIR EXPERT', 'KASHŌKI', 'LUMI', 'STAPIZ', 'BARBET MEN', 'DANDY',
]

const NAILS: string[] = [
  'NAGU ĀRSTĒŠANA', 'NAGU KOPŠANA', 'NAGU LAKAS', 'GĒLA LAKAS',
  'GĒLA TEHNOLOĢIJAS PALĪGLĪDZEKĻI', 'UV ŽELEJAS', 'MANIKĪRA UN PEDIKĪRA PIEDERUMI',
  'MANIKĪRA UN PEDIKĪRA KNAIBLES', 'MANIKĪRA UN PEDIKĪRA VĪLES', 'MANIKĪRA ŠĶĒRES',
  'MANIKĪRA PIEDERUMI', 'PUŠERI', 'NAGIEM', 'VICTORIA VYNN', 'SEMILAC', 'SILCARE',
  'NAIL TEK', 'ORLY', 'LACKY NAILS', 'STALEKS', 'TRIND', 'KINETICS', 'RONNEY',
  'BEAUTY IMAGE',
]

const FACE: string[] = [
  'SEJAI', 'ĀDAS KOPŠANA', 'DEKORATĪVĀ KOSMĒTIKA', 'DEKORATĪVA KOSMĒTIKA',
  'MAKE-UP AKSESUĀRI', 'SKROPSTU TUŠA', 'SKROPSTU UN UZACU KOPŠANA', 'LŪPĀM',
  'GRIMA PAMATS', 'PŪDERI', 'KOREKTORI', 'MAKE UP BLENDER', "L`OREAL PARIS MAKEUP",
  'MAYBELLINE', 'MAX FACTOR', 'VIVIENNE SABO', 'BOURJOIS', 'GOSH', 'PAYOT', 'YON-KA',
  'JANSSEN COSMETICS', 'DR.KADIR', 'MATIS', 'LANCOME', 'HOLIKA HOLIKA', 'KOREAN BEAUTY',
  'PUREDERM', 'CHILDS FARM', 'SNAILS', 'BIODERMA', 'EOS', 'LONG 4 LASHES', 'PILATEN',
  'HISKIN', 'CETTUA', 'LOVASKIN', 'JEUNESSE',
]

const BODY: string[] = [
  'KĀJĀM', 'ROKĀM', 'GEHWOL', 'SIEVIEŠU SMARŽAS', 'VĪRIEŠU SMARŽAS', 'ĶERMEŅA KOSMĒTIKA',
  'ĶERMEŅA KOSMETIKA', 'VAKSĀCIJA', 'EĻĻAS', 'ĶERMENIM', 'SOLĀRIJU KOSMĒTIKA', 'RICA',
  'FEETCALM', 'CARELIKA', 'ST.TROPEZ', 'DEPILEVE', 'SANCTUARY SPA', 'YOPE', 'LATTAFA',
  'JAMES READ', 'ART OF SUN', 'SECRET SUN', 'MERCEDES BENZ', 'DEPILĀCIJAS PAPĪRS',
]

const EQUIPMENT: string[] = [
  'INSTRUMENTI', 'ĶEMMES UN MATU SUKAS', 'MATU GRIEŽAMĀ MAŠĪNA', 'MATU GRIEŽAMĀS MAŠĪNAS',
  'STYLING TOOLS', 'AKSESUĀRI MATIEM', 'FĒNI', 'MATU SUKAS', 'MATU ĶEMMES',
  'ELEKTROPRECES', 'MĒBELES', 'AKSESUĀRI', 'EKO-HIGIENA', 'DEZINFEKCIJA', 'TANGLE TEEZER',
  'TANGLE ANGEL', 'GHD', 'BABYLISS', 'BABYLISS PRO', 'WAHL', 'ANDIS', 'GA.MA', 'CERA',
  'VALERA', 'OLIVIA GARDEN', 'FRAMAR', 'CERIOTTI', 'JAGUAR', 'JRL', 'EUROSTIL PROFESSIONAL',
  'PHILIPS', 'OSTER', 'DYSON', 'REMINGTON', 'DREAME', 'LANAFORM', 'SIBEL', 'LABOR', 'ETI',
  'HAKURO PROFESSIONAL', 'O! TOOLS', 'TOOLS FOR BEAUTY', 'RAZORPIT', 'SKAISTUMAM',
  'PALĪGMATERIĀLI', 'CIMDI', 'VIENREIZĒJIE APMETŅI UN APKAKLĪTES', 'FOLIJA', 'FLIZELĪNS',
  'APMETŅI UN PRIEKŠAUTI', 'BARBERSHOP  AKSESUĀRI', 'TUNIKA', 'KLEITA', 'SVĀRKI',
  'BIKSES UN  LEGINSI', 'PĀRTIKAS UN SAIMNIECĪBAS PRECES SALONIEM', 'VESELĪBAI', 'VIRTUVEI',
  'PUTEKĻU SŪCĒJI', 'ROBOTIZĒTIE PUTEKĻU SŪCĒJI', 'ROKAS PUTEKĻU SŪCĒJI',
  'PUTEKĻU SŪCĒJI MITRAI UN SAUSAI TĪRĪŠANAI', 'TĒJKANNAS', 'TOSTERI', 'CEPEŠKRĀSNIS',
  'ELEKTRISKIE GRILI', 'BLENDERI', 'SOUS VIDE IERĪCES', 'VIRTUVES ROBOTI',
  'ZOBU STARPU IRIGATORI', 'ZOBU BIRSTES', 'ĶERMEŅA SVARI', 'TVAIKA MOPI',
  'APĢĒRBU TVAICĒTĀJI', 'MATU VEIDOTĀJI', 'AENO', 'PERFECT BEAUTY',
]

const TAG_TO_BUCKET = new Map<string, Bucket>()
for (const name of HAIR) TAG_TO_BUCKET.set(name.toUpperCase(), 'hair')
for (const name of NAILS) TAG_TO_BUCKET.set(name.toUpperCase(), 'nails')
for (const name of FACE) TAG_TO_BUCKET.set(name.toUpperCase(), 'face')
for (const name of BODY) TAG_TO_BUCKET.set(name.toUpperCase(), 'body')
for (const name of EQUIPMENT) TAG_TO_BUCKET.set(name.toUpperCase(), 'equipment')

// Conflict priority when a product's tags resolve to more than one bucket
// (e.g. shampoo + men's perfume on the same product) — matches the order
// proven in the 2026-06-28 fix.
const PRIORITY: Bucket[] = ['body', 'face', 'nails', 'equipment', 'hair']

function loadJsonLenient(path: string): unknown {
  let raw = readFileSync(path, 'utf8')
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code <= 0x1F) continue
    out += raw[i]
  }
  return JSON.parse(out)
}

function resolveBucket(tagNames: string[]): Bucket {
  const matched = new Set<Bucket>()
  for (const name of tagNames) {
    const bucket = TAG_TO_BUCKET.get(name.trim().toUpperCase())
    if (bucket) matched.add(bucket)
  }
  for (const bucket of PRIORITY) {
    if (matched.has(bucket)) return bucket
  }
  return 'equipment'
}

async function main() {
  const apply = process.argv.includes('--apply')
  const MAP_PATH = 'C:/Temp/product_category_map.json'

  let rows: { productId: number; catName: string }[]
  try {
    rows = loadJsonLenient(MAP_PATH) as { productId: number; catName: string }[]
  } catch (e) {
    console.error(`Failed to load ${MAP_PATH}: ${(e as Error).message}`)
    console.error(
      'This file is the recovered MSSQL Product_Category_Mapping export from the ' +
      '2026-06-28 session — it must be present at this path, there is no regeneration script.'
    )
    process.exit(1)
  }

  const tagsByProductId = new Map<string, string[]>()
  for (const row of rows) {
    const id = String(row.productId)
    const list = tagsByProductId.get(id) ?? []
    list.push(row.catName)
    tagsByProductId.set(id, list)
  }
  console.log(`Loaded ${rows.length} tag rows for ${tagsByProductId.size} distinct products`)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    const current = await client.query<{ id: string; category: string }>(
      'SELECT id, category FROM "Product" WHERE "isDeleted" = false'
    )
    console.log(`Live products in DB: ${current.rows.length}`)

    const nextByBucket: Record<Bucket, string[]> = {
      hair: [], nails: [], face: [], body: [], equipment: [],
    }
    const beforeCounts: Record<string, number> = {}
    let matchedFromMap = 0
    let untouched = 0

    for (const product of current.rows) {
      beforeCounts[product.category] = (beforeCounts[product.category] ?? 0) + 1
      const tags = tagsByProductId.get(product.id)

      if (tags) {
        nextByBucket[resolveBucket(tags)].push(product.id)
        matchedFromMap++
      } else if (product.category === 'new') {
        nextByBucket.equipment.push(product.id)
      } else {
        untouched++
      }
    }

    console.log('BEFORE:', beforeCounts)
    console.log(
      'AFTER (planned):',
      Object.fromEntries(Object.entries(nextByBucket).map(([bucket, ids]) => [bucket, ids.length]))
    )
    console.log(`Matched via MSSQL tag map: ${matchedFromMap}`)
    console.log(`Left untouched (no tag data, category already valid, not 'new'): ${untouched}`)

    if (!apply) {
      console.log('\nDry run only — pass --apply to write these changes to the database.')
      return
    }

    await client.query('BEGIN')
    let total = 0
    for (const [bucket, ids] of Object.entries(nextByBucket)) {
      if (ids.length === 0) continue
      const result = await client.query('UPDATE "Product" SET category = $1 WHERE id = ANY($2)', [bucket, ids])
      console.log(`  ${bucket}: ${result.rowCount}`)
      total += result.rowCount ?? 0
    }
    await client.query('COMMIT')
    console.log(`Committed. Rows updated: ${total}`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Rolled back:', e)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main()
```

- [ ] **Step 3: Run the dry run**

Run: `npx tsx scripts/recategorize-products.ts`
Expected: prints `BEFORE:` (the current broken distribution, dominated by `hair`), `AFTER (planned):` with all 5 buckets populated and no `new` key, `Matched via MSSQL tag map: <n>` close to 6315, and a small `Left untouched` count. No writes happen (no `Committed.` line).

- [ ] **Step 4: Commit the script**

```bash
git add scripts/recategorize-products.ts
git commit -m "$(cat <<'EOF'
feat(categories): add multi-tag product recategorization script

Dry-run by default; rebuilds Product.category from the recovered
2026-06-28 MSSQL multi-tag export straight into the 5 final buckets
(hair/nails/face/body/equipment), replacing the currently-reverted
broken single-tag mapping. Pass --apply to write.
EOF
)"
```

---

## Task 2: Remove `'new'` from admin/API/UI category lists

**Files:**
- Modify: `lib/admin/products/constants.ts`
- Modify: `app/api/admin/import/route.ts:20`
- Modify: `app/api/admin/import/preview/route.ts:29`
- Modify: `app/admin/products/bulk-price/page.tsx:31`
- Modify: `app/admin/marketing/campaigns/page.tsx:28-35`
- Modify: `components/MobileMenu.tsx:17-24`
- Modify: `data/translations.ts:367,3361,5156` (approximate — the `categories.newArrivals` key in each of the ru/en/lv blocks)

**Interfaces:**
- Consumes: nothing new — these are pure subtractive edits to existing arrays/objects. `CategoryType` in `data/products.ts` still includes `'new'` at this point (removed in Task 3), so these edits must not leave any leftover `'new'` reference behind.

- [ ] **Step 1: Drop `'new'` from `CATEGORY_OPTIONS`**

In `lib/admin/products/constants.ts`, change:

```ts
export const CATEGORY_OPTIONS = [
  'hair',
  'face',
  'body',
  'nails',
  'equipment',
  'new',
];
```

to:

```ts
export const CATEGORY_OPTIONS = [
  'hair',
  'face',
  'body',
  'nails',
  'equipment',
];
```

`BADGE_META` (the `new`/`sale` badge labels below it) is untouched — that's the unrelated new-arrival badge system.

- [ ] **Step 2: Drop `'new'` from both import route validators**

In `app/api/admin/import/route.ts:20`, change:

```ts
const VALID_CATEGORIES: CategoryType[] = ['hair', 'face', 'body', 'nails', 'equipment', 'new']
```

to:

```ts
const VALID_CATEGORIES: CategoryType[] = ['hair', 'face', 'body', 'nails', 'equipment']
```

In `app/api/admin/import/preview/route.ts:29`, make the identical change (same line, same before/after text).

- [ ] **Step 3: Drop `'new'` from the bulk-price page**

In `app/admin/products/bulk-price/page.tsx:31`, change:

```ts
const CATEGORIES = ['hair', 'face', 'body', 'nails', 'equipment', 'new'];
```

to:

```ts
const CATEGORIES = ['hair', 'face', 'body', 'nails', 'equipment'];
```

- [ ] **Step 4: Drop `'new'` from the marketing campaigns page**

In `app/admin/marketing/campaigns/page.tsx:28-35`, change:

```ts
const CATEGORIES = [
  { value: 'hair', label: 'Волосы' },
  { value: 'face', label: 'Лицо' },
  { value: 'body', label: 'Тело' },
  { value: 'nails', label: 'Ногти' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'new', label: 'Новинки' }
]
```

to:

```ts
const CATEGORIES = [
  { value: 'hair', label: 'Волосы' },
  { value: 'face', label: 'Лицо' },
  { value: 'body', label: 'Тело' },
  { value: 'nails', label: 'Ногти' },
  { value: 'equipment', label: 'Оборудование' }
]
```

- [ ] **Step 5: Drop the "new" entry from the mobile menu**

In `components/MobileMenu.tsx:17-24`, change:

```ts
const CATEGORIES = [
  { id: 'hair', labelKey: 'categories.haircare', fallback: 'Hair care' },
  { id: 'face', labelKey: 'categories.skincare', fallback: 'Skincare' },
  { id: 'body', labelKey: 'categories.bodycare', fallback: 'Body care' },
  { id: 'equipment', labelKey: 'categories.equipment', fallback: 'Equipment' },
  { id: 'nails', labelKey: 'categories.nails', fallback: 'Nails' },
  { id: 'new', labelKey: 'categories.newArrivals', fallback: 'New arrivals' }
]
```

to:

```ts
const CATEGORIES = [
  { id: 'hair', labelKey: 'categories.haircare', fallback: 'Hair care' },
  { id: 'face', labelKey: 'categories.skincare', fallback: 'Skincare' },
  { id: 'body', labelKey: 'categories.bodycare', fallback: 'Body care' },
  { id: 'equipment', labelKey: 'categories.equipment', fallback: 'Equipment' },
  { id: 'nails', labelKey: 'categories.nails', fallback: 'Nails' }
]
```

- [ ] **Step 6: Remove the `categories.newArrivals` translation key**

In `data/translations.ts`, delete this line from each of the three locale blocks (ru, en, lv):

RU block: `'categories.newArrivals': 'Разное',`
EN block: `'categories.newArrivals': 'New arrivals',`
LV block: `'categories.newArrivals': '<LV value currently there>',`

Verified during investigation: `categories.newArrivals` is referenced only from `data/categories.ts` (removed in Task 3) and `components/MobileMenu.tsx` (just edited above in Step 5) — safe to delete outright.

- [ ] **Step 7: Typecheck and unit test**

Run: `npx tsc --noEmit`
Expected: no new errors (only pre-existing ones, if any — `CategoryType` still includes `'new'` at this point, so nothing here type-errors).

Run: `npx vitest run`
Expected: all existing suites pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add lib/admin/products/constants.ts app/api/admin/import/route.ts app/api/admin/import/preview/route.ts app/admin/products/bulk-price/page.tsx app/admin/marketing/campaigns/page.tsx components/MobileMenu.tsx data/translations.ts
git commit -m "$(cat <<'EOF'
chore(categories): drop 'new' from admin/API/UI category lists

Subtractive cleanup ahead of removing 'new' from CategoryType itself —
constants, import validators, bulk-price/campaigns pickers, mobile menu,
and the now-unused categories.newArrivals translation key.
EOF
)"
```

---

## Task 3: Remove `new` category card, restructure subcategories, drop from `CategoryType`

**Files:**
- Modify: `data/categories.ts`
- Modify: `data/products.ts:3`

**Interfaces:**
- Consumes: nothing (Task 2 already removed all other `'new'` references, so this is now safe).
- Produces: `CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment'` (no more `'new'`); `CATEGORY_CARDS` and `SUBCATEGORIES_BY_ID` with 5 entries.

- [ ] **Step 1: Rewrite `data/categories.ts`**

Replace the entire file content with:

```ts
export type Subcategory = {
  slug: string
  key: string
  search: string
}

export type CategoryCardData = {
  id: string
  titleKey: string
  href: string
  image: string
}

export const CATEGORY_CARDS: CategoryCardData[] = [
  { id: 'hair', titleKey: 'categories.haircare', href: '/catalog?cat=hair', image: '/categories/hair.jpg' },
  { id: 'face', titleKey: 'categories.skincare', href: '/catalog?cat=face', image: '/categories/face.jpg' },
  { id: 'body', titleKey: 'categories.bodycare', href: '/catalog?cat=body', image: 'https://hairshop.lv/content/images/thumbs/0028476_sanctuary-spa-lily-rose-collection-body-lotion-250ml-kermena-losjons-250ml-loson-dl-tela-250ml-kehak_400.jpeg' },
  { id: 'nails', titleKey: 'categories.nails', href: '/catalog?cat=nails', image: '/categories/nails.jpg' },
  { id: 'equipment', titleKey: 'categories.equipment', href: '/catalog?cat=equipment', image: '/categories/equipment.jpg' }
]

export const SUBCATEGORIES_BY_ID: Record<string, Subcategory[]> = {
  hair: [
    { slug: 'conditioners', key: 'categories.hairSub.conditioners', search: 'КОНДИЦИОНЕРЫ' },
    { slug: 'masks', key: 'categories.hairSub.masks', search: 'МАСКИ ДЛЯ ВОЛОС' },
    { slug: 'coloring', key: 'categories.hairSub.coloring', search: 'ПОКРАСКА И ОТБЕЛИВАНИЕ ВОЛОС' },
    { slug: 'extra-care', key: 'categories.hairSub.extraCare', search: 'ДОПОЛНИТЕЛЬНЫЙ УХОД ЗА ВОЛОСАМИ' },
    { slug: 'shampoos', key: 'categories.hairSub.shampoos', search: 'ШАМПУНИ' },
    { slug: 'styling', key: 'categories.hairSub.styling', search: 'СРЕДСТВА ДЛЯ УКЛАДКИ' },
    { slug: 'barbershop-products', key: 'categories.hairSub.barbershop', search: 'ТОВАРЫ ДЛЯ БАРБЕРШОПОВ' }
  ],
  face: [
    { slug: 'face-care', key: 'categories.skinSub.face', search: 'ДЛЯ ЛИЦА' },
    { slug: 'lashes-brows-care', key: 'categories.skinSub.lashesBrows', search: 'УХОД ЗА РЕСНИЦАМИ И БРОВЯМИ' },
    { slug: 'decorative-cosmetics', key: 'categories.skinSub.decorativeMakeup', search: 'ДЕКОРАТИВНАЯ КОСМЕТИКА' }
  ],
  body: [
    { slug: 'solarium-cosmetics', key: 'categories.bodySub.solarium', search: 'КОСМЕТИКА ДЛЯ СОЛЯРИЯ' },
    { slug: 'body-cosmetics', key: 'categories.bodySub.bodyCosmetics', search: 'КОСМЕТИКА ДЛЯ ТЕЛА' },
    { slug: 'waxing', key: 'categories.bodySub.waxing', search: 'ВАКСАЦИЯ' },
    { slug: 'oils', key: 'categories.bodySub.oils', search: 'МАСЛА' },
    { slug: 'perfumery', key: 'categories.bodySub.perfumery', search: 'ПАРФЮМЕРИЯ' },
    { slug: 'leg-care', key: 'categories.skinSub.legs', search: 'ДЛЯ НОГ' },
    { slug: 'hand-care', key: 'categories.skinSub.hands', search: 'ДЛЯ РУК' }
  ],
  nails: [
    { slug: 'gel-tech-products', key: 'categories.nailsSub.gelTechHelpers', search: 'ВСПОМОГАТЕЛЬНЫЕ СРЕДСТВА ДЛЯ ГЕЛЕВЫХ ТЕХНОЛОГИЙ' },
    { slug: 'uv-gel', key: 'categories.nailsSub.uvGel', search: 'УФ ГЕЛЬ' },
    { slug: 'manicure-pedicure-tools', key: 'categories.nailsSub.manicurePedicureTools', search: 'ПРИНАДЛЕЖНОСТИ ДЛЯ МАНИКЮРА И ПЕДИКЮРА' },
    { slug: 'treatment-recovery', key: 'categories.nailsSub.treatmentRecovery', search: 'СРЕДСТВА ДЛЯ ЛЕЧЕНИЯ И ВОССТАНОВЛЕНИЯ' },
    { slug: 'nail-polishes', key: 'categories.nailsSub.nailPolishes', search: 'ЛАКИ ДЛЯ НОГТЕЙ' },
    { slug: 'gel-polishes', key: 'categories.nailsSub.gelPolishes', search: 'ГЕЛЬ ЛАКИ' },
    { slug: 'nail-care', key: 'categories.nailsSub.nailCare', search: 'УХОД ЗА НОГТЯМИ' }
  ],
  equipment: [
    { slug: 'furniture', key: 'categories.equipmentSub.furniture', search: 'МЕБЕЛЬ' },
    { slug: 'tools', key: 'categories.equipmentSub.tools', search: 'ИНСТРУМЕНТЫ' },
    { slug: 'electrical-goods', key: 'categories.equipmentSub.electrical', search: 'ЭЛЕКТРОТОВАРЫ' },
    { slug: 'gift-ideas', key: 'categories.miscSub.giftIdeas', search: 'ИДЕИ ДЛЯ ПОДАРКОВ' },
    { slug: 'consumables', key: 'categories.miscSub.consumables', search: 'РАСХОДНЫЕ МАТЕРИАЛЫ' },
    { slug: 'salon-products', key: 'categories.miscSub.salonProducts', search: 'ТОВАРЫ ДЛЯ САЛОНОВ' },
    { slug: 'aprons-capes', key: 'categories.miscSub.apronsCapes', search: 'ПЕРЕДНИКИ И ПЕНЬЮАРЫ' },
    { slug: 'hair-accessories', key: 'categories.miscSub.hairAccessories', search: 'АКСЕССУАРЫ ДЛЯ ВОЛОС' },
    { slug: 'disinfection', key: 'categories.miscSub.disinfection', search: 'ДЕЗИНФЕКЦИЯ' }
  ]
}

const SUBCATEGORY_SEARCH_BY_SLUG: Record<string, string> = Object.values(SUBCATEGORIES_BY_ID)
  .flat()
  .reduce<Record<string, string>>((accumulator, item) => {
    accumulator[item.slug] = item.search
    return accumulator
  }, {})

export const getSubcategorySearchBySlug = (slug: string | undefined): string => {
  if (!slug) return ''
  return SUBCATEGORY_SEARCH_BY_SLUG[slug] ?? ''
}
```

(Changes vs. current file: `new` card dropped from `CATEGORY_CARDS`; `leg-care`/`hand-care` moved from `face` to `body`; the six `new` subcategories moved into `equipment`; the `new` key in `SUBCATEGORIES_BY_ID` removed entirely.)

- [ ] **Step 2: Run the existing subcategory test**

Run: `npx vitest run data/categories.test.ts`
Expected: PASS — `getSubcategorySearchBySlug('shampoos')` still resolves to `'ШАМПУНИ'` regardless of which category id owns the slug, so this test needs no changes.

- [ ] **Step 3: Drop `'new'` from `CategoryType`**

In `data/products.ts:3`, change:

```ts
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment' | 'new';
```

to:

```ts
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment';
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If any file still references `'new'` as a `CategoryType`, this will surface it — if so, stop and check Task 2 was applied completely before continuing.

- [ ] **Step 5: Commit**

```bash
git add data/categories.ts data/products.ts
git commit -m "$(cat <<'EOF'
feat(categories): consolidate to 5 sections, drop 'new'

Removes the 'new' (Разное) category card and its CategoryType value.
Its 6 subcategories move under equipment; leg-care/hand-care move from
face to body to match the hands/feet -> body classification decision.
EOF
)"
```

---

## Task 4: Apply the DB recategorization

**Files:**
- None (re-runs the script from Task 1 with `--apply`)

**Interfaces:**
- Consumes: `scripts/recategorize-products.ts` from Task 1.

- [ ] **Step 1: Re-run the dry run to confirm the report is still sane after Tasks 2-3**

Run: `npx tsx scripts/recategorize-products.ts`
Expected: identical output to Task 1 Step 3 (this script only touches `Product.category`, unaffected by the frontend changes) — all 5 buckets populated, no `new` bucket, `Left untouched` small.

- [ ] **Step 2: Get explicit go-ahead before writing**

This step is a manual checkpoint, not automatable: show the dry-run numbers to the user and get confirmation before proceeding. Do not run `--apply` without it — this rewrites `category` on every live product row backing the production site.

- [ ] **Step 3: Apply**

Run: `npx tsx scripts/recategorize-products.ts --apply`
Expected: prints per-bucket `UPDATE` row counts, then `Committed. Rows updated: <n>` with `<n>` matching the dry-run total.

- [ ] **Step 4: Verify in the DB**

Run:
```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^\"|\"\$/g,'')]}));
const {Pool}=require('pg');
const pool=new Pool({connectionString:env.DATABASE_URL});
(async()=>{
  const r=await pool.query('SELECT category, COUNT(*)::int c FROM \"Product\" WHERE \"isDeleted\"=false GROUP BY category ORDER BY c DESC');
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"
```
Expected: exactly 5 rows (`hair`, `nails`, `face`, `body`, `equipment`), no `new` row, counts sum to the total live product count.

---

## Task 5: Update the e2e test for the removed `new` category

**Files:**
- Modify: `e2e/critical-flows.spec.ts:308-330`

**Interfaces:**
- Consumes: `equipment` category trigger button text (`'Оборудование'`/`'Equipment'`/`'Apkopšana'` per `data/translations.ts`), `salon-products` subcategory (now under `equipment` per Task 3).

- [ ] **Step 1: Rewrite the test**

Change:

```ts
test('misc category salon products subcategory applies subcat filter', async ({ page }) => {
  await page.goto('/')

  const miscCategoryTrigger = page.getByRole('button', {
    name: /Разное|Miscellaneous|Dažādi/i
  })

  await expect(miscCategoryTrigger).toBeVisible({ timeout: 45000 })
  await miscCategoryTrigger.click()

  const salonProductsLink = page.locator('a[href*="/catalog?cat=new&subcat=salon-products"]').first()
  await expect(salonProductsLink).toBeVisible()
  await salonProductsLink.click()

  await page.waitForURL(/\/catalog\?cat=new&subcat=salon-products/)
  await expect(page).toHaveURL(/\/catalog\?cat=new&subcat=salon-products/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
})
```

to:

```ts
test('equipment category salon products subcategory applies subcat filter', async ({ page }) => {
  await page.goto('/')

  const equipmentCategoryTrigger = page.getByRole('button', {
    name: /Оборудование|Equipment|Apkopšana/i
  })

  await expect(equipmentCategoryTrigger).toBeVisible({ timeout: 45000 })
  await equipmentCategoryTrigger.click()

  const salonProductsLink = page.locator('a[href*="/catalog?cat=equipment&subcat=salon-products"]').first()
  await expect(salonProductsLink).toBeVisible()
  await salonProductsLink.click()

  await page.waitForURL(/\/catalog\?cat=equipment&subcat=salon-products/)
  await expect(page).toHaveURL(/\/catalog\?cat=equipment&subcat=salon-products/)

  const cards = page.locator('.product-card')
  await expect(cards.first()).toBeVisible({ timeout: 45000 })

  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the test and confirm it fails the same pre-existing way as before the rewrite (not a new regression)**

Verified during planning: all three subcat tests in this file (`hair`/`shampoos`, `face`/`decorative-cosmetics`, and the `new`/`salon-products` one being rewritten here) already fail on current `main`, before any of this plan's changes — `components/Categories.tsx` renders the category dropdown only `if (isHydrated && isAuthenticated)`, and this spec file has no login step (no `beforeEach`, no `storageState`), so `getByRole('button', { name: /.../i })` never finds the trigger and every one of these tests times out waiting for it. This is a pre-existing gap (the whole Categories nav requiring auth is presumably not intended, or the e2e file is missing an auth fixture) and is out of scope for the category consolidation — do not attempt to fix it here.

Run: `npx playwright test e2e/critical-flows.spec.ts -g "salon products subcategory" --project=chromium`
Expected: still fails, with the identical failure shape as before this task (`toBeVisible` timeout on the category trigger button — now `/Оборудование|Equipment|Apkopšana/i` instead of `/Разное|Miscellaneous|Dažādi/i`). This confirms the rewrite is behaviorally equivalent to the original and hasn't introduced any new failure mode; it will start passing automatically once the pre-existing auth-gating bug is fixed separately.

- [ ] **Step 3: Commit**

```bash
git add e2e/critical-flows.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): repoint salon-products subcategory test at equipment

The 'new' category no longer exists; its salon-products subcategory
now lives under equipment per the category consolidation.
EOF
)"
```

---

## Task 6: Remove superseded scratch scripts

**Files:**
- Delete: `scripts/_tmp_explore_mods.ts`
- Delete: `scripts/_tmp_explore_mods2.ts`
- Delete: `scripts/_tmp_revert_categories.mjs`

**Interfaces:**
- None — these were never committed (untracked) and are fully superseded by `scripts/recategorize-products.ts`.

- [ ] **Step 1: Delete the untracked scratch files**

Run: `rm scripts/_tmp_explore_mods.ts scripts/_tmp_explore_mods2.ts scripts/_tmp_revert_categories.mjs`
Expected: files removed. `git status` shows nothing for them (they were untracked, not staged for deletion).

---

## Task 7: Manual verification

**Files:** none

- [ ] **Step 1: Start the dev server and check each category renders**

Run: `npm run dev`
Then visit `/catalog?cat=hair`, `/catalog?cat=nails`, `/catalog?cat=face`, `/catalog?cat=body`, `/catalog?cat=equipment` — each should show products, and `/catalog?cat=new` should show zero results (category no longer exists/populated).

- [ ] **Step 2: Check the admin categories page**

Visit `/admin/categories` (as an admin user) — confirm exactly 5 categories are listed (no "new"/"Разное"), and that `equipment`'s subcategory list includes `gift-ideas`, `consumables`, `salon-products`, `aprons-capes`, `hair-accessories`, `disinfection` alongside `furniture`, `tools`, `electrical-goods`; confirm `body`'s subcategory list includes `leg-care` and `hand-care`.

- [ ] **Step 3: Confirm the DB-stored category config wasn't accidentally frozen**

Run:
```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^\"|\"\$/g,'')]}));
const {Pool}=require('pg');
const pool=new Pool({connectionString:env.DATABASE_URL});
(async()=>{
  const r=await pool.query('SELECT key FROM \"KeyValueSetting\" WHERE key=\$1', ['categories-config']);
  console.log('rows:', r.rows.length);
  await pool.end();
})();
"
```
Expected: `rows: 0` — no stored override exists, meaning `/api/categories` and `/api/admin/categories` will keep serving the fresh defaults derived from `data/categories.ts`. If Step 2 involved clicking "Save" on the admin categories page, this row may now exist with the correct 5-category payload — that's fine, just confirm it matches (5 categories, no `new`) rather than being stale.

- [ ] **Step 4: Full unit + typecheck pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass.
