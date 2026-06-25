# Product Variant Options v2 (цвет/комплектация, без изменения схемы) — Design Spec

**Date:** 2026-06-25
**Status:** Approved
**Supersedes:** `docs/superpowers/specs/2026-06-24-product-variant-options-design.md` (отклонён — добавлял колонку `Product.variantGroups Json?` в Neon; реализация была собрана, прошла ревью, смержена, задеплоена на live Neon (включая бэкафилл 183 товаров) и затем полностью откачена по требованию пользователя)

---

## Почему предыдущая версия отклонена

Neon — тестовая копия настоящей, живой действующей базы (SQL Server, nopCommerce, `hairshop_p34s`), к которой проект подключится позже. Менять основные характеристики (схему) Neon нельзя — она должна оставаться совместимой с тем, что реально есть в живой системе.

Кроме того, в `docs/superpowers/specs/2026-06-09-erp-product-sync-design.md` уже было явно зафиксировано: дизайн схемы вариантов (`Phase 2`) отложен до появления реальных данных от ERP — "нельзя спроектировать правильно без реальных данных ERP". Добавление `variantGroups Json?` в этой ветке проигнорировало это решение.

Источник данных о вариантах при этом подтверждён верно — это nopCommerce-таблицы `Product_ProductAttribute_Mapping`/`ProductAttribute`/`ProductAttributeValue` в `hairshop_p34s` (184 товара с атрибутами, 183 из них реально существуют как живые товары в Neon на сегодня — один товар, id 12660, удалён без замены, см. `project_variant_options_gap` память). Проблема была не в источнике данных, а в том, что под них завели новое поле в Neon вместо использования существующего.

## Решение

Используем уже существующее поле `Product.technicalSpecs Json?` (плоский `Record<string,string>`, уже в схеме Neon) как хранилище — без единой миграции Prisma.

### 1. Кодирование данных

В `technicalSpecs` под зарезервированным ключом `__variantGroupsJson` хранится JSON-строка со структурой:

```ts
// data/products.ts — без изменений относительно предыдущей версии
export interface VariantOption {
  value: string            // код как в исходнике: "A-11", "111", "WHITE"
  priceAdjustment?: number
}

export interface VariantGroup {
  name: string              // "Krāsu numurs", "Izmērs"...
  required: boolean
  options: VariantOption[]
}

export interface SelectedVariant {
  groupName: string
  value: string
  priceAdjustment?: number
}
```

`technicalSpecs["__variantGroupsJson"] = JSON.stringify(VariantGroup[])`. Никакого нового поля на `Product` (TS-интерфейс или Prisma-схема) не добавляется.

Доступ — через чистый хелпер в `lib/product-variants.ts`:

```ts
export function getVariantGroups(product: { technicalSpecs?: Record<string, string> | null }): VariantGroup[] | undefined {
  const raw = product.technicalSpecs?.['__variantGroupsJson']
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as VariantGroup[] : undefined
  } catch {
    return undefined
  }
}
```

Битый/отсутствующий JSON → `undefined`, страница рендерится как обычный товар без вариантов (без падений).

### 2. Скрытие служебного ключа в общей таблице характеристик

`components/TechnicalSpecs.tsx` — единственное место, рендерящее `technicalSpecs` целиком построчно. Фильтруем `__variantGroupsJson` из отображаемых пар:

```ts
Object.entries(product.technicalSpecs).filter(([key]) => key !== '__variantGroupsJson')
```

### 3. Миграция данных (источник не меняется)

`scripts/export-mssql-to-json.ps1` — экспорт `product_attributes.json` из `hairshop_p34s` уже написан и не требует изменений (тот же SQL-запрос: `Product_ProductAttribute_Mapping` JOIN `ProductAttribute` JOIN `ProductAttributeValue`, фильтр `Product.Deleted = 0`).

Новый одноразовый скрипт `scripts/migrate-product-variants.ts`: группирует строки по `ProductId` → `VariantGroup[]`, для каждого товара делает:

```sql
UPDATE "Product"
SET "technicalSpecs" = COALESCE("technicalSpecs", '{}'::jsonb) || jsonb_build_object('__variantGroupsJson', $1::text)
WHERE id = $2
```

(merge внутрь существующего `technicalSpecs`, а не перезапись поля целиком — если у товара уже есть другие характеристики, они не теряются). Ожидаемо: 183 товара обновлены (id 12660 не найден в Neon — не ошибка, см. выше).

