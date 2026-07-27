# Product Description Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product page shows the full Neon DB description in the user's language, split into "short description + up to 4 feature bullets", with paragraphs preserved, no fabricated fallback text, and admin-editable EN/LV description translations.

**Architecture:** Re-parse source descriptions (`C:/Temp/migration/localized_descriptions.json`) with a paragraph-preserving, sentence-splitting parser and re-run the existing backfill into Neon. Frontend renders paragraphs and an honest empty state. Admin gets `descriptionEn/Lv` textareas that round-trip through the reserved `technicalSpecs.__descriptionEn/Lv` keys; all `__` keys are hidden from the spec-rows editor and preserved on save.

**Tech Stack:** Next.js (App Router), TypeScript, Prisma/Neon Postgres (no schema changes), react-hook-form + zod, vitest, `he` for entity decoding, `pg` for backfill scripts.

**Spec:** `docs/superpowers/specs/2026-07-03-product-description-restructure-design.md`

## Global Constraints

- No Prisma schema changes — live-DB schema is frozen; use existing columns + reserved `__` keys in `technicalSpecs` (JSONB).
- No fabricated content: every displayed word must come from DB (or be an honest "no description" placeholder).
- Wording and word order of source descriptions must never change — only structure (paragraphs, sentence grouping).
- Reserved keys convention: `technicalSpecs` keys starting with `__` are internal (`__variantGroupsJson`, `__descriptionEn`, `__descriptionLv`) and must never render publicly or be lost by admin saves.
- After each task's commit: `git push origin main` (user preference).
- Windows environment; run node scripts from repo root `c:/Users/User/Desktop/hairshop-pro.lv`.

---

### Task 1: Paragraph-preserving parser + sentence splitter

**Files:**
- Modify: `scripts/parse-descriptions.ts`
- Modify: `vitest.config.ts` (add `scripts/**/*.test.ts` to include)
- Test: `scripts/parse-descriptions.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseDescription(rawHtml: string): ParsedDescription` (same signature, new behavior: `description` may contain `\n\n` paragraph breaks; label-less multi-sentence text is split into short description + features). New export `splitSentences(text: string): string[]`.

- [ ] **Step 1: Add `scripts/**/*.test.ts` to vitest include**

In `vitest.config.ts` replace:

```ts
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts', 'app/**/*.test.ts'],
```

with:

```ts
    include: ['lib/**/*.test.ts', 'data/**/*.test.ts', 'app/**/*.test.ts', 'scripts/**/*.test.ts'],
```

- [ ] **Step 2: Write failing tests**

