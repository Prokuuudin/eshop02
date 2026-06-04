# Catalog View Toggle (Grid/List) — Design Spec

**Date:** 2026-06-04  
**Status:** Approved

---

## Feature

Toggle button in catalog toolbar lets users switch between grid cards and horizontal list rows. Preference saved to `localStorage`.

---

## UI Layout

### Toolbar (above product grid)

```
[h2: Catalog]              [⊞ Grid] [≡ List]
```

Two icon buttons (lucide-react `LayoutGrid` / `List`) placed right-aligned in the heading row, above the filter+products layout. Active mode has indigo background.

### Grid mode (unchanged)

`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6` — current `ProductCard` component.

### List mode — `ProductListRow`

Horizontal card, full width:

```
[ 80×80 img ] [ Brand · Title         ] [ Price        ]
              [ SKU · ★ rating        ] [ [+ В корзину] ]
              [ Badges (sale/new/etc) ]
```

- `flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900`
- Image: `w-20 h-20 flex-shrink-0 rounded-md object-cover`
- Middle: `flex-1 min-w-0`
- Right: `flex flex-col items-end gap-2 flex-shrink-0`
- Out-of-stock: same overlay as card; `StockNotifyButton compact` instead of AddToCartButton

### Skeleton for list mode

Simple horizontal placeholder: `h-24 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse`

---

## Architecture

### State

```typescript
const [viewMode, setViewMode] = React.useState<'grid' | 'list'>(() => {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('catalog-view-mode') as 'grid' | 'list') ?? 'grid'
})

const handleViewMode = (mode: 'grid' | 'list') => {
  setViewMode(mode)
  localStorage.setItem('catalog-view-mode', mode)
}
```

### New component: `components/ProductListRow.tsx`

Props: `{ product: Product }` — same as `ProductCard`.

Reuses:
- `formatEuro` + `getDisplayPrice` + `calculatePrice` from existing utils
- `AddToCartButton` (imported as-is)
- `WishlistButton` (icon only, `asButton=false`)
- `StockNotifyButton compact`
- `getCurrentUser` for price visibility

### Translation keys (2 new)

| Key | RU | EN | LV |
|-----|----|----|-----|
| `catalog.viewGrid` | Сетка | Grid | Režģis |
| `catalog.viewList` | Список | List | Saraksts |

---

## Files

| File | Change |
|------|--------|
| `components/ProductListRow.tsx` | New — horizontal list row |
| `components/Products.tsx` | Add viewMode state + toggle buttons + conditional render |
| `data/translations.ts` | 2 new keys × 3 languages |
