# Product.sku unique constraint — deferred

Part of the `harden_product_mutations` migration (originally
`20260802200000`) added a unique index on `Product.sku` (case-insensitive).
Applying it to the live Neon DB failed: 105 groups of rows shared a
(case-insensitive) SKU.

## What was done (2026-08-04)

Ran a one-off cleanup: for each duplicate group, if exactly one row had
`isActive = true`, nulled `sku` on the other rows in that group (kept the
active row's SKU). This resolved 37/105 groups (40 rows). The `revision`
column addition (unrelated, needed for optimistic concurrency in
`lib/product-mutation-schema.ts`) was kept in the migration and applied.

The unique-index part of the migration was pulled out and **not applied**.
`@@unique([sku])` was removed from `prisma/schema.prisma` to match.

## What's left: 68 ambiguous groups

Two shapes, both need a human decision, not a mechanical rule:

- **Both/all rows inactive** (most of the 68): can't tell which is the
  "real" product from `isActive` alone. Likely candidates: an ERP re-import
  duplicate, a locale-variant title, or genuinely two different discontinued
  products that happen to share a legacy code.
- **Both/all rows active** (~10 groups): more concerning — e.g. `vn27`
  (`Брюки` / `Юбка` — pants vs. skirt) and `vn28` (same pair) share a SKU
  while both are live and presumably both sold. Also `chi5600` (shampoo vs.
  conditioner), `100311`/`nia100005` (two different masks), `sd` (cream-dye
  vs. toner) — these look like true SKU collisions in the ERP source, not
  cleanup debt.

Full list of the 68 groups (sku, product ids, titles, active flags) was
printed to the terminal during the 2026-08-04 session and is not persisted
elsewhere — re-run this query against the live DB to regenerate it:

```sql
SELECT lower(sku) AS sku_lower, array_agg(id ORDER BY id) AS ids,
       array_agg(title ORDER BY id) AS titles, array_agg("isActive" ORDER BY id) AS active
FROM "Product" WHERE sku IS NOT NULL
GROUP BY lower(sku) HAVING count(*) > 1
ORDER BY sku_lower;
```

## To finish this later

1. Review the 68 groups (probably against the ERP source, not just the Neon
   copy — see `project_erp_sync` memory) and decide per group: which SKU to
   keep, whether to null the others, or whether the "duplicate" is actually
   correct upstream data that means the uniqueness assumption itself is wrong.
2. Re-add to `prisma/schema.prisma`: `@@unique([sku])` on `Product`.
3. Add a fresh migration with the `UPDATE ... SET sku = NULL WHERE btrim(sku) = ''`
   guard + `CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku")` +
   `CREATE UNIQUE INDEX "Product_sku_lower_key" ON "Product" (lower("sku")) WHERE "sku" IS NOT NULL`
   (exact SQL was in the original, since-edited `20260802200000_harden_product_mutations/migration.sql`
   — check git history of that file for the full text).
