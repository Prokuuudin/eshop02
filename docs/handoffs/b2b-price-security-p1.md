# Handoff — P1: закрытие утечек B2B-цен

Единый журнал задачи для Codex / Claude Code. При возобновлении: прочитать этот файл,
сверить `git status`, ветку и HEAD с записями ниже, продолжить с первого незавершённого шага.
Факты репозитория и результаты тестов приоритетнее записей этого файла.

## Текущий статус: PASS (запушено, ждёт решения владельца о merge/deploy)

- Ветка: `fix/2026-11-01-b2b-price-security-p1` (запушена в origin)
- База: production SHA `2871240e` (`release/2026-11-01-plesk-combined`)
- Worktree: `C:\Users\User\eshop02-work\worktrees\eshop02-b2b-price-p1`
- HEAD: коммит `fix(security): stop guests inferring B2B prices` — точный SHA: `git log -1` в ветке
  (SHA коммита не может содержаться в самом коммите)

## Ограничения

- Production Neon, Plesk, GrinS — не трогать. В worktree нет `.env.local`.
- `npm run build` не запускался. Зависимости не обновлялись. Merge и deploy запрещены без владельца.

## Найденные векторы и исправления

| # | Вектор | Исправление |
|---|---|---|
| A1 | `POST /api/promo/campaigns/evaluate` без авторизации: `eligibleAmount` = цена × qty, `discount` = % от цены | `getServerUser()` до расчётов, гость → `401 {error:'unauthorized'}` |
| A2 | `POST /api/promo/validate` без авторизации: с известным кодом `discount`/`eligibleAmount` раскрывают цену | то же, гость → `401 {valid:false,error:'unauthorized'}` |
| B1 | `/[lang]/catalog?minPrice=&maxPrice=` (гость): состав выдачи / `totalProducts` → бинпоиск цены | `guestPriceGuard` в `getInitialCatalogProducts`: гость → min/max игнорируются |
| B2 | `getCatalogFacets` с min/max (гость): счётчики по реальной цене | `getCatalogFacets` сам определяет пользователя; гость → min/max игнорируются |
| B3 | `order=price-asc/price-desc` (гость): относительный порядок цен | гость → ценовая сортировка сбрасывается к default (name-* сохраняется) |
| UI | гость видел ценовой фильтр и price-сортировку, которые теперь не действуют | `ProductFilter` скрывает их при `!isAuthenticated` (только UX; сервер авторитетен) |

Проверены и не уязвимы: `/api/products` (min/max не принимает, цены редактируются), `/api/v1/products`
(API-key), `/api/search` (без цен), страница товара (redact + JSON-LD под `canSeePrices`),
клиентская фильтрация `Products.tsx` (учитывает `priceHidden`).
Гость не может добавить товар в корзину (`AddToCartButton` → auth gate), поэтому 401 на promo-API
не меняет пользовательский сценарий; клиент `checkout-promo-api.ts` при `!ok` возвращает `null`.

## Этапы

| Этап | Статус |
|---|---|
| 1. Git-состояние, worktree от `2871240e` | PASS |
| 2. Фикс A (promo evaluate + validate) | PASS |
| 3. Фикс B (каталог + фасеты + UI-контролы) | PASS |
| 4. Фикс C (`.gitattributes`: `*.json text eol=lf`) + 37 тестов `lib/sync/*wave*` | PASS |
| 5. Регрессионные тесты | PASS |
| 6. tsc / eslint / vitest без БД + живая проверка на локальном Docker Postgres | PASS |
| 7. Коммит + push | PASS |

## Изменённые файлы

- `app/api/promo/campaigns/evaluate/route.ts` (+ `route.test.ts`)
- `app/api/promo/validate/route.ts` (+ `route.test.ts`)
- `lib/initial-catalog-products.ts` (+ `lib/initial-catalog-products.test.ts`)
- `components/ProductFilter.tsx`
- `.gitattributes`
- `docs/handoffs/b2b-price-security-p1.md`

Хэши allowlist и эталонные JSON не менялись (`git diff 2871240e -- '*.json'` пуст).

## Проверки

- `tsc --noEmit`: 0 ошибок.
- `eslint .`: 0 ошибок, 63 warnings (как на `2871240e`, новых нет).
- vitest unit, полный прогон: 2834 pass / 1 fail. Упал `lib/sync/manual-price-query.test.ts`
  по таймауту 5 с (PGlite под нагрузкой полного прогона; плюс известный vitest
  `Timeout calling "onTaskUpdate"`, он был и на `2871240e`). Отдельно файл проходит 11/11. С изменениями не связан.
- 9 новых регрессионных тестов (7 каталог, 2 promo-API). На исходниках `2871240e` падают 6:
  4 теста оракула каталога (min/max, price-asc, price-desc, фасеты) и 2 guest-теста promo-API (red);
  на фиксе проходят все (green). Остальные 3 — защитные (гость без цен, name-сортировка, клиент без изменений).
- 9 файлов `lib/sync/*wave*` (ранее 37 падений из-за CRLF → SHA drift): 133/133 pass.
- Живая проверка: `next dev` на :3107 + одноразовый Docker `postgres:17-alpine` (`prisma db push`,
  3 тестовых товара 5/20/50 €, 1 клиент). Production Neon не использовался.
  - гость: evaluate → 401, validate → 401; клиент: оба → 200.
  - RU/LV/EN, гость: `?minPrice=19&maxPrice=21` → все 3 товара; `?order=price-desc` → порядок по умолчанию.
  - RU/LV/EN, клиент: диапазон → только товар за 20 €; `price-desc` → 50/20/5.
  - гостевой HTML каталога не содержит полей `price`; у клиента — 50/20/5.

## Риски / блокеры

- Остаточный (вне scope, не исправлено): `POST /api/orders` принимает гостевые заказы
  (captcha + 3/час), ответ содержит `total`. Способ дорогой и заметный персоналу (создаётся реальный заказ),
  но формально раскрывает цену. Решение — за владельцем.
- Фильтр `onSale` для гостя сохранён: раскрывает факт акции (price < oldPrice), но не значение цены.
- `getCatalogFacets` теперь делает собственный запрос сессии (+1 индексированный запрос на рендер каталога).
- Ветка основана на `2871240e`; хотфикс `bb55516e` (hero CTA) и `origin/main` её не содержат — при релизе
  нужен cherry-pick/merge в актуальную релизную линию.

## Следующий шаг

Владелец: ревью ветки и решение о релизе. Деплой и merge не выполнялись.
