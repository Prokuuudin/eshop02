# Variant Options v3: картинки опций + корректный пересчёт цены — Design Spec

**Date:** 2026-07-07
**Status:** Approved (autonomous session, прямое ТЗ пользователя)
**Extends:** `2026-06-25-product-variant-options-v2-design.md` (хранилище `technicalSpecs.__variantGroupsJson` — без изменений)

## Задача

На примере PANDA GALAXY BASIC (id 18509, hairshop.lv/lv/armchair-galaxy-basic) обеспечить
отображение вариантов как на исходном магазине:

- **COLOR BASIC** — 14 цветов, каждый с картинкой-свотчем (nopCommerce ImageSquares, ctrl=45);
- **BASE** — 3 конструкции с картинками и корректировкой цены («BASE XM [+46,04 €]», «BASE XT/ [−42,50 €]»);
- пересчёт цены при выборе клиентом;
- для остальных товаров с вариантами — адекватный вывод (165 товаров dropdown, из них 647 опций
  имеют фото товара в этом варианте через `ProductAttributeValue.PictureId`).

## Найденные дефекты текущей реализации

1. **PriceAdjustment залит net** (−35.12/+38.05), а цены в Neon gross (×1.21, НДС Латвии).
   На сайте-источнике −42.50/+46.04. Пересчёт цены занижен/искажён.
2. **Картинки опций не экспортировались вообще** (`ImageSquaresPictureId`, `PictureId` не в SQL-запросе).
3. UI — только shadcn Select со значением-кодом: ни картинок, ни корректировок цены в списке.
4. `IsPreSelected` не переносился: на hairshop 111 + BASE XC выбраны по умолчанию, у нас пусто.

`ColorSquaresRgb` в исходной базе не используется нигде (0 строк) — не переносим.

## Решение

### Данные (расширение JSON внутри technicalSpecs.__variantGroupsJson, схема Neon не меняется)

```ts
export interface VariantOption {
  value: string
  priceAdjustment?: number   // ТЕПЕРЬ gross € (×1.21), тот же базис что Product.price
  image?: string             // URL картинки опции (ImageSquaresPictureId, иначе PictureId)
  preselected?: boolean      // IsPreSelected из nopCommerce
}

export interface VariantGroup {
  name: string
  required: boolean
  displayType?: 'imageSquares' // ctrl=45; отсутствует = dropdown
  options: VariantOption[]
}
```

URL картинок — паттерн nopCommerce thumb-handler (подтверждён на живой странице):
`https://hairshop.lv/content/images/thumbs/{id, 7 цифр}[_{SeoFilename}].{ext}`
(у свотчей SeoFilename пустой → `0021552.jpeg`).

### Экспорт/бэкфилл

- `scripts/export-mssql-to-json.ps1`, запрос `product_attributes`: + `ROUND(PriceAdjustment*1.21,2)`,
  `AttributeControlTypeId`, `IsPreSelected`, LEFT JOIN Picture ×2 (imgSquares + picture) → id/seo/mime.
- `scripts/migrate-product-variants.ts`: собирает расширенный `VariantGroup[]`, строит URL картинок,
  перезаписывает `__variantGroupsJson` (тот же UPDATE merge). Перезапуск обновляет все 183 товара.

### UI (`components/ProductVariantSelector.tsx`)

- Группа `displayType === 'imageSquares'` → грид плиток: кнопка = картинка (~64px, object-contain)
  + код значения + корректировка цены («+46,04 €» / «−42,50 €», `formatEuro`), выбранная — ring.
- Остальные группы → shadcn Select как раньше, но в пунктах: миниатюра 24px (если у опции есть image)
  + значение + корректировка цены.
- Преселект: `getPreselectedVariants(groups)` в `lib/product-variants.ts`; `ProductInfo` инициализирует
  `useState(() => getPreselectedVariants(variantGroups))` — цена сразу как на hairshop (781 €).
- Пересчёт цены уже реализован (`sumPriceAdjustment` → `adjustedPrice` → корзина `price + adjustment`),
  чинится данными (gross) и видимостью корректировок в UI.

### Админка

`productFormSchema.ts` (zodResolver стрипает неизвестные ключи — обязательно расширить схему):
опция + `image`, `preselected`; группа + `displayType`. `ProductVariantGroupsFields.tsx`: input URL
картинки, чекбокс «выбрано по умолчанию», чекбокс группы «плитки с картинками».
`product-form-mapping.ts` менять не нужно (variantGroups проходят целиком).

### Тесты

- `lib/product-variants.test.ts`: `getPreselectedVariants` (пусто/один на группу/без preselected).
- `lib/product-form-mapping.test.ts`: round-trip с image/preselected/displayType.

## Вне скоупа

- Смена главной картинки галереи при выборе варианта (плитки/миниатюры уже показывают вид варианта).
- Отдельный сток/SKU на вариант, переводы названий групп — как раньше.
- ERP Phase 2 — формат остаётся временным внутри technicalSpecs.