Create `scripts/parse-descriptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseDescription, splitSentences } from './parse-descriptions'

describe('splitSentences', () => {
  it('splits on sentence terminators followed by an uppercase/digit start', () => {
    expect(splitSentences('Дозировка 1.5 мл на литр воды. Хранить в тёмном месте.')).toEqual([
      'Дозировка 1.5 мл на литр воды.',
      'Хранить в тёмном месте.',
    ])
  })

  it('does not split after dotted abbreviations or single-letter initials', () => {
    expect(
      splitSentences('Содержит витамины A и E и т.д. Также питает кожу головы.')
    ).toHaveLength(1)
  })

  it('keeps numbered list markers attached to their sentence', () => {
    expect(
      splitSentences('Способ применения. 1. Нанесите средство на волосы. 2. Смойте тёплой водой.')
    ).toEqual([
      'Способ применения.',
      '1. Нанесите средство на волосы.',
      '2. Смойте тёплой водой.',
    ])
  })

  it('treats newlines as hard boundaries', () => {
    expect(splitSentences('Первая строка без точки\nВторая строка.')).toEqual([
      'Первая строка без точки',
      'Вторая строка.',
    ])
  })
})

describe('parseDescription', () => {
  it('preserves paragraph breaks from block-level HTML', () => {
    const result = parseDescription('<p>Первый абзац.</p><p>Второй абзац.</p>')
    expect(result.description).toBe('Первый абзац.\n\nВторой абзац.')
    expect(result.features).toEqual([])
  })

  it('decodes HTML entities', () => {
    const result = parseDescription('<p>Matu &scaron;ampūns. Der visiem matu tipiem.</p>')
    expect(result.description).toBe('Matu šampūns. Der visiem matu tipiem.')
  })

  it('still extracts bold-labelled sections as features (flattened to one line)', () => {
    const result = parseDescription(
      '<p>Интро текст.</p><p><strong>Lietošana:</strong> наносить на влажные волосы.</p>'
    )
    expect(result.description).toBe('Интро текст.')
    expect(result.features).toEqual(['Lietošana: наносить на влажные волосы.'])
  })

  it('still routes ingredients to technicalSpecs', () => {
    const result = parseDescription(
      '<p>Крем для рук.</p><p><strong>Состав:</strong> aqua, glycerin, parfum</p>'
    )
    expect(result.description).toBe('Крем для рук.')
    expect(result.technicalSpecs).toEqual({ 'Состав': 'aqua, glycerin, parfum' })
    expect(result.features).toEqual([])
  })

  it('sentence-splits label-less text: 2 sentences to description, rest to max 4 features', () => {
    const result = parseDescription(
      '<p>Шампунь мягко очищает волосы. Подходит для ежедневного применения. ' +
        'Укрепляет корни. Придает блеск. Защищает цвет. Облегчает расчесывание. ' +
        'Не содержит сульфатов.</p>'
    )
    expect(result.description).toBe(
      'Шампунь мягко очищает волосы. Подходит для ежедневного применения.'
    )
    expect(result.features).toEqual([
      'Укрепляет корни.',
      'Придает блеск.',
      'Защищает цвет.',
      'Облегчает расчесывание. Не содержит сульфатов.',
    ])
  })

  it('leaves short label-less text (<= 2 sentences) intact without features', () => {
    const result = parseDescription('<p>Первое предложение. Второе предложение.</p>')
    expect(result.description).toBe('Первое предложение. Второе предложение.')
    expect(result.features).toEqual([])
  })

  it('does not sentence-split when labelled features already exist', () => {
    const result = parseDescription(
      '<p>Одно. Два. Три. Четыре.</p><p><strong>Lietošana:</strong> наносить.</p>'
    )
    expect(result.description).toBe('Одно. Два. Три. Четыре.')
    expect(result.features).toEqual(['Lietošana: наносить.'])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run scripts/parse-descriptions.test.ts`
Expected: FAIL — `splitSentences` is not exported; paragraph/sentence expectations fail.

- [ ] **Step 4: Implement parser changes**

In `scripts/parse-descriptions.ts`:

Replace `stripAndDecode` with:

```ts
const flattenWs = (s: string): string => s.replace(/\s+/g, ' ').trim()

function stripAndDecode(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|table)\s*>/gi, '\n\n')
    .replace(/<\/\s*(li|tr)\s*>/gi, '\n')
  const noTags = withBreaks.replace(/<[^>]*>/g, ' ')
  const decoded = decode(noTags)
  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}
```

Add the sentence splitter (below `stripAndDecode`):

```ts
// Deliberately conservative: a missed split leaves a longer sentence (harmless),
// a false split chops a sentence in half (visible damage).
const ABBREVIATIONS = new Set([
  'мл', 'гр', 'кг', 'шт', 'др', 'арт', 'ок', 'см', 'мм', 'руб',
  'ml', 'gr', 'oz', 'no', 'nr', 'approx', 'inc', 'ltd', 'art',
  'piem', 'utt', 'gab', 'min', 'max',
])

const SENTENCE_START_RE = /[A-ZА-ЯЁĀČĒĢĪĶĻŅŠŪŽ0-9«"„(]/

function splitLine(line: string): string[] {
  const sentences: string[] = []
  let start = 0
  const re = /[.!?…]+\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const next = line.charAt(m.index + m[0].length)
    if (!next || !SENTENCE_START_RE.test(next)) continue
    const lastWord = line.slice(start, m.index).split(/\s+/).pop() ?? ''
    const bare = lastWord.replace(/[()«»"„'’]/g, '')
    if (bare.includes('.') || /^\p{L}$/u.test(bare)) continue
    if (ABBREVIATIONS.has(bare.toLowerCase())) continue
    const terminatorEnd = m.index + m[0].trimEnd().length
    const candidate = line.slice(start, terminatorEnd).trim()
    if (candidate.length < 4) continue
    sentences.push(candidate)
    start = m.index + m[0].length
  }
  const tail = line.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((chunk) => splitLine(chunk.trim()))
    .filter(Boolean)
}
```

