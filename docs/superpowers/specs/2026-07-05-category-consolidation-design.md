# Category consolidation to 5 sections

## Goal

Site-wide product categories reduced to exactly 5: Уход за волосами (`hair`), Уход за ногтями (`nails`), Уход за кожей (`face`), Уход за телом (`body`), Аксессуары и инструменты (`equipment`). Existing category ids are kept unchanged — only the `new` (Разное) category is removed and its products/subcategories redistributed. Every one of the ~6378 live products gets reclassified.

## Background

`Product.category` was last bulk-rewritten on 2026-06-28 using a confident multi-tag map built from the real MSSQL `Category` table (each product can carry several category tags, including brand-as-category noise). That fix produced a healthy spread (hair=3705, face=649, body=693, nails=322, equipment=691, new=318). Since then, an uncommitted script (`scripts/_tmp_revert_categories.mjs`) reverted the DB back to the old broken single-tag mapping (hair=5729/90%, body=0). This project redoes the classification from scratch, straight into the final 5-category scheme, using two artifacts recovered from that prior session:

- `C:/Temp/product_category_map.json` — 14,206 rows, `{productId, catName}`, multi-tag per product (6315 distinct products, 284 distinct tag names)
- `C:/Temp/full_category_tree.json` — real MSSQL `Category` table (`Id`, `Name`, `ParentCategoryId`), showing which tag names are real taxonomy leaves vs. brand names vs. structural nodes

## Classification rules

1. For each product, collect **all** its tags from `product_category_map.json` (not just the first).
2. Map each tag through a curated dictionary of functional leaf names → one of the 5 buckets. Brand names, promo tags (AKCIJAS/DĀVANAS/JAUNUMI), and structural nodes (KATEGORIJAS, BRANDS, DAŽĀDI, etc.) are not in the dictionary and are ignored during matching.
3. If the product's matched tags resolve to a single bucket, use it.
4. If tags resolve to multiple different buckets (multi-category product, e.g. shampoo + men's perfume), apply priority order: `body > face > nails > equipment > hair` (same order proven in the 2026-06-28 fix).
5. If no tag matches the dictionary at all (only brand/promo/structural tags), fall back to `equipment` — not `hair` — to avoid re-inflating hair the way the old broken mapping did.
6. Products not present in the MSSQL tag map (no id match — e.g. products created directly via admin, not from migration) are left with their current category untouched, unless that category is `new`, in which case they fall back to `equipment` too.

### Specific bucket decisions (confirmed with user)

- Hand/foot care (`KĀJĀM`, `ROKĀM`, `GEHWOL`, and similar) → `body`, even though MSSQL nests them under its own "skin care" tree.
- Decorative makeup (mascara, lipstick, powder, foundation, concealer, make-up accessories) → `face`.
- Perfumery (`SIEVIEŠU/VĪRIEŠU SMARŽAS`, `PARFIMĒRIJA`) → `body`.
- Manicure/pedicure tools (files, scissors, cuticle pushers, UV gel helpers) stay in `nails`, not `equipment` — matches the existing `nails` subcategory list in `data/categories.ts`.
- Combs, hairbrushes, hair clippers, hairdryers, styling tools → `equipment`.
- Unrelated household-appliance categories present in the MSSQL tree as catalog noise (vacuum cleaners, kettles, toasters, ovens, grills, steamers, scales, toothbrushes — roughly 40 tag-instances total) → `equipment` as the catch-all, same as rule 5.
- Salon furniture, uniforms/workwear, disinfection, salon consumables/supplies, gift sets → `equipment`.

## Subcategories (`data/categories.ts`)

- Move `leg-care` and `hand-care` out of `face`'s subcategory list into `body`'s (their products now live in `body`).
- Remove the `new` category card entirely. Its 6 subcategories (gift-ideas, consumables, salon-products, aprons-capes, hair-accessories, disinfection) all move under `equipment`, alongside the existing `furniture`, `tools`, `electrical-goods`.
- `hair`, `nails` subcategory lists are unchanged.

## Code changes

- `data/categories.ts` — drop the `new` entry from `CATEGORY_CARDS`; update `SUBCATEGORIES_BY_ID` per above.
- `data/products.ts` — drop `'new'` from `CategoryType`.
- `lib/admin/products/constants.ts`, `components/admin/products/productFormSchema.ts` — drop `'new'` from category enums/lists.
- `app/api/admin/import/route.ts`, `app/api/admin/import/preview/route.ts` — drop `'new'` from `VALID_CATEGORIES`.
- `app/admin/products/bulk-price/page.tsx`, `app/admin/marketing/campaigns/page.tsx` — drop `'new'` option.
- `components/MobileMenu.tsx`, `components/TopCategories.tsx` — drop the "new" menu/card entry.
- `e2e/critical-flows.spec.ts` — the "misc category salon products subcategory" test currently navigates `cat=new&subcat=salon-products`; repoint it to `cat=equipment&subcat=salon-products`.
- `data/translations.ts` — remove the `categories.newArrivals` key (verified: only referenced from `data/categories.ts` and `components/MobileMenu.tsx`, both being removed here).
- Explicitly out of scope: the `badges: ['new']` "new arrival" badge system (`NewArrivalsSection.tsx`, `ProductBadges.tsx`, `ProductCard.tsx`) is unrelated to `CategoryType` and is not touched.

## Rollout

Same safe pattern as the 2026-06-28 fix (per `feedback_no_schema_changes` — values only, no schema change):

1. Build the confident tag → bucket dictionary as a committed script in `scripts/` (not a tmp/throwaway file).
2. Dry-run against all live (`isDeleted=false`) products, print the before/after distribution across the 5 buckets.
3. Show the distribution to the user for confirmation.
4. On confirmation, apply via a single transaction (`UPDATE "Product" SET category = ... WHERE id = ANY(...)`, batched by bucket) — matches the existing proven approach, no schema migration.
5. Delete the stray untracked `scripts/_tmp_*` files once superseded by the committed script.

## Testing

- Re-run `data/categories.test.ts` and update for the new subcategory placement (leg-care/hand-care under body, `new`'s subcategories under equipment).
- Update `e2e/critical-flows.spec.ts` per above.
- Manual: after DB update, spot-check catalog pages per category (`/catalog?cat=body`, etc.) render and counts look sane; verify admin category management page (`app/admin/categories/page.tsx`) no longer offers `new`.
