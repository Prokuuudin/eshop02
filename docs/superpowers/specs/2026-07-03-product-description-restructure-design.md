# Product Description Restructure — Design

**Date:** 2026-07-03
**Status:** Approved by user (chat, 2026-07-03)

## Problem

Product page description must come from Neon DB, be shown in full (no truncation, no fabricated
content), in the user's selected language, and be structured as "short description + up to 4
feature bullets" (fields already exist in schema, admin, and layout).

Current state after commit 708f737:

- DB has full descriptions in 3 languages: RU in `Product.description` (6026/6378),
  EN/LV in `technicalSpecs.__descriptionEn/__descriptionLv` (~6012/6027).
- `feature1-4` (+En/Lv) filled only for ~816 products whose source HTML had bold sub-labels.
- Paragraph breaks were collapsed to single spaces by `scripts/parse-descriptions.ts` —
  long descriptions render as a single wall of text.
- 352 products have no description; the page shows a fabricated generic i18n string
  (`product.descriptionText`). List: `C:/Temp/products-without-description.csv`.
- Admin: `__descriptionEn/__descriptionLv` leak into the "Technical specs" key-value rows
  (only `__variantGroupsJson` is filtered); there are no proper "Description (EN)/(LV)" fields,
  so translated descriptions are effectively uneditable.

## Decisions (user-confirmed)

1. **No description in DB** → keep the "Description" block visible with a muted
   "no description" placeholder (i18n RU/EN/LV). No fabricated marketing text.
2. **Restore paragraphs** → re-run the backfill from `C:/Temp/migration/localized_descriptions.json`
   with paragraph-preserving parsing; render paragraphs on the page.
3. **Products without label structure (~5200)** → sentence-based split:
   short description = first 2 sentences, following sentences become feature bullets
   (one sentence per bullet, bullet 4 absorbs the remainder). Text order and wording preserved.
4. **Admin** → proper textarea fields "Description (EN)" / "Description (LV)" writing to
   `technicalSpecs.__descriptionEn/Lv`; hide ALL `__`-prefixed keys from tech-spec rows and
   carry them through saves untouched.

## Design

### 1. Parsing (`scripts/parse-descriptions.ts`)

- `stripAndDecode`: before stripping tags, convert block-level boundaries
  (`</p>`, `<br>`, `</li>`, `</div>`, `</h1..6>`, `</tr>`) to `\n`; strip remaining tags;
  decode entities; collapse spaces within lines; collapse 3+ newlines to `\n\n`; trim.
- Label-based split (existing `LABEL_TAG_RE` / ingredients logic) unchanged for products
  with bold sub-labels; their intro keeps paragraphs.
- New sentence split for label-less products (`features.length === 0` after label pass):
  - Sentence boundary: `[.!?…]` + whitespace + next char uppercase letter or digit-followed-by
    non-digit context; do NOT split after known abbreviations (т.д., т.п., мл., гр., ml., e.g.,
    i.e., piem., u.c., utt.) or inside decimal numbers (digit.digit).
  - ≤ 2 sentences → whole text stays in `description`, no features.
  - ≥ 3 sentences → `description` = sentences 1–2; sentences 3..N map to feature1..feature4,
    one sentence per feature; if N > 6, feature4 = sentences 6..N joined with a space.
  - Sentence split runs per language independently (RU/EN/LV).
- Ingredients blocks keep going to `technicalSpecs["<label>"]` (RU source), as today.
- Invariant: every source word ends up in exactly one of description / features /
  technicalSpecs; order preserved.

### 2. Backfill (`scripts/backfill-descriptions-i18n.ts`)

- Re-run with the updated parser over all products present in
  `C:/Temp/migration/localized_descriptions.json` (RU → base fields, EN → `*En` +
  `__descriptionEn`, LV → `*Lv` + `__descriptionLv`).
- `technicalSpecs` update stays a JSONB merge (`||`), so `__variantGroupsJson` and other
  keys survive.
- Known risk (accepted): overwrites any manual description/feature edits made after 708f737.

### 3. Frontend

- `components/ProductDescription.tsx`: split description on `\n\n` and render one `<p>` per
  paragraph (spacing via CSS, e.g. `space-y-2`). When description is empty, render the block
  heading + muted placeholder `t('product.noDescription')`.
- `hooks/useProductLocalization.ts`: drop the final fabricated fallback
  `t('product.descriptionText')` — return `''` instead. Keep the language fallback chain:
  localized (`__descriptionEn/Lv`) → RU base → per-product i18n key → `''`.
- `data/translations.ts`: add `product.noDescription` for ru/en/lv
  (ru: «Описание отсутствует», en: "No description available", lv: "Apraksts nav pieejams").
  `product.descriptionText` entries become unused and are removed.
- Features rendering unchanged (`ProductFeatures` bullets below the description).

### 4. Admin

- `productFormSchema.ts`: add optional `descriptionEn`, `descriptionLv` strings.
- `ProductTranslationsFields.tsx`: textareas "Описание (EN)" and "Описание (LV)".
- `lib/product-form-mapping.ts`:
  - `mapProductToFormValues`: populate `descriptionEn/Lv` from
    `technicalSpecs.__descriptionEn/Lv`; filter ALL keys starting with `__` out of the
    tech-spec rows (today only `__variantGroupsJson`).
  - `mapFormValuesToProductPatch`: after rebuilding `technicalSpecs` from rows, re-attach
    `__variantGroupsJson` (existing), `__descriptionEn/Lv` from the new fields, and any other
    `__`-prefixed keys from the original product's `technicalSpecs` (new optional argument),
    so reserved keys never get wiped by an admin save.
- Public rendering of tech specs already filters `__` keys (`components/TechnicalSpecs.tsx`) —
  no change.

## Out of scope

- No Prisma schema changes (constraint: live-DB schema frozen; reserved `__` keys convention).
- No auto-generation of missing descriptions for the 352 products.
- No changes to meta/OG description or JSON-LD.

## Testing

- Unit tests for the sentence splitter and paragraph-preserving `stripAndDecode`
  (abbreviations, decimals, ≤2 sentences, >6 sentences overflow, multi-paragraph).
- `--sample=N` dry-run of the parser over migration JSON before writing to Neon.
- Post-backfill SQL spot checks: counts per language, no empty-but-was-filled regressions.
- Manual page check: RU/EN/LV switch, paragraphs, features bullets, placeholder product.
