# Hairshop Pro — taxonomy sync / product lines: handoff (2026-10-30)

## Where

- Worktree: `C:\Users\User\eshop02-work\worktrees\eshop02-taxonomy-v2`
- Branch: `feature/2026-10-30-taxonomy-sync-v2-staging`, based on `origin/main` 5cb33783 (= production a056e854 + dda7e3cf).
- Nothing is pushed, merged or deployed. No production migration was run. Plesk sync was never started.
- The old Desktop tree `C:\Users\User\Desktop\eshop02` (branch `release/hairshop-catalog-sync-first-safe`,
  137250ad) holds Codex's original uncommitted stage-1/2 files and other unrelated changes. Do not use it for this
  work and do not reset it. Its schema "drift fix" was wrong (put `mfaVerified` on `PasswordResetToken`).

## Commits (local only)

| Stage | Commit | Content |
|---|---|---|
| 1–2 | `922a7922` | Taxonomy sync v2 contract, persistent staging (migration `20261030170000_taxonomy_snapshot_staging`), endpoint `/api/internal/hairshop-catalog-sync/taxonomy`, v1 apply lock fix (`$executeRaw` + bounded P2034 retry) |
| 3 | `7dd6a183` | BrandLine model + bootstrap/shadow reconciliation (migration `20261030200000_brand_line_bootstrap`), PowerShell client fixes (exact duplicate mappings, PS 5.1 JSON escapes) |
| 4 | `3ba86286` | Admin page `/admin/brand-lines` + API `app/api/admin/brand-lines/**`, RBAC (`catalog.read` / `catalog.update`), audit log |

Docs: `docs/hairshop-taxonomy-sync-v2.md`, `docs/hairshop-brand-lines-stage3.md` (stage 3 + stage 4 sections).

## Stage 5 (promotions by product line) — IN PROGRESS, UNCOMMITTED

Owner rules: keep "best single monetary discount" semantics (no stacking), keep free-shipping rules, extend the
existing promo-code and campaign mechanisms only (no second discount engine), validate ids server-side, no price
changes in the database, all stage-5 changes stay uncommitted until the owner says otherwise.

### Audit of the existing mechanism (done)

- Promo codes: table `PromoCode`; server evaluation `evaluatePromoCode` in `lib/server-pricing.ts`. Scopes `all`,
  `products`, `brands`, `categories`, `rules`; in `rules` the dimensions are ANDed, values inside one dimension ORed;
  `excludedProductIds`, `excludeSaleItems`, `maxDiscount`, `minEligibleAmount`. Admin API `app/api/admin/promo-codes`
  (permission via `requireAdmin` = `users.manage`), UI `app/[lang]/admin/marketing/discounts/page.tsx` +
  `promo-code-model.ts`.
- Campaigns: JSON array in `KeyValueSetting['promo-campaigns']`; `lib/promo-campaigns.ts` (`campaignMatchesProduct`,
  `evaluatePromoCampaigns` picks the single best discount campaign; `free_shipping` campaigns set a flag).
  Admin API `app/api/admin/campaigns`, UI `app/[lang]/admin/marketing/campaigns/page.tsx`.
- Order total: `recomputeOrderPricing` takes `max(promo code, best campaign)`; free shipping from a campaign applies
  independently. Cart/checkout use the same server functions via `/api/promo/validate`,
  `/api/promo/campaigns/evaluate`, `/api/orders`, `/api/v1/orders`.
- Storefront display of campaign prices: `attachCampaignOffers` (5 call sites in `lib/product-overrides-store.ts`,
  `lib/storefront-cache.ts`).
- Contradiction found and resolved: the task says "best discount per product", the code picks the best single
  discount per ORDER. Kept as is (behaviour of existing promotions unchanged); BrandLine is only a new filter.
- Adjacent bug (not fixed yet): the campaigns page calls `PromoProductsPreview` without `appliesTo`, so the preview
  ignores all campaign filters and counts the whole catalog. Planned: pass `appliesTo="rules"` there.

### Done in the working tree (typecheck passes, NO tests run yet)

