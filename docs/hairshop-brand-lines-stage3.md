# Hairshop Pro brand lines — stage 3 (bootstrap and shadow mode)

## Scope

Product lines and series inside a Hairshop Pro brand, classified from the active taxonomy snapshot of
hairshop.lv (`docs/hairshop-taxonomy-sync-v2.md`). Nothing here writes `Product` (brand, category, price, stock),
orders or promotions, and nothing runs automatically. Discounts per line are a later stage.

## Data model (migration `20261030200000_brand_line_bootstrap`, purely additive)

- `BrandLine`: `key` (`<brandKey>/<slug path>`, unique), `brandKey` (brands-config id), `parentId`, localized
  `names`, `kind` (`line` | `series` | `subbrand`), `status`, `origin` (`source_sync` | `admin`), `adminLocked`,
  `depth`. The `BrandLine_hierarchy_guard` trigger rejects cycles, a parent of another brand and an inconsistent
  depth, and serializes hierarchy changes with a transaction advisory lock.
- `ProductBrandLine`: direct membership only (deepest line); ancestor membership is derived through `parentId`.
  `origin` `admin` links are never touched by synchronization; `status = 'excluded'` blocks re-adding a link.
  A link the source no longer supports is never deleted: `isPresentInSource = false` and `missingSnapshotCount`
  (counted once per snapshot via `lastCheckedSnapshotId`).
- `CatalogSourceManufacturerBrand`: source manufacturer → brand.
- `CatalogSourceCategoryMapping`: source category → `brand` | `brand_line` | `ignore`. An admin mapping
  (including `ignore`/`rejected`) always wins over automatic classification.
- `BrandLineReviewItem`: manual review queue, unique per `(source, reason, subject)`; reruns update the open item.

## Classification rules (`lib/brand-lines/brand-line-plan.ts`, pure)

1. Stable source IDs only. Product titles are never used.
2. The brands root is the root category whose children are mostly Hairshop Pro brands; its children map to brands
   by exact normalized name or approved alias. Manufacturers map the same way. Everything else is reviewed.
3. Approved seeds (high-confidence nodes of the reviewed inventory) are resolved to exactly one category of the
   brand subtree; a seed that matches zero or several categories is reviewed, not guessed. A node that exists only
   as the parent of its seeded children resolves to their single common parent category.
4. Line parents follow the source hierarchy; a seed whose declared parent differs is applied as in the source and
   reported (`hierarchy_divergence`).
5. A new child category of a confirmed line becomes a series automatically only if every product in it belongs to
   the line's brand, the name is not another brand, no sibling has the same key and the depth limit holds.
   Otherwise it is reviewed. Names used under two or more brands (product types such as "Šampūni") are never lines.
6. Unknown categories directly under a brand are reviewed (`unknown_root_line`, `brand_vs_line_conflict`), never
   created automatically.
7. A product is linked only if its Hairshop Pro brand equals the line's brand. A product with brand "Unknown" is
   linked when the source manufacturer does not contradict it, and is reported (`product_brand_unknown`).

## Running (test branch only)

```
DATABASE_URL=<isolated branch> node --conditions=react-server --import tsx scripts/brand-lines-bootstrap.ts \
  --seed <inventory.json> --report <out.json>            # read-only dry run / shadow reconciliation
... --apply                                              # also needs BRANDLINE_BOOTSTRAP_WRITE_ACK=isolated-branch
```

`--apply` refuses the production database. The report lists planned lines, links, new series, review items and
a per-node comparison with the inventory.

## Administration (stage 4)

Page `/admin/brand-lines` (admin menu: Catalog → Product lines), permission `catalog.read`; every change needs
`catalog.update`, which only platform administrators hold (staff managers and customers get 403).

API (`app/api/admin/brand-lines/…`): `GET /` tree, `POST /` create, `GET|PATCH /[id]` detail and edit,
`POST /[id]/products` include or exclude a product (`{ product: <id or SKU>, action }`), `GET /review?status=`
queue, `POST /review/[id]` with `resolve`, `dismiss`, `reject`, `confirm_brand` or `confirm_line`.

Every mutation runs in one transaction under the bootstrap advisory lock and writes an `AuditLog` row
(`catalog.brand_line_*`). Edits set `adminLocked`; keys never change. The server rejects cycles, a parent of another
brand, a depth beyond the limit, a move that would change the depth of a subtree, a duplicate slug among siblings,
a product of another brand and a product already linked to a parent or child line. `confirm_line` accepts a source
category only for the brand its source hierarchy belongs to. Products of a confirmed line are linked by the next
synchronization; administrator links and exclusions are kept.

## Production release bootstrap (stage 7)

`scripts/brand-lines-bootstrap.ts --apply` stays limited to isolated branches. Production uses
`scripts/brand-lines-release.ts` (library `lib/brand-lines/brand-line-release.ts`), in two phases:

1. `plan` (read-only, REPEATABLE READ): checks that `DATABASE_URL` is the endpoint named by `--expect-endpoint` and that
   the Neon API (`NEON_API_KEY`) reports it under `--expect-project` / `--expect-branch`; requires the stage-2/3
   migrations, a completed applied taxonomy snapshot and no receiving taxonomy session in the last 6 hours. Writes a plan
   file with the snapshot, seed hash, counts (lines, mappings, links create/refresh/missing, reviews new/existing),
   preserved administrator overrides, the mass-change guard and the plan hash.
2. `apply`: needs `BRANDLINE_RELEASE_APPLY_ENDPOINT=<endpoint>`, `--approve <plan hash>` and `--operator <platform
   admin e-mail>`. Inside one transaction it takes the shared locks, re-checks snapshot and sync state, recomputes the
   plan and refuses unless its hash equals the approved one (so a replay or any data change is refused), refuses more
   missing marks than max(5, 2 % of active synchronized links) unless `--allow-mass-missing <exact count>`, applies,
   and writes `catalog.brand_line_bootstrap_applied` to the audit log. Any error rolls everything back.
3. After the commit only, `--revalidate-base-url <site>` calls `POST /api/internal/hairshop-catalog-sync/storefront-revalidate`
   (catalog-sync key; accepted only for an audited bootstrap) to drop `storefront-sale-products` and
   `storefront-bestsellers`. Exit code 3 means committed but not revalidated; then use the admin
   `POST /api/admin/storefront-cache/revalidate`.

Lock order everywhere: taxonomy source lock (finalize, prune, bootstrap) → BrandLine lock (bootstrap, admin edits).
Admin route handlers revalidate the two storefront tags after a committed line or membership change.
