# Handoff — P1: закрытие утечек B2B-цен

Единый журнал задачи для Codex / Claude Code. При возобновлении: прочитать этот файл,
сверить `git status`, ветку и HEAD с записями ниже, продолжить с первого незавершённого шага.
Факты репозитория и результаты тестов приоритетнее записей этого файла.

## Текущий статус: IN PROGRESS — финальный релиз (этап A PASS; этапы B–C в работе)

### Решения владельца (2026-11-02)

1. Гостевые заказы запрещены (подтверждает `ab655cce`).
2. Заказывают только авторизованные пользователи с правами.
3. Роли компании `viewer` и `manager` не должны обходить UI-запрет через API.
4. Production Neon и Plesk не трогать. База релиза — `bb55516e`; image zoom `a1ea3f3f` НЕ включать.
   Merge в `main` и deploy — только после отдельного подтверждения.

### Этапы финального релиза

| Этап | Статус |
|---|---|
| A. Серверная проверка роли в `POST /api/orders` | PASS — `ae1a0be2` в P1-ветке |
| B. Релизная ветка от `bb55516e` + cherry-pick `0f4db4d8`, `ab655cce`, `ae1a0be2` | TODO |
| C. Проверки на релизной ветке | TODO |
| D. Handoff | обновляется по этапам |

### Этап A — итог

- Модель: роль сотрудника компании — `User.teamRole` (`viewer`/`buyer`/`manager`/`admin`) + `User.companyId`;
  правило UI — `canPlaceOrders` (`lib/auth-access.ts`): с компанией — только `buyer`/`admin`; без компании — можно.
  Внимание: `teamRole='manager'` также даёт доступ персонала к админ-панели (`lib/admin-permissions.ts`).
- Реализация: тот же `canPlaceOrders` (тип параметра расширен до структурного, общий для `User` и `ServerUser`)
  вызывается в `POST /api/orders` сразу после 401-проверки, до rate-limit, цен, записи и писем; отказ → `403 {error:'forbidden_role'}`.
  Роль читается из БД при каждом запросе (`getServerUser`). Права в БД не менялись.
- Другие пути создания заказов: `/api/v1/orders` — запись только по API-ключу компании (ключ выпускает лишь
  `teamRole=admin`; сессия получает `apiAccess=false` → 403); `/api/admin/orders` — персонал, `orders.update`.
- Тесты: viewer / manager / член компании без роли → 403 без лимитов/цен/записи/писем; buyer / company admin /
  клиент без компании → 200. Red: 3 теста запрета падают без проверки. Целевые наборы 134/134, tsc 0, eslint 0.

---

## Предыдущий статус (этапы 1–2): PASS

- Ветка: `fix/2026-11-01-b2b-price-security-p1` (запушена в origin)
- База: production SHA `2871240e` (`release/2026-11-01-plesk-combined`)
- Worktree: `C:\Users\User\eshop02-work\worktrees\eshop02-b2b-price-p1`
- Коммиты поверх `2871240e`:
  1. `0f4db4d8` fix(security): stop guests inferring B2B prices — этап 1 (promo-API, каталог, `.gitattributes`)
  2. `ab655cce` fix(security): reject guest orders before pricing — этап 2 (`POST /api/orders`)
  3. docs: этот handoff (HEAD; точный SHA — `git log -1`, SHA коммита не может быть записан в нём самом)

## Ограничения

- Production Neon, Plesk, GrinS — не трогать. В worktree нет `.env.local`.
- `npm run build` и миграции не запускались. Зависимости не обновлялись.
- Merge и deploy запрещены без отдельного разрешения владельца.

## Этап 1 (PASS, `0f4db4d8`) — кратко

| # | Вектор | Исправление |
|---|---|---|
| A1 | `POST /api/promo/campaigns/evaluate` гостю отдавал `eligibleAmount`/`discount` | 401 до расчётов |
| A2 | `POST /api/promo/validate` с известным кодом | 401 до расчётов |
| B1–B3 | каталог/фасеты: `minPrice`/`maxPrice`/`price-*` для гостя — ценовой оракул | гостю игнорируются на сервере; `ProductFilter` скрывает контролы |
| C | CRLF → SHA drift в 37 тестах `lib/sync/*wave*` | `*.json text eol=lf` |

