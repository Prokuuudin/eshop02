# Manufacturer / Distributor Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store manufacturer/distributor info per brand in `brands-config` (KeyValueSetting), expose it in the admin brands page, and display it on product pages.

**Architecture:** Extend `BrandConfigItem` with `manufacturer` and `distributor` optional fields. Thread from server component (`app/product/[id]/page.tsx`) down via props to `ManufacturerDistributorInfo`. Admin edits via existing brands accordion UI pattern.

**Tech Stack:** Next.js 14 App Router, Prisma + Neon (KeyValueSetting), shadcn/ui (Accordion, Input), TypeScript, Vitest

## Global Constraints

- No DB schema changes — all data stored in existing `KeyValueSetting` key `brands-config`
- No new admin pages — extend existing `/admin/brands`
- No new API routes — extend existing `/api/admin/brands` via store normalization
- `manufacturer` and `distributor` are brand-level, not per-product
- Block in product page always renders, even if all fields are `—`
- Follow existing BEM class naming patterns in components
- Use shadcn `<Accordion>` (already imported in brands page), `<Input>` for fields

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/brands-config.ts` | Modify | Add `BrandManufacturerInfo` type + extend `BrandConfigItem` |
| `lib/brands-server-store.ts` | Modify | Pass through `manufacturer`/`distributor` in `normalizeBrand()` |
| `components/ManufacturerDistributorInfo.tsx` | Rewrite | Accept brand-level props, remove product field reading |
| `components/ProductGalleryBlock.tsx` | Modify | Accept + forward `manufacturer`/`distributor` props |
| `components/ProductPageContent.tsx` | Modify | Accept + forward `manufacturer`/`distributor` props |
| `app/product/[id]/page.tsx` | Modify | Load brands config, match brand, pass manufacturer/distributor |
| `app/admin/brands/page.tsx` | Modify | Add accordion section with 6 new fields per brand card |

---

### Task 1: Extend type + store normalization

**Files:**
- Modify: `lib/brands-config.ts`
- Modify: `lib/brands-server-store.ts`

**Interfaces:**
- Produces: `BrandManufacturerInfo` type, extended `BrandConfigItem` with `manufacturer?` and `distributor?`

- [ ] **Step 1: Add type to `lib/brands-config.ts`**

Open `lib/brands-config.ts`. Add `BrandManufacturerInfo` type and extend `BrandConfigItem`:

```ts
import type { Language } from '@/data/translations'

export type LocalizedBrandDescription = Record<Language, string>

export type BrandManufacturerInfo = {
  name?: string
  address?: string
  email?: string
}

export type BrandConfigItem = {
  id: string
  name: string
  logo: string
  popular: boolean
  isDistributor: boolean
  allowLogo: boolean
  description: LocalizedBrandDescription
  manufacturer?: BrandManufacturerInfo
  distributor?: BrandManufacturerInfo
}

export type BrandsConfigPayload = {
  brands: BrandConfigItem[]
}
```

- [ ] **Step 2: Update `normalizeBrand` in `lib/brands-server-store.ts`**

Find the `normalizeBrand` function (currently ends after `description`). Add normalization for the two new optional fields:

```ts
const normalizeBrandManufacturerInfo = (
  input?: Partial<BrandManufacturerInfo> | null
): BrandManufacturerInfo | undefined => {
  if (!input) return undefined
  const name = input.name?.trim() || undefined
  const address = input.address?.trim() || undefined
  const email = input.email?.trim() || undefined
  if (!name && !address && !email) return undefined
  return { name, address, email }
}
```

Then in `normalizeBrand`, after the `description` field, add:

```ts
  return {
    id,
    name,
    logo,
    popular: Boolean(brand.popular),
    isDistributor: Boolean(brand.isDistributor),
    allowLogo: brand.allowLogo !== false,
    description: normalizeDescription(brand.description),
    manufacturer: normalizeBrandManufacturerInfo(brand.manufacturer),
    distributor: normalizeBrandManufacturerInfo(brand.distributor),
  }
```

Also import `BrandManufacturerInfo` at the top of the file:

```ts
import type { BrandsConfigPayload, BrandConfigItem, LocalizedBrandDescription, BrandManufacturerInfo } from '@/lib/brands-config'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors related to `BrandConfigItem` or `normalizeBrand`.

