# BEM/Shadcn Cleanup — Design Spec

**Date:** 2026-06-27
**Status:** Approved

---

## Проблема

Аудит кодовой базы (через Explore-агента, см. память `project_bem_shadcn_audit`) нашёл системное нарушение проектного правила "UI-компоненты — Shadcn" (`user_preferences`): почти вся админка использует сырые HTML-элементы вместо shadcn:

- **46 raw `<select>`** вместо shadcn `Select` — в `app/admin/**` (заказы, конфиг, контент, маркетинг, бренды, бонусы, аккаунты, возвраты, отзывы, системные логи, уведомления, bulk-price, client-barcodes), плюс `components/InvoiceList.tsx`, `AuditLogViewer.tsx`, `InvoiceViewer.tsx`, `app/request-quote/page.tsx`.
- **13 raw `<input type="checkbox">`** вместо shadcn `Checkbox` — тоже почти всё в админке (blog, content/media, marketing/campaigns, notifications/send, orders, products/bulk-price, reviews).
- Dialog/модалки — чисто, нарушений не найдено.

Также найдены минорные нарушения правила про BEM-именование: корневые элементы в `components/account/*` (AccountOrdersSection, AccountProfileCard, AccountAddressesWidget) и в нескольких admin page-wrapper'ах (`blog`, `bonus`, `categories`) не имеют BEM-класса, только Tailwind-утилиты.

## Решение

### 1. Shadcn-замены (59 точек, ~25 файлов)

Механическая замена по уже established в проекте паттернам:

**Select**, паттерн как в `components/Reviews.tsx`/`components/admin/products/ProductBasicFields.tsx`:
```diff
-<select value={x} onChange={(e) => setX(e.target.value)} className="...">
-  <option value="a">Текст A</option>
-</select>
+<Select value={x} onValueChange={setX}>
+  <SelectTrigger className="...">
+    <SelectValue />
+  </SelectTrigger>
+  <SelectContent>
+    <SelectItem value="a">Текст A</SelectItem>
+  </SelectContent>
+</Select>
```

**Checkbox**, паттерн как в `components/CartDrawer.tsx`:
```diff
-<input type="checkbox" checked={x} onChange={(e) => setX(e.target.checked)} />
+<Checkbox checked={x} onCheckedChange={setX} />
```

**Особый случай — indeterminate.** `app/admin/orders/page.tsx` (хедер-чекбокс "выбрать все") использует native `el.indeterminate` через ref. Radix `Checkbox` (на котором собран shadcn-компонент) поддерживает это нативно через проп `checked: boolean | 'indeterminate'` — переносится как:
```tsx
<Checkbox
  checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
  onCheckedChange={toggleSelectAll}
/>
```

Все найденные `<select>` — простые одиночные (без `multiple`/`optgroup`, проверено грепом) — замена везде одного шаблона, без особых случаев.

Семантика value/onChange сохраняется 1:1. Визуальный стиль — то, что даёт shadcn по умолчанию (плюс существующий `className` на `SelectTrigger`, если у raw-select был кастомный стиль, переносим его на `SelectTrigger`).

### 2. BEM-фиксы

Добавить BEM-класс на корневой элемент (block-классы, без переименования существующих Tailwind-утилит — класс добавляется первым в списке classNames):

- `components/account/AccountOrdersSection.tsx` → `account-orders-section`
- `components/account/AccountProfileCard.tsx` → `account-profile-card`
- `components/account/AccountAddressesWidget.tsx` → `account-addresses-widget`
- `app/admin/blog/page.tsx` → `admin-blog-page`
- `app/admin/bonus/page.tsx` → `admin-bonus-page`
- `app/admin/categories/page.tsx` → `admin-categories-page`

### 3. Декомпозиция на задачи (по областям админки)

1. Заказы — `app/admin/orders/page.tsx`, `app/admin/orders/new/page.tsx`
2. Конфиг — `app/admin/config/locale/page.tsx`, `app/admin/config/shipping/page.tsx`
3. Контент — `app/admin/content/banners/page.tsx`, `app/admin/content/media/page.tsx`
4. Маркетинг — `campaigns/page.tsx`, `discounts/page.tsx`, `showcases/page.tsx`
5. Бренды/Бонусы/Аккаунты — `admin/brands/page.tsx`, `admin/bonus/page.tsx`, `admin/accounts/page.tsx`
6. Возвраты/Отзывы — `admin/returns/page.tsx`, `admin/reviews/page.tsx`
7. Системные + прочее — `system/logs/page.tsx`, `system/admin-log/page.tsx`, `notifications/send/page.tsx`, `products/bulk-price/page.tsx`, `client-barcodes/page.tsx`
8. Общие компоненты + публичная страница — `InvoiceList.tsx`, `AuditLogViewer.tsx`, `InvoiceViewer.tsx`, `app/request-quote/page.tsx`
9. BEM-фиксы — `components/account/*`, `app/admin/blog`, `app/admin/bonus`, `app/admin/categories`

Каждая задача — отдельный коммит, ревью (spec compliance + code quality), ручная проверка страницы в dev-сервере (открыть, проверить рендер и базовые сценарии: открыть select, выбрать опцию, поставить галку) перед фиксацией задачи как готовой.

## Тестирование

Конвенции рендер-тестов для `.tsx`-компонентов в проекте нет — не создаём её ради этой задачи. Верификация: `npx tsc --noEmit` после каждой задачи + ручная проверка в dev-сервере (см. выше).

## Вне скоупа

- Изменение бизнес-логики/поведения — только замена компонента, value/onChange-семантика сохраняется 1:1.
- Визуальный редизайн — стили остаются прежними, кроме того что shadcn даёт по умолчанию.
- Любые другие найденные в коде проблемы, не относящиеся к BEM/shadcn (не трогаем).