Replace the body of `parseDescription` with:

```ts
export function parseDescription(rawHtml: string): ParsedDescription {
  const chunks = splitIntoChunks(rawHtml)
  let description = ''
  const features: string[] = []
  const technicalSpecs: Record<string, string> = {}
  const overflow: string[] = []

  for (const chunk of chunks) {
    const text = stripAndDecode(chunk.html)
    if (!text) continue
    const label = chunk.label === null ? null : decode(chunk.label).trim()

    if (label === null || DESCRIPTION_LABEL_RE.test(label)) {
      description = description ? `${description}\n\n${text}` : text
    } else if (INGREDIENT_LABEL_RE.test(label)) {
      technicalSpecs[label] = flattenWs(text)
    } else if (features.length < 4) {
      features.push(flattenWs(`${label}: ${text}`))
    } else {
      overflow.push(flattenWs(`${label}: ${text}`))
    }
  }

  if (overflow.length > 0) {
    const tail = overflow.join('\n\n')
    description = description ? `${description}\n\n${tail}` : tail
  }

  // Label-less text: first 2 sentences stay as the short description, the rest
  // become feature bullets (one sentence each, bullet 4 absorbs the remainder).
  if (features.length === 0 && description) {
    const sentences = splitSentences(description)
    if (sentences.length >= 3) {
      description = sentences.slice(0, 2).join(' ')
      const rest = sentences.slice(2)
      if (rest.length <= 4) {
        features.push(...rest)
      } else {
        features.push(rest[0], rest[1], rest[2], rest.slice(3).join(' '))
      }
    }
  }

  return { description: description || null, features, technicalSpecs }
}
```

Everything else (label regexes, `splitIntoChunks`, `main`) stays as is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run scripts/parse-descriptions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Run the full unit suite (regression)**

Run: `npm run test:unit`
Expected: PASS — existing suites unaffected.

- [ ] **Step 7: Dry-run on real migration data**

Run: `npx tsx scripts/parse-descriptions.ts --sample=8`
Expected: printed samples show `\n\n` paragraphs in descriptions, sensible sentence-based features on label-less products, no chopped words. Eyeball for damage before touching the DB.

- [ ] **Step 8: Commit and push**

```bash
git add vitest.config.ts scripts/parse-descriptions.ts scripts/parse-descriptions.test.ts
git commit -m "feat(scripts): paragraph-preserving parse + sentence-split features for descriptions"
git push origin main
```

---

### Task 2: Re-run backfill into Neon + verify

**Files:**
- Run: `scripts/backfill-descriptions-i18n.ts` (no code change — it imports the updated parser)
- Create (temp, delete after): `scripts/_tmp_verify_backfill.mjs`
- Delete after use: `scripts/_tmp_check_desc.mjs`, `scripts/_tmp_list_no_desc.mjs` (leftovers from investigation)

**Interfaces:**
- Consumes: `parseDescription` from Task 1; `C:/Temp/migration/localized_descriptions.json`.
- Produces: Neon `Product` rows updated: `description`, `feature1-4(:En/Lv)`, `technicalSpecs.__descriptionEn/Lv` recomputed. Accepted risk (user-approved): overwrites manual edits made after commit 708f737.

- [ ] **Step 1: Capture pre-run counts**

Create `scripts/_tmp_verify_backfill.mjs`:

```js
import { config } from 'dotenv'
config({ path: '.env.local' })
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL,
  max: 2,
  connectionTimeoutMillis: 30000,
})

const [row] = (await pool.query(`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE description IS NOT NULL AND description <> '')::int AS with_desc,
    COUNT(*) FILTER (WHERE description LIKE E'%\\n%')::int AS desc_with_newlines,
    COUNT(*) FILTER (WHERE feature1 IS NOT NULL)::int AS with_f1,
    COUNT(*) FILTER (WHERE "feature1En" IS NOT NULL)::int AS with_f1_en,
    COUNT(*) FILTER (WHERE "feature1Lv" IS NOT NULL)::int AS with_f1_lv,
    COUNT(*) FILTER (WHERE "technicalSpecs" ? '__descriptionEn')::int AS with_desc_en,
    COUNT(*) FILTER (WHERE "technicalSpecs" ? '__descriptionLv')::int AS with_desc_lv,
    COUNT(*) FILTER (WHERE "technicalSpecs" ? '__variantGroupsJson')::int AS with_variants
  FROM "Product"