**Никакой Prisma-миграции, никакого `ALTER TABLE`.**

### 4. UI товара

Без изменений относительно прошлой версии: `components/ProductVariantSelector.tsx` (shadcn `Select` на группу), встраивается в `ProductInfo.tsx` между `ProductPrices`/`ProductRating` и `ProductActions`. Условие рендера: `getVariantGroups(product)` непусто (вместо прямого обращения к `product.variantGroups`).

### 5. Корзина

Без изменений: composite `lineKey` в `lib/cart-store.ts` (`buildLineKey(id, selectedVariants)`), `CartItem.selectedVariants`/`variantLabel`, `addItem(product, quantity, selectedVariants?)`, `removeItem(lineKey)`, `updateQuantity(lineKey, quantity)`. Миграция персистентной корзины при рехайдрации (`version: 1` + `migrate`) — как было сделано и проверено в прошлой версии.

`AddToCartButton`/`ProductActions`/`ProductInfo` — та же логика gating по `required`-группам, тот же fallback-переход на страницу товара для карточек каталога без селектора.

### 6. Корзина-UI/чекаут (lineKey вместо id)

Без изменений: `CartDrawer.tsx`, `app/cart/page.tsx`, `app/checkout/page.tsx` переключаются на `lineKey` для выбора строки/удаления/изменения количества; safety-fix на пересчёт `remainingItems` после частичного чекаута по `lineKey`, не по `id`.

### 7. Заказы

Без изменений: `variantLabel?: string` на элементе заказа (человекочитаемая строка вида "Krāsu numurs: A-11"), уже течёт через `CartItem` → `Order.items` автоматически. Отображение в `app/admin/orders/page.tsx` (редактор по `lineKey`, печать с `escapeHtml`).

### 8. Админка

`components/admin/products/ProductVariantGroupsFields.tsx` — тот же UI (nested `useFieldArray`: группы → опции). Меняется только маппинг при сохранении/загрузке:

- `lib/product-form-mapping.ts` `mapProductToFormValues`: извлекает `variantGroups` из `technicalSpecs.__variantGroupsJson` (парсит через `getVariantGroups`) в отдельное form-поле `variantGroups`, а оставшиеся `technicalSpecs` (без служебного ключа) — в обычное form-поле `technicalSpecs` как раньше.
- `mapFormValuesToProductPatch`: сериализует `values.variantGroups` обратно в `JSON.stringify(...)`, кладёт под `__variantGroupsJson` внутрь итогового объекта `technicalSpecs` patch (рядом с обычными ключами из `values.technicalSpecs`). Если `variantGroups` пуст — ключ не добавляется (не создаём пустой `[]`-мусор).
- `lib/product-overrides-store.ts` `mapDbToProduct`/`mapProductToDbCreate`: без изменений (они уже читают/пишут `technicalSpecs` целиком, новый ключ внутри JSON проходит транзитом).

Admin никогда не видит/не редактирует `__variantGroupsJson` как обычную строку характеристики — он работает с отдельным UI-блоком "Варианты (цвет/комплектация)", как и в прошлой версии.

### 9. Тесты

- `lib/product-variants.test.ts`: `getVariantGroups` — валидный JSON, отсутствующий ключ, битый JSON, не-массив.
- `lib/cart-store.test.ts`: как в прошлой версии (composite key, миграция персиста).
- `lib/product-form-mapping.test.ts`: round-trip `mapProductToFormValues`/`mapFormValuesToProductPatch` для `variantGroups` через `technicalSpecs.__variantGroupsJson`, включая случай "нет вариантов → ключ не создаётся".

---

## Вне скоупа

- Всё то же, что было вне скоупа в прошлой версии (отдельный сток/SKU на вариант, цветные сэмплы/hex, перевод названий групп/значений).
- Изменение `lib/sync/upsert-products.ts` (ERP-sync) — он не трогает `technicalSpecs` вообще, новый ключ не создаёт конфликтов с ним, никаких изменений не требуется.
- Phase 2 ERP-интеграция (`ProductVariant` отдельная модель под реальные данные ERP) — остаётся отложенной, как и было решено в `2026-06-09-erp-product-sync-design.md`. Эта версия не предвосхищает и не блокирует то решение — `__variantGroupsJson` живёт полностью внутри `technicalSpecs`, и при подключении реального ERP с собственной моделью вариантов её можно ввести отдельно, без конфликта с этим временным форматом.