- [ ] **Step 4: Commit**

```bash
git add lib/brands-config.ts lib/brands-server-store.ts
git commit -m "feat: extend BrandConfigItem with manufacturer/distributor fields"
```

---

### Task 2: Rewrite ManufacturerDistributorInfo

**Files:**
- Rewrite: `components/ManufacturerDistributorInfo.tsx`

**Interfaces:**
- Consumes: `BrandManufacturerInfo` from `lib/brands-config.ts` (Task 1)
- Produces: component with props `{ manufacturer?: BrandManufacturerInfo, distributor?: BrandManufacturerInfo, language: string }`

- [ ] **Step 1: Rewrite the component**

Replace the entire content of `components/ManufacturerDistributorInfo.tsx` with:

```tsx
import React from 'react';
import type { BrandManufacturerInfo } from '@/lib/brands-config';
import { useTranslation } from '@/lib/use-translation';

export const ManufacturerDistributorInfo: React.FC<{
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
    language: string;
}> = ({ manufacturer, distributor }) => {
    const { t } = useTranslation();

    const fullName = manufacturer?.name || '—';
    const address = manufacturer?.address || '—';
    const email = manufacturer?.email;

    const distributorName = distributor?.name || '—';
    const distributorAddress = distributor?.address || '—';
    const distributorEmail = distributor?.email;

    return (
        <div className="product-detail__manufacturer-distributor mt-2 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg border border-blue-200 dark:border-blue-700 text-sm">
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('manufacturer.title')}
            </div>
            <ul className="mb-4 list-disc pl-5">
                <li>{t('manufacturer.fullName')} {fullName}</li>
                <li>{t('manufacturer.address')} {address}</li>
                <li>
                    {t('manufacturer.email')}{' '}
                    {email ? (
                        <a href={`mailto:${email}`} className="text-blue-700 underline">{email}</a>
                    ) : '—'}
                </li>
            </ul>
            <div className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
                {t('distributor.title')}
            </div>
            <ul className="list-disc pl-5">
                <li>{t('distributor.name')} {distributorName}</li>
                <li>{t('distributor.address')} {distributorAddress}</li>
                <li>
                    {t('distributor.email')}{' '}
                    {distributorEmail ? (
                        <a href={`mailto:${distributorEmail}`} className="text-blue-700 underline">{distributorEmail}</a>
                    ) : '—'}
                </li>
            </ul>
        </div>
    );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: errors on `ProductGalleryBlock.tsx` (still passing old props) — that's fine, fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add components/ManufacturerDistributorInfo.tsx
git commit -m "refactor: ManufacturerDistributorInfo reads from brand-level props"
```

---

### Task 3: Thread props through product page

**Files:**
- Modify: `components/ProductGalleryBlock.tsx`
- Modify: `components/ProductPageContent.tsx`
- Modify: `app/product/[id]/page.tsx`

**Interfaces:**
- Consumes: `BrandManufacturerInfo` (Task 1), new `ManufacturerDistributorInfo` props (Task 2)
- Produces: product page loads and passes brand manufacturer/distributor info server-side

- [ ] **Step 1: Update `ProductGalleryBlock`**

Open `components/ProductGalleryBlock.tsx`. Add `manufacturer` and `distributor` to the interface and props, remove `product` prop if it was only used for `ManufacturerDistributorInfo` (check: `product` is also used... keep it), update the `ManufacturerDistributorInfo` call:

```tsx
import React from 'react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductImageDisclaimer } from '@/components/ProductImageDisclaimer';
import { ProductBenefits } from '@/components/ProductBenefits';
import { ProductSpecs } from '@/components/ProductSpecs';
import { ManufacturerDistributorInfo } from '@/components/ManufacturerDistributorInfo';
import { Product } from '@/data/products';
import type { BrandManufacturerInfo } from '@/lib/brands-config';

interface ProductGalleryBlockProps {
    images: string[];
    demoVideos: any[];
    title: string;
    productSpecVolume: string;
    productSpecType: string;
    productSpecCountry: string;
    brandId: string;
    language: string;
    product: Product;
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
}

export const ProductGalleryBlock: React.FC<ProductGalleryBlockProps> = ({
    images,
    demoVideos,
    title,
    productSpecVolume,
    productSpecType,
    productSpecCountry,
    brandId,
    language,
    product,
    manufacturer,
    distributor,
}) => {
    return (
        <div className="flex flex-col gap-4">
            <ProductGallery images={images} demoVideos={demoVideos} title={title} />
            <ProductImageDisclaimer />
            <ProductSpecs
                volume={productSpecVolume}
                type={productSpecType}
                country={productSpecCountry}
            />
            <ManufacturerDistributorInfo
                manufacturer={manufacturer}
                distributor={distributor}
                language={language}
            />
        </div>
    );
};
```