`)).rows
console.log(JSON.stringify(row, null, 2))

const samples = (await pool.query(`
  SELECT id, title, description, feature1, feature2, feature3, feature4
  FROM "Product"
  WHERE feature1 IS NOT NULL AND description LIKE E'%\\n%'
  ORDER BY random() LIMIT 2
`)).rows
for (const s of samples) console.log('\n===', s.id, s.title, '\n', JSON.stringify(s, null, 2))
await pool.end()
```

Run: `node scripts/_tmp_verify_backfill.mjs`
Expected (pre-run baseline, roughly): `with_desc` 6026, `desc_with_newlines` 0, `with_f1` 816, `with_desc_en` 6012, `with_desc_lv` 6027, `with_variants` > 0 (note the exact number — must not drop). Sample query returns 0 rows pre-run — fine.

- [ ] **Step 2: Run the backfill**

Run: `npx tsx scripts/backfill-descriptions-i18n.ts`
Expected: `Products with localized descriptions: <N>` then progress and `✓ Updated <N> products` without errors. Retries on transient Neon connection errors are built in.

- [ ] **Step 3: Verify post-run state**

Run: `node scripts/_tmp_verify_backfill.mjs`
Expected:
- `with_desc` ≈ 6026 (same magnitude; must not collapse),
- `desc_with_newlines` > 0 (thousands — paragraphs restored),
- `with_f1` in the thousands (sentence-split products joined the 816 labelled ones),
- `with_desc_en` / `with_desc_lv` ≈ previous values,
- `with_variants` exactly the pre-run number (JSONB merge preserved variants),
- samples read as sane Russian text, no chopped words, features are whole sentences.

If `with_variants` dropped or descriptions look damaged: STOP, report, do not proceed.

- [ ] **Step 4: Clean up temp scripts**

```bash
rm scripts/_tmp_verify_backfill.mjs scripts/_tmp_check_desc.mjs scripts/_tmp_list_no_desc.mjs
```

(All three are untracked — nothing to commit. Do NOT touch the pre-existing `_tmp_explore_mods*.ts` / `_tmp_revert_categories.mjs` — not ours.)

---

### Task 3: Frontend — paragraphs + honest empty state

**Files:**
- Modify: `hooks/useProductLocalization.ts:27`
- Modify: `data/translations.ts:839,2301,4087`
- Modify: `components/ProductDescription.tsx`

**Interfaces:**
- Consumes: `productDescription` string possibly containing `\n\n` (Task 2 data); may be `''` when DB has nothing.
- Produces: `ProductDescription` renders one `<p>` per paragraph; empty description → muted `t('product.noDescription')` placeholder. `useProductLocalization` never returns fabricated marketing text.

- [ ] **Step 1: Drop the fabricated fallback in `useProductLocalization.ts`**

Replace line 27:

```ts
    return fromI18n !== `${productBaseKey}.description` ? fromI18n : t('product.descriptionText');
```

with:

```ts
    return fromI18n !== `${productBaseKey}.description` ? fromI18n : '';
```

- [ ] **Step 2: Swap translation keys in `data/translations.ts`**

Replace each of the three `product.descriptionText` lines (ru:839, en:2301, lv:4087) in place:

```ts
    'product.noDescription': 'Описание отсутствует',
```

```ts
    'product.noDescription': 'No description available',
```

```ts
    'product.noDescription': 'Apraksts nav pieejams',
```

- [ ] **Step 3: Paragraph rendering + placeholder in `ProductDescription.tsx`**

Replace the component body:

```tsx
export const ProductDescription: React.FC<ProductDescriptionProps> = ({
    description,
    features,
    productId,
}) => {
    const { t } = useTranslation();
    const paragraphs = description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    return (
        <div className="product-detail__description mt-6 text-gray-700 dark:text-gray-300">
            <h2 className="text-lg font-semibold mb-2">{t('product.description')}</h2>
            {paragraphs.length > 0 ? (
                <div className="space-y-2">
                    {paragraphs.map((paragraph, index) => (
                        <p key={`${productId}-desc-${index}`} className="whitespace-pre-line">
                            {paragraph}
                        </p>
                    ))}
                </div>
            ) : (
                <p className="text-sm italic text-gray-400 dark:text-gray-500">
                    {t('product.noDescription')}
                </p>
            )}
            {Array.isArray(features) && features.length > 0 && (
                <ul className="list-disc list-inside mt-3 text-sm space-y-1">
                    {features.map((feature, index) => (
                        <li key={`${productId}-feature-${index}`}>{feature}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};
```

(Props interface unchanged.)

- [ ] **Step 4: Verify no stale key references remain**

Run: `rg -n "descriptionText" --glob "!docs/**"`
Expected: no matches.

- [ ] **Step 5: Regression + lint**

Run: `npm run test:unit` then `npm run lint`
Expected: PASS / no new errors.

- [ ] **Step 6: Commit and push**

```bash
git add hooks/useProductLocalization.ts data/translations.ts components/ProductDescription.tsx
git commit -m "feat(product): multi-paragraph descriptions, honest empty state instead of fabricated text"
git push origin main
```

---

### Task 4: Admin — EN/LV description fields + reserved-key safety

**Files:**
- Modify: `components/admin/products/productFormSchema.ts` (fields near `description` at line 23 and near `technicalSpecs` at line 51)
- Modify: `lib/product-form-mapping.ts`
- Modify: `components/admin/products/AddProductForm.tsx` (emptyDefaults, lines 51 and 69)
- Modify: `components/admin/products/ProductTranslationsFields.tsx` (EN section after line 88, LV section after line 125)
- Test: `lib/product-form-mapping.test.ts`

**Interfaces:**
- Consumes: `Product.technicalSpecs` reserved keys `__descriptionEn`, `__descriptionLv`, `__variantGroupsJson`.
- Produces: form fields `descriptionEn?: string`, `descriptionLv?: string`, `reservedTechSpecs?: Record<string, string>` on `AddProductFormValues`; patch keeps every `__` key across saves.

- [ ] **Step 1: Write failing tests**

Append to `lib/product-form-mapping.test.ts`:

```ts
describe('description translations round-trip through technicalSpecs', () => {
  it('extracts __descriptionEn/Lv into form fields and hides all __ keys from spec rows', () => {
    const product: Product = {
      ...baseProduct,
      technicalSpecs: {
        'Объём': '50 мл',
        __descriptionEn: 'English text',
        __descriptionLv: 'Latvian text',
        __futureReserved: 'x',
      },
    }
    const values = mapProductToFormValues(product)
    expect(values.descriptionEn).toBe('English text')
    expect(values.descriptionLv).toBe('Latvian text')
    expect(values.technicalSpecs).toEqual([{ key: 'Объём', value: '50 мл' }])
    expect(values.reservedTechSpecs).toEqual({ __futureReserved: 'x' })
  })

  it('writes edited description translations and untouched reserved keys back into the patch', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { 'Тип': 'крем', __descriptionEn: 'Old EN', __futureReserved: 'x' },
    })
    values.descriptionEn = 'New EN'
    values.descriptionLv = 'Jauns LV'
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      'Тип': 'крем',
      __futureReserved: 'x',
      __descriptionEn: 'New EN',
      __descriptionLv: 'Jauns LV',
    })
  })

  it('drops __description keys when the admin empties the fields', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { __descriptionEn: 'EN' },
    })
    values.descriptionEn = ''
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/product-form-mapping.test.ts`
Expected: FAIL — `descriptionEn` / `reservedTechSpecs` undefined on form values; `__descriptionEn` leaks into `values.technicalSpecs` rows.

- [ ] **Step 3: Extend the zod schema**

In `components/admin/products/productFormSchema.ts`, after `description: z.string().optional(),` (line 23) add:

```ts
  descriptionEn: z.string().optional(),
  descriptionLv: z.string().optional(),
```

After the `technicalSpecs: z.array(...)` line (line 51) add:

```ts
  // Служебные __-ключи technicalSpecs (кроме вариантов и переводов описания) —
  // проносятся через форму нетронутыми, в списке характеристик не показываются
  reservedTechSpecs: z.record(z.string(), z.string()).optional(),
```