- `prisma/schema.prisma` + `prisma/migrations/20261030230000_promo_code_brand_lines/migration.sql`:
  `PromoCode.brandLineIds TEXT[] DEFAULT ARRAY[]::TEXT[]` (additive). NOT yet applied anywhere, not even the test branch.
- `lib/brand-lines/brand-line-membership.ts`: effective membership = active `ProductBrandLine` links (sync or manual,
  `status = 'active'`) to a line or any descendant; excluded links and archived lines never count; helpers
  `loadEffectiveBrandLines`, `selectionMatches`, `productIdsInBrandLines`, `invalidBrandLineIds`, `brandLineIdList`.
- `lib/server-pricing.ts`: new scope `brand_lines`; in `rules` `brandLineIds` is one more ANDed dimension; membership
  is loaded only when the promo uses lines. `PricingDb` now includes `brandLine` and `productBrandLine`.
- `lib/promo-campaigns.ts`: `targetBrandLineIds` on `PromoCampaign`, `campaignMatchesProduct(campaign, product,
  effectiveBrandLines?)`, `loadCampaignBrandLines`, `attachCampaignOffersFromDb`; `evaluatePromoCampaigns` loads
  membership only if an active campaign targets lines.
- `lib/product-overrides-store.ts`, `lib/storefront-cache.ts`: the 5 display call sites use `attachCampaignOffersFromDb`.
- Admin API: `promo-codes` POST/PATCH accept `brandLineIds` and scope `brand_lines`, reject unknown/archived ids with
  `422 invalid_brand_lines` (PATCH checks only newly submitted ids); `campaigns` POST/PATCH accept and validate
  `targetBrandLineIds`; `promo-options` returns `brandLines` (`value`, `label` = "Brand › Line › Series", `parentId`,
  `brandKey`, `brandName`, `depth`, `names`); `promo-products-preview` supports `brandLineIds`.

### Remaining stage-5 work (exact next steps)

1. UI, discounts page: add `brandLineIds: string[]` to `PromoCodeItem`, `emptyPromoForm`, `normalizePromoCodeItem`,
   `isPromoScopeEmpty` (`brand_lines` and `rules`) in `promo-code-model.ts`; add scope option
   "Товарные линейки / Product lines / Produktu līnijas" (`brand_lines`); show a `PromoMultiSelect` of
   `catalogOptions.brandLines` for `brand_lines` and `rules`; pass `brandLineIds` to `PromoProductsPreview`; show
   selected lines in the list view.
2. UI, campaigns page: `targetBrandLineIds` in the form type, `emptyForm`, edit mapping (`?? []`), a `PromoMultiSelect`,
   preview with `appliesTo="rules"` and `brandLineIds`, list view.
3. `components/admin/promo/PromoMultiSelect.tsx` `usePromoCatalogOptions`: also return `brandLines`; build a localized
   label (RU/LV/EN from `names`, walking `parentId`, prefixed by `brandName`). `PromoProductsPreview`: accept
   `brandLineIds` and `appliesTo: 'brand_lines'`.
4. Optional consistency: revalidate storefront tags (`storefront-sale-products`, `storefront-bestsellers`) after
   BrandLine membership/line changes in `lib/brand-lines/brand-line-admin.ts` (display cache only; checkout is
   always computed live).
5. Apply the migration to the TEST branch only: `DATABASE_URL=<test url> npx prisma migrate deploy` from the worktree,
   then `migrate diff --from-config-datasource --to-schema prisma/schema.prisma` must be empty.
6. Tests to write/run (test branch only):
   - unit: `lib/brand-lines/brand-line-membership` (subtree, exclusions, archived), `server-pricing`
     (`brand_lines`, `rules` + lines, old promos unchanged), `promo-campaigns` (line target, display offers),
     admin promo/campaign routes (`invalid_brand_lines`, RBAC unchanged);
   - integration on the test branch: whole brand, parent line (includes child series), child series only, admin
     exclusion, manual inclusion, conflicting monetary discounts (best single wins), free shipping unchanged, promo
     code with lines, campaign with lines, legacy promos without lines, taxonomy resync keeps results, cart
     (`/api/promo/validate`, `/api/promo/campaigns/evaluate`) and checkout (`recomputeOrderPricing`), no change to
     product prices/stock/orders (44-table fingerprint).