- [ ] **Step 2: Update `ProductPageContent`**

Open `components/ProductPageContent.tsx`. Add `manufacturer` and `distributor` to the `Props` type and forward them to `ProductGalleryBlock`:

In the `Props` type (around line 22):
```ts
import type { BrandManufacturerInfo } from '@/lib/brands-config';

type Props = {
    product: Product;
    allProducts: Product[];
    manufacturer?: BrandManufacturerInfo;
    distributor?: BrandManufacturerInfo;
};
```

In the function signature:
```ts
export default function ProductPageContent({ product, allProducts, manufacturer, distributor }: Props): JSX.Element {
```

In the JSX where `ProductGalleryBlock` is rendered (around line 83), add the two new props:
```tsx
<ProductGalleryBlock
    images={images}
    demoVideos={demoVideos}
    title={localizedTitle}
    productSpecVolume={productSpecVolume}
    productSpecType={productSpecType}
    productSpecCountry={productSpecCountry}
    brandId={product.brand}
    language={language}
    product={product}
    manufacturer={manufacturer}
    distributor={distributor}
/>
```

- [ ] **Step 3: Update `app/product/[id]/page.tsx`**

Add import for `getBrandsConfigFromStore` and `brandSlug`:

```ts
import { getBrandsConfigFromStore } from '@/lib/brands-server-store'
import { brandSlug } from '@/lib/brand-slug'
```

In the `ProductPage` function, after `const product = mergedProducts.find(...)`, add brand config lookup:

```ts
const brandsConfig = await getBrandsConfigFromStore()
const brand = brandsConfig.brands.find(
    (b) => b.id === brandSlug(product.brand) || b.name.toLowerCase() === product.brand.toLowerCase()
)
const manufacturer = brand?.manufacturer
const distributor = brand?.distributor
```

In the JSX, pass to `ProductPageContent`:
```tsx
<ProductPageContent
    product={product}
    allProducts={mergedProducts}
    manufacturer={manufacturer}
    distributor={distributor}
/>
```

Also add the same lookup in `generateMetadata` if it needs manufacturer info — it doesn't, skip.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Smoke-test in browser**

Run: `npm run dev`

Open any product page (e.g. `/product/p1`). Confirm:
- Manufacturer/Distributor block renders
- All fields show `—` (since no data in brands config yet — admin task is next)
- No console errors

- [ ] **Step 6: Commit**

```bash
git add components/ProductGalleryBlock.tsx components/ProductPageContent.tsx app/product/[id]/page.tsx
git commit -m "feat: thread manufacturer/distributor from brand config to product page"
```

---

### Task 4: Admin UI — accordion section per brand card

**Files:**
- Modify: `app/admin/brands/page.tsx`

**Interfaces:**
- Consumes: `BrandConfigItem.manufacturer`, `BrandConfigItem.distributor` (Task 1)

- [ ] **Step 1: Add `BrandManufacturerInfo` import**

At the top of `app/admin/brands/page.tsx`, extend the import from `@/lib/brands-config`:

```ts
import type { BrandConfigItem, BrandsConfigPayload, LocalizedBrandDescription, BrandManufacturerInfo } from '@/lib/brands-config'
```

- [ ] **Step 2: Add `updateBrandManufacturer` and `updateBrandDistributor` helpers**

After the existing `updateBrandDescription` function, add:

```ts
const updateBrandManufacturer = (brandId: string, patch: Partial<BrandManufacturerInfo>) => {
    setBrands((prev) =>
        prev.map((brand) =>
            brand.id === brandId
                ? { ...brand, manufacturer: { ...brand.manufacturer, ...patch } }
                : brand
        )
    )
}

const updateBrandDistributor = (brandId: string, patch: Partial<BrandManufacturerInfo>) => {
    setBrands((prev) =>
        prev.map((brand) =>
            brand.id === brandId
                ? { ...brand, distributor: { ...brand.distributor, ...patch } }
                : brand
        )
    )
}
```