## Этап 2 (PASS, `ab655cce`) — гостевые заказы

### Факты (до исправления, `2871240e`)

- Гость **мог** создать заказ прямым `POST /api/orders`: Turnstile (если настроен) + лимит 3/час.
- Ответ отдавал полный заказ: `order.items[].price`, `subtotal`, `discount`, `delivery`, `total`;
  плюс письмо-подтверждение с суммой на любой указанный email → точная B2B-цена.
- Сессии с `mustChangePassword` и admin без MFA → `getServerUser()` = null → считались гостями
  и тоже могли заказывать (противоречит CLAUDE.md: onboarding/forced-password-change без доступа к защищённым операциям).
- Гость не мог оплатить свой Paysera-заказ: `/api/orders/[id]/pay` требует пользователя (`canAccessOrder(null)` = false).

### Вывод: гостевые заказы бизнес-правилами НЕ предусмотрены

- Правило магазина (владелец): гости смотрят каталог без цен, «ни прямо, ни косвенно»; гостевой заказ
  неизбежно раскрывает цену (ответ, письмо, счёт).
- Витрина с 06-14 не даёт гостю корзину: `AddToCartButton` → auth gate; все прочие входы в корзину
  (`account/templates`, reorder, wishlist, repeat) — только в аккаунте; корзина привязана к пользователю
  (`cart-store`: без `ownerId` → `items: []`). Путь гостя к чекауту существовал только через прямой API.
- Против: клиентский хелпер `canPlaceOrders(null) = true` с тестом «keeps guest checkout available» (08-31),
  гостевая капча/лимиты на сервере. Это инженерные остатки без документированного решения владельца;
  в UI недостижимы.

### Исправление

- `app/api/orders/route.ts`: `getServerUser()` — первым действием; гость → `401 {error:'unauthorized'}`
  до валидации, rate-limit, цен, записи и писем.
- Удалены ставшие недостижимыми гостевые ветки: Turnstile (проверка конфигурации + токен), гостевой
  тир лимита (3/час), гостевая резервация стока. Для авторизованных без изменений: лимит 10/час
  (ip + email + session), `checkoutKey = sha256(userId:key)`, `userId`/`companyId` из сессии,
  резерв только для `paysera`/`card`.
- Побочный эффект: неверная конфигурация Turnstile больше не роняет чекаут авторизованных в 503.
- `canPlaceOrders` (клиент) не менялся: при `false` гость увидел бы текст «для роли менеджера»;
  чекаут гостю и так недостижим.
- Связанные endpoints проверены — уже требуют пользователя: `orders/[id]/pay`, `orders/[id]/repeat`,
  `orders/my`, `invoices`, `returns`, `rfq`; `v1/orders` — API-key.
- Откат решения (если владелец всё же хочет гостевые заказы): `git revert ab655cce`; этап 1 от него не зависит.

## Изменённые файлы (вся ветка относительно `2871240e`)

- `app/api/promo/campaigns/evaluate/route.ts` (+ test)
- `app/api/promo/validate/route.ts` (+ test)
- `lib/initial-catalog-products.ts` (+ test)
- `components/ProductFilter.tsx`
- `app/api/orders/route.ts` (+ `route.test.ts`)
- `.gitattributes`
- `docs/handoffs/b2b-price-security-p1.md`

Хэши allowlist и эталонные JSON не менялись.

## Проверки

Этап 1 — см. коммит `0f4db4d8` (tsc/eslint/vitest + живая проверка каталога и promo-API в RU/LV/EN).

Этап 2:
- `tsc --noEmit`: 0 ошибок. `eslint .`: 0 ошибок, 63 warnings (без изменений с `2871240e`).
- vitest unit, полный прогон: **355 файлов, 2835/2835 pass** (флак `manual-price-query` в этот раз не проявился).
- Тесты заказа: 65/65 в `app/api/orders/route.test.ts`. Новые: гость → 401 без rate-limit/цен/записи/писем;
  привязка заказа к пользователю и компании. Обновлены (смысл сохранён): поля владения из тела игнорируются,
  `userId` берётся из сессии; гостевые тесты Turnstile/лимита заменены. Red-проверка: гостевой тест
  падает на `route.ts` из `0f4db4d8`, проходит на `ab655cce`.
