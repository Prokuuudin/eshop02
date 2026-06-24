# Product Variant Options (цвет/комплектация) — Design Spec

**Date:** 2026-06-24
**Status:** Approved

---

## Проблема

При миграции hairshop.lv (nopCommerce) → Neon (июнь 2026) экспорт-скрипт `scripts/export-mssql-to-json.ps1` выгружал только таблицу `Product`. Таблицы nopCommerce, хранящие варианты (`Product_ProductAttribute_Mapping`, `ProductAttribute`, `ProductAttributeValue`), в выгрузку не попали — `migrate-from-mssql.ts` их никогда не писал в Neon.

**Проверено на SQL Server бэкапе `hairshop_p34s`:** 184 товара имеют атрибуты-варианты, 11 групп атрибутов:

| Атрибут | Товаров | Смысл | ControlType |
|---|---|---|---|
| Krāsu numurs | 73 | номер тона краски | Dropdown |
| Izmērs | 45 | размер | Dropdown |
| BASE | 26 | база | Dropdown |
| Procents | 14 | % окислителя | Dropdown |
| COLOR BASIC/SIMPLE/BUSINESS/EXCLUSIVE | 21 | линейка тонера, есть `PriceAdjustment` | Dropdown |
| TONERA KRASA | 8 | цвет тонера | Dropdown |
| SMARZA / WASHBASIN | 8 | прочее | Dropdown |

Все control type = 1 (Dropdown). `ProductAttributeCombination` пуст (0 строк) — у вариантов нет своего SKU/остатка, общий сток на товар, только опциональная надбавка к цене.

Из 184: 71 товар сейчас `isActive=true` (показывается на сайте без выбора варианта), 113 — `isActive=false`.

В Prisma-схеме `Product` нет поля под варианты вообще. В `ProductInfo.tsx`/`ProductActions.tsx` выбора варианта нет — сразу "в корзину".

---

## Решение

### 1. Модель данных

`prisma/schema.prisma`, модель `Product` — новое аддитивное поле:

```prisma
variantGroups Json?
```

Безопасно для ERP-sync: `lib/sync/upsert-products.ts` матчит `ON CONFLICT ("externalId")`, у мигрированных строк `externalId = null`, sync их не трогает.

TypeScript-форма (в `data/products.ts`):

```ts
export interface VariantOption {
  value: string            // код как в исходнике: "A-11", "111", "WHITE"
  priceAdjustment?: number
}

export interface VariantGroup {
  name: string              // как в исходнике: "Krāsu numurs", "Izmērs"...
  required: boolean
  options: VariantOption[]
}

// в Product:
variantGroups?: VariantGroup[]
```

Значения не переводятся и не маппятся на hex-цвета — это коды тонов/размеров, не реальные цвета. UI — обычный `<select>`, без цветных сэмплов.

### 2. Миграция данных

- Дополнить `scripts/export-mssql-to-json.ps1` запросом, выгружающим `Product_ProductAttribute_Mapping` JOIN `ProductAttribute` JOIN `ProductAttributeValue` (+ `IsRequired`, `PriceAdjustment`) в `product_attributes.json`.
- Новый одноразовый скрипт `scripts/migrate-product-variants.ts`: читает `product_attributes.json`, группирует по `ProductId` → `VariantGroup[]`, делает `UPDATE` (не `createMany`, товары уже существуют) по всем 184 `Product.id` — включая неактивные 113, чтобы при реактивации товара варианты уже были на месте.

### 3. UI товара

Новый компонент `components/ProductVariantSelector.tsx`:
- На каждую группу — `<select>` (shadcn `Select`), опции — `option.value` как есть.
- Если `required=true` — без выбора кнопка "в корзину" в `ProductActions` заблокирована (disabled + подсказка "выберите ...").
- Выбор пересчитывает отображаемую цену: `displayPrice + (selectedOption.priceAdjustment ?? 0)` для каждой выбранной группы, суммарно.
- Встраивается в `ProductInfo.tsx` между `ProductPrices` и `ProductActions`, состояние выбора живёт в `ProductInfo` (или родительском server/client boundary компоненте) и передаётся в `ProductActions` и в пересчитанную цену `ProductPrices`.

### 4. Корзина

`lib/cart-store.ts`:

```ts
export type SelectedVariant = { groupName: string; value: string; priceAdjustment?: number }

// AddableProduct и CartItem получают:
selectedVariants?: SelectedVariant[]
```

Внутренний составной ключ строки корзины:
```ts
function lineKey(id: string, variants?: SelectedVariant[]): string {
  if (!variants?.length) return id
  return id + '::' + variants.map(v => `${v.groupName}=${v.value}`).join(',')
}
```

`addItem`/`removeItem`/`updateQuantity` matчат и хранят строки по `lineKey`, а не по чистому `id`. Каждая строка хранит и `id` (для совместимости с местами, где нужен product id — линки на товар, wishlist и т.п.), и `selectedVariants`. Два разных варианта одного товара = две строки с разным `lineKey`.

Затронутые вызовы (передать `lineKey` вместо `id` при удалении/изменении количества):
- `components/AddToCartButton.tsx`
- `components/CartDrawer.tsx`
- `app/cart/page.tsx`
- `app/checkout/page.tsx`

Цена в `CartItem.price` — уже с учётом надбавки (рассчитана в момент `addItem`), отдельно надбавку не храним повторно.

### 5. Заказы

`Order.items` (JSON, без строгой схемы) — элемент получает опциональное поле:
```ts
variant?: string  // human-readable: "Krāsu numurs: A-11"
```
Точка добавления — там же, где сейчас формируется `items` при создании заказа (checkout submit). Только для отображения в админке/инвойсе, не влияет на склад/сток (общий сток на товар, как и в исходнике).

### 6. Админка

`components/admin/products/ProductVariantGroupsFields.tsx` — по образцу `ProductTechSpecsFields.tsx`, два вложенных `useFieldArray`: группы → опции внутри группы. Поля: имя группы, чекбокс "обязательный", список опций (значение + надбавка).

Подключается в `AddProductForm.tsx`, схема — `productFormSchema.ts` (zod), маппинг — `lib/product-form-mapping.ts` (`mapProductToFormValues` / `mapFormValuesToProductPatch` / `mapFormValuesToNewProduct`).

`lib/product-overrides-store.ts`:
- `mapDbToProduct` — добавить `variantGroups: (p.variantGroups ?? undefined) as VariantGroup[] | undefined`
- `mapProductToDbCreate` — добавить `variantGroups: p.variantGroups ?? null`
- `upsertProductOverride` `fieldMap` — добавить `variantGroups: 'variantGroups'`

### 7. Тесты (vitest)

- `lib/cart-store.test.ts` (новый или расширить существующий): composite-key логика — два варианта = две строки, одинаковый вариант = инкремент количества, `removeItem`/`updateQuantity` по `lineKey`.
- Валидация "обязательный вариант не выбран → нельзя добавить в корзину" (логика в `ProductActions` или вынесена в чистую функцию для тестируемости).
- `lib/product-overrides-store.test.ts` (если есть) или новый — round-trip `mapDbToProduct`/`mapProductToDbCreate` с `variantGroups`.

---

## Вне скоупа

- Отдельный сток/SKU на вариант — в исходных данных не было (`ProductAttributeCombination` пуст), не делаем.
- Цветные сэмплы/hex — данных нет, не делаем.
- Перевод названий групп/значений на en/lv — исходники на латышском технические коды, оставляем как есть.