- [ ] **Step 3: Add accordion section inside each brand card**

In each brand card's `<article>` element, after the closing `</div>` of the main fields grid (around line 495 — after the card preview column), add a new `<Accordion>` section:

```tsx
<div className="mt-3">
    <Accordion type="single" collapsible>
        <AccordionItem value="legal" className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <AccordionTrigger className="px-4 py-2 text-sm font-medium hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50 [&>svg]:shrink-0">
                <span className="flex items-center gap-2">
                    {tl('admin.brands.field.manufacturerSection', 'Производитель / Дистрибьютор (EU)', 'Manufacturer / Distributor (EU)', 'Ražotājs / Izplatītājs (ES)')}
                    {(brand.manufacturer?.name || brand.manufacturer?.address || brand.manufacturer?.email ||
                      brand.distributor?.name || brand.distributor?.address || brand.distributor?.email) && (
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" title={tl('admin.brands.field.hasData', 'Данные заполнены', 'Data filled', 'Dati aizpildīti')} />
                    )}
                </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
                <div className="grid gap-4">
                    <div>
                        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {tl('admin.brands.field.manufacturer', 'Производитель', 'Manufacturer', 'Ražotājs')}
                        </p>
                        <div className="grid gap-2 md:grid-cols-3">
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgName', 'Полное наименование', 'Full name', 'Pilns nosaukums')}</span>
                                <Input
                                    value={brand.manufacturer?.name || ''}
                                    onChange={(e) => updateBrandManufacturer(brand.id, { name: e.target.value })}
                                />
                            </label>
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgAddress', 'Почтовый адрес', 'Postal address', 'Pasta adrese')}</span>
                                <Input
                                    value={brand.manufacturer?.address || ''}
                                    onChange={(e) => updateBrandManufacturer(brand.id, { address: e.target.value })}
                                />
                            </label>
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.mfgEmail', 'E-mail', 'E-mail', 'E-pasts')}</span>
                                <Input
                                    value={brand.manufacturer?.email || ''}
                                    onChange={(e) => updateBrandManufacturer(brand.id, { email: e.target.value })}
                                />
                            </label>
                        </div>
                    </div>
                    <div>
                        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {tl('admin.brands.field.distributor', 'Дистрибьютор в ЕС', 'EU Distributor', 'ES Izplatītājs')}
                        </p>
                        <div className="grid gap-2 md:grid-cols-3">
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distName', 'Наименование', 'Name', 'Nosaukums')}</span>
                                <Input
                                    value={brand.distributor?.name || ''}
                                    onChange={(e) => updateBrandDistributor(brand.id, { name: e.target.value })}
                                />
                            </label>
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distAddress', 'Почтовый адрес', 'Postal address', 'Pasta adrese')}</span>
                                <Input
                                    value={brand.distributor?.address || ''}
                                    onChange={(e) => updateBrandDistributor(brand.id, { address: e.target.value })}
                                />
                            </label>
                            <label className="text-xs">
                                <span className="mb-1 block text-muted-foreground">{tl('admin.brands.field.distEmail', 'E-mail', 'E-mail', 'E-pasts')}</span>
                                <Input
                                    value={brand.distributor?.email || ''}
                                    onChange={(e) => updateBrandDistributor(brand.id, { email: e.target.value })}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </AccordionContent>
        </AccordionItem>
    </Accordion>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Smoke-test admin UI**

Run: `npm run dev`

1. Go to `/admin/brands`
2. Find any brand card — confirm "Производитель / Дистрибьютор (EU)" accordion section appears
3. Expand it — confirm 6 fields render
4. Fill in manufacturer name + address + email for "Andis" brand
5. Click "Сохранить" — confirm success message
6. Reload page — confirm data persists
7. Go to a product page for an Andis product — confirm the block shows the saved data instead of `—`
8. Confirm green dot appears next to the accordion trigger after saving

- [ ] **Step 6: Commit**

```bash
git add app/admin/brands/page.tsx
git commit -m "feat: add manufacturer/distributor fields to admin brands page"
```