- Смежные наборы: checkout (клиент), `auth-access`, `orders-data-store` — 152/152 в целевом прогоне.
- Живая проверка: `next dev` + одноразовый Docker `postgres:17-alpine` (`prisma db push`, тестовые товары,
  1 клиент, GrinS-гейт открыт только в этой БД). Production Neon не использовался.
  - гость: `POST /api/orders` → 401 (и с поддельным `turnstileToken`, и при открытом гейте).
  - клиент: заказ `pickup`/`bank`, 2 × товар за 20 € с клиентской ценой 0.01 → 200, `items[].price` = 20,
    `total` = 40 (цена с сервера), `userId` = клиент, `unpaid`, `committed`; повтор с тем же
    `Idempotency-Key` → тот же заказ (`idempotent: true`); `/api/orders/my` показывает заказ.
- `git merge-tree` (без изменения дерева): HEAD сливается без конфликтов с
  `origin/hotfix/2026-11-01-hero-cta-on-combined` (`bb55516e`), `origin/release/2026-11-01-product-image-zoom`
  (`a1ea3f3f`) и `origin/main` (`001d7e71`). Файлы P1 ни одной из этих линий не затронуты.

## Перенос в релиз (НЕ выполнялось — на согласование)

Состояние на 2026-11-02:
- Прод Plesk: `2871240e` (по последним данным; доступа к Plesk нет).
- `origin/hotfix/2026-11-01-hero-cta-on-combined` = `bb55516e` = `2871240e` + hero CTA (ждёт деплоя).
- `origin/staging` = `origin/release/2026-11-01-plesk-pre-product-image-zoom` = `3afab567` (`bb55516e` + staging-chore).
- `origin/release/2026-11-01-product-image-zoom` = `a1ea3f3f` (+ image zoom; статус деплоя неизвестен).
- `origin/main` = `001d7e71`: 7 коммитов прод-линии `2871240e` в `main` отсутствуют, 3 коммита `main` — не в проде.

Рекомендуемый безопасный способ:
1. Релизная ветка от `bb55516e` (сохраняет hero CTA и всё из `2871240e`):
   `git switch -c release/2026-11-02-b2b-price-security origin/hotfix/2026-11-01-hero-cta-on-combined`
   затем `git cherry-pick 0f4db4d8 ab655cce <handoff-commit>` (или `git merge --no-ff fix/2026-11-01-b2b-price-security-p1`
   — ветка основана на `2871240e`, предке `bb55516e`, поэтому merge приносит только P1).
   Если релизом должен стать image zoom — та же операция поверх `a1ea3f3f` (merge-tree тоже чистый).
2. На релизной ветке: tsc, eslint, `vitest run --config vitest.config.ts`; staging/preview по рецепту без прод-БД.
3. Plesk-деплой — только по решению владельца; post-deploy smoke: гость → 401 на
   `/api/orders`, `/api/promo/*`; каталог гостя без цен; клиент оформляет заказ.
4. `main`: **cherry-pick** `0f4db4d8` и `ab655cce`, а не merge ветки. Merge принёс бы в `main` ещё и 7 коммитов
   прод-линии `2871240e` — это отдельное решение о синхронизации `main` с Plesk.

## Риски / открытые вопросы

- Если владелец всё же хочет гостевые заказы: `git revert ab655cce` → риск этапа 2 возвращается.
  Тогда минимальная альтернатива — гостевой заказ без цен в ответе и письме, с подтверждением цены
  менеджером, но это изменение бизнес-процесса.
- Отдельная находка (не исправлялась, вне scope): сервер не проверяет `teamRole` компании при заказе.
  `canPlaceOrders` запрещает заказ ролям `viewer`/`manager` только в UI; через API они могут заказывать.
  Это вопрос авторизации внутри компании, к утечке цен не относится. Нужно решение владельца.
- Клиентский код Turnstile в чекауте (`turnstileToken`) остался и сервером игнорируется — безвредный мёртвый код.
- Фильтр `onSale` для гостя раскрывает факт акции, но не цену (без изменений с этапа 1).

## Следующий шаг

Владелец: подтвердить вывод «гостевые заказы не предусмотрены» и выбрать релизную базу
(`bb55516e` или `a1ea3f3f`). После этого — релизная ветка по плану выше, проверки, деплой по отдельному разрешению.
