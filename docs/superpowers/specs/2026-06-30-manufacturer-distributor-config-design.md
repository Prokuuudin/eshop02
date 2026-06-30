# Manufacturer / Distributor Config — Design Spec
Date: 2026-06-30

## Problem
All products show `—` in manufacturer/distributor fields because:
- DB columns (`manufacturerName`, `manufacturerAddress`, etc.) are NULL for all products — ERP never populates them
- DB data must not be changed (ERP is source of truth)
- Manufacturer/distributor info is the same for all products of a brand

## Solution
Store manufacturer/distributor info per brand in `brands-config` (`KeyValueSetting`). Admin edits via existing Brands admin page. Product page reads from brands config at server render time.

## Constraints
- No DB schema changes
- No new DB columns or `KeyValueSetting` keys
- No new admin pages

---

## 1. Data Layer

### `lib/brands-config.ts`
Extend `BrandConfigItem` with two optional fields:

```ts
manufacturer?: {
  name?: string
  address?: string
  email?: string
}
distributor?: {
  name?: string
  address?: string
  email?: string
}
```

### `lib/brands-server-store.ts`
- `normalizeBrand()`: pass through `manufacturer` and `distributor` fields as-is (trim string values, drop empty strings → `undefined`)
- No new KeyValueSetting key — stored inside existing `brands-config` JSON blob
- `buildDefaultPayload()`: both fields omitted (undefined) by default

---

## 2. Admin UI — `/admin/brands`

### Location
Inside each brand card in `app/admin/brands/page.tsx`, below the existing fields grid.

### UI
A shadcn `<Accordion>` item with trigger label **"Производитель / Дистрибьютор (EU)"**.

- Default state: **collapsed**
- If any of the 6 fields is non-empty → show a small filled dot (●) next to the trigger label to indicate data is present
- No separate Save/Reset buttons — existing brand-level Save/Reset covers all fields

### Fields inside accordion
```
Производитель
  [ Полное наименование ]  [ Почтовый адрес ]  [ E-mail ]

Дистрибьютор в ЕС
  [ Наименование ]  [ Почтовый адрес ]  [ E-mail ]
```

All 6 fields are plain `<Input>`. Same grid style as existing brand description fields.

### State management
Same `updateBrand()` pattern already used for other fields:
```ts
updateBrand(brand.id, {
  manufacturer: { ...brand.manufacturer, name: value }
})
```

---

## 3. Frontend Display

### `app/product/[id]/page.tsx`
Server component. After loading `getMergedProducts()`, additionally call `getBrandsConfigFromStore()`. Find the brand matching `product.brand` (case-insensitive match on `brand.id` or `brand.name`). Extract `brand.manufacturer` and `brand.distributor`. Pass down as props to `ProductPageContent`.

### Prop chain
```
ProductPage (server)
  → ProductPageContent  +  manufacturerInfo / distributorInfo props
    → ProductGalleryBlock  +  same props
      → ManufacturerDistributorInfo  +  same props
```

New props type:
```ts
type ManufacturerInfo = {
  name?: string
  address?: string
  email?: string
}
```

### `components/ManufacturerDistributorInfo.tsx`
- Remove: reading from `product.manufacturerName`, `product.manufacturerAddress`, `product.manufacturerEmail`, `product.distributorName`, `product.distributorAddress`, `product.distributorEmail`
- Remove: unused `transliterate()` function
- Add props: `manufacturer?: ManufacturerInfo`, `distributor?: ManufacturerInfo`
- Render: field value or `'—'` fallback
- Block always rendered (even if all fields are `'—'`)

---

## 4. Brand Matching Logic

`product.brand` in DB is the brand name string (e.g., `"Andis"`). Brands config uses `id` slug (e.g., `"andis"`).

Match: `brands.find(b => b.id === slugify(product.brand) || b.name.toLowerCase() === product.brand.toLowerCase())`

Use existing `brandSlug()` from `lib/brand-slug.ts` for the slug conversion.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `lib/brands-config.ts` | Add `manufacturer?`, `distributor?` to `BrandConfigItem` |
| `lib/brands-server-store.ts` | Pass through new fields in `normalizeBrand()` |
| `app/admin/brands/page.tsx` | Add accordion section per brand card |
| `app/product/[id]/page.tsx` | Load brands config, extract manufacturer/distributor, pass as props |
| `components/ProductPageContent.tsx` | Accept + forward new props |
| `components/ProductGalleryBlock.tsx` | Accept + forward new props |
| `components/ManufacturerDistributorInfo.tsx` | Rewrite to use brand-level props, remove product fields and transliterate() |

## 6. Out of Scope
- Localized manufacturer/distributor names (single string, not ru/en/lv — EU regulation text is typically in one language)
- Per-product overrides (deferred to Phase 2 ERP sync)
- Pre-populating data from hairshop.lv (manual admin entry for now)