- [ ] **Step 4: Update `lib/product-form-mapping.ts`**

In `mapProductToFormValues`, after the `description:` line add:

```ts
        descriptionEn: product.technicalSpecs?.__descriptionEn ?? '',
        descriptionLv: product.technicalSpecs?.__descriptionLv ?? '',
```

Replace the `technicalSpecs:` block (lines 37-39) with:

```ts
        technicalSpecs: Object.entries(product.technicalSpecs ?? {})
            .filter(([key]) => !key.startsWith('__'))
            .map(([key, value]) => ({ key, value })),
        reservedTechSpecs: Object.fromEntries(
            Object.entries(product.technicalSpecs ?? {}).filter(
                ([key]) =>
                    key.startsWith('__') &&
                    !['__variantGroupsJson', '__descriptionEn', '__descriptionLv'].includes(key)
            )
        ),
```

In `mapFormValuesToProductPatch`, replace the `techSpecs` computation (lines 87-95) with:

```ts
    const techSpecs = values.technicalSpecs
        .filter((s) => s.key.trim() && !s.key.trim().startsWith('__'))
        .reduce<Record<string, string>>((acc, { key, value }) => {
            acc[key] = value;
            return acc;
        }, {});
    Object.assign(techSpecs, values.reservedTechSpecs ?? {});
    if (values.variantGroups.length > 0) {
        techSpecs['__variantGroupsJson'] = JSON.stringify(values.variantGroups);
    }
    if (values.descriptionEn?.trim()) {
        techSpecs['__descriptionEn'] = values.descriptionEn;
    }
    if (values.descriptionLv?.trim()) {
        techSpecs['__descriptionLv'] = values.descriptionLv;
    }
```

- [ ] **Step 5: Update `emptyDefaults` in `AddProductForm.tsx`**

After `description: '',` (line 51) add:

```ts
    descriptionEn: '',
    descriptionLv: '',
```

After `technicalSpecs: [],` (line 69) add:

```ts
    reservedTechSpecs: {},
```

- [ ] **Step 6: Add textareas in `ProductTranslationsFields.tsx`**

EN section — after the Purpose div (closes line 88), inside the same `add-product__fields-grid`:

```tsx
                    <div>
                        <label className="block text-sm font-medium mb-1">Full description</label>
                        <Textarea placeholder="Full product description" {...register('descriptionEn')} />
                    </div>
```

LV section — after the Mērķis div (closes line 125), inside the same `add-product__fields-grid`:

```tsx
                <div>
                    <label className="block text-sm font-medium mb-1">Pilns apraksts</label>
                    <Textarea placeholder="Pilns produkta apraksts" {...register('descriptionLv')} />
                </div>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run lib/product-form-mapping.test.ts`
Expected: PASS — new tests and the four pre-existing variant-group tests.

- [ ] **Step 8: Regression + lint**

Run: `npm run test:unit` then `npm run lint`
Expected: PASS / no new errors.

- [ ] **Step 9: Commit and push**

```bash
git add components/admin/products/productFormSchema.ts lib/product-form-mapping.ts components/admin/products/AddProductForm.tsx components/admin/products/ProductTranslationsFields.tsx lib/product-form-mapping.test.ts
git commit -m "feat(admin): edit EN/LV description translations, hide and preserve reserved spec keys"
git push origin main
```

---

### Task 5: End-to-end verification on the running app

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything above; Neon data from Task 2.

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (background). Wait for `Ready`.

- [ ] **Step 2: Check a product with sentence-split features**

Pick an id from Task 2 Step 3 samples (feature1 NOT NULL, description with `\n`). Fetch `http://localhost:3000/product/<id>` and check the SSR HTML contains:
- the short description paragraphs (`product-detail__description` block with `<p>` per paragraph),
- `product-detail__features` list with the sentence bullets.

- [ ] **Step 3: Check a product without description**

Pick an id from `C:/Temp/products-without-description.csv`. Fetch its page; expect the «Описание» heading with the muted placeholder text, not fabricated marketing copy.

- [ ] **Step 4: Check language switching**

On a product with EN/LV translations, verify EN and LV descriptions differ from RU (language switcher or the localized description in page payload).

- [ ] **Step 5: Report**

Summarize verification results to the user: counts from Task 2, pages checked, any anomalies.