7. Then tsc, eslint on changed files, `audit:security`, `audit:architecture`, `check:prisma`, `check:encoding`,
   unit suite, `build:plesk`. Leave stage 5 uncommitted and report.

## Test database (isolated Neon branch)

- Project `lively-resonance-45595963`; test branch **`br-wild-field-aqqqqlnz`** (endpoint `ep-empty-feather-aqiutjd0`),
  a copy of production (contains personal data). Must be kept. Production branch `br-late-cherry-aqvszfzq`
  (endpoint `ep-long-glitter-aq88pk3t`) is READ-ONLY.
- Connection string: `npx -y neonctl connection-string br-wild-field-aqqqqlnz --project-id lively-resonance-45595963 --pooled`
  with `NEON_API_KEY` taken from `C:\Users\User\Desktop\eshop02\.env.local` — never print the URL; always check it
  contains `ep-empty-feather-aqiutjd0` before use. The worktree has no `.env.local` on purpose.
- State: migrations up to `20261030200000` applied; real local snapshot loaded (533 categories, 231 manufacturers,
  14,198 product-category and 6,228 product-manufacturer edges); bootstrap applied (32 lines, 294 links); owner
  decisions recorded (4 hierarchy_divergence items resolved; FUDGE URBAN cat 2134 and DANDY cat 2008 OPEN, unmapped);
  one manual link (product 19490 → `black-professional/keratin-protein`). Temporary E2E accounts were removed.
- Warning: the integration suites (`vitest.taxonomy-postgres.config.ts`) TRUNCATE the taxonomy and BrandLine tables.
  After running them, restore with the snapshot loader and `scripts/brand-lines-bootstrap.ts --apply`
  (seed `C:\Temp\hairshop-pro-brand-lines-inventory.json`), then re-resolve the 4 hierarchy_divergence items.

## How to run things

- Integration (test branch only):
  `TAXONOMY_TEST_DATABASE_URL=<url> TAXONOMY_TEST_WRITE_ACK=isolated-branch npx vitest run --config vitest.taxonomy-postgres.config.ts`
- Bootstrap: `DATABASE_URL=<url> node --conditions=react-server --import tsx scripts/brand-lines-bootstrap.ts --seed <inventory.json> [--apply]`
  (`--apply` also needs `BRANDLINE_BOOTSTRAP_WRITE_ACK=isolated-branch`).
- Build: `DATABASE_URL=<test url> NEXT_PUBLIC_SITE_URL=https://hairshoppro.lv SMTP_HOST=smtp.invalid npm run build:plesk`.
- E2E: `next dev --webpack -p 3110` from the worktree with the test URL. Never use the personal `:3000` server — it
  points at production. Killing `next dev` leaves a `start-server.js` child on the port; stop it by command line.

## Known test baseline

- Windows unit baseline: **37 failures** in 9 files (`lib/sync/*wave*`, `*backfill*`, `*new-product-import*`,
  `final-safe-new-import`, `final-existing-backfill`, `controlled-first-wave`) with `ALLOWLIST_SHA_MISMATCH`, caused by
  `core.autocrlf=true` changing allowlist file hashes. They pass on Linux CI and are NOT regressions.
  Last full run (stage 4): 2733 passed / 37 baseline failures, 0 new failures. Stage 5 unit tests not run yet.
- Lint: 63 warnings repository-wide, all pre-existing; new files must add none.

## Open decisions for the owner

- FUDGE URBAN and DANDY: brand or line (left in the review queue).
- Commit of stage 5 (owner asked to keep it uncommitted).
- Production rollout of migrations `20261030170000`, `20261030200000`, `20261030230000` and of the v2 endpoint
  (requires `HAIRSHOP_TAXONOMY_SYNC_WRITE_ENABLED`) — not started, needs explicit owner approval.

## Restrictions (unchanged)

Production Neon read-only; no nopCommerce changes; no Plesk sync; no push/merge/deploy; no production env changes;
keep the test branch; no second discount engine; do not change GrinS rules; do not alter existing promotions.
