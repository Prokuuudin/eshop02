# Handoff — P1: закрытие утечек B2B-цен

Единый журнал задачи для Codex / Claude Code. При возобновлении: прочитать этот файл,
сверить `git status`, ветку и HEAD с записями ниже, продолжить с первого незавершённого шага.
Факты репозитория и результаты тестов приоритетнее записей этого файла.

## Текущий статус: PASS — релиз готов к production deployment; ждёт подтверждения владельца (merge/deploy НЕ выполнялись)

**Каноничная копия handoff — в релизной ветке `release/2026-11-02-b2b-price-security`.**
Копия в P1-ветке заморожена на этапе A.

- Релизная ветка: `release/2026-11-02-b2b-price-security` (запушена), worktree
  `C:\Users\User\eshop02-work\worktrees\eshop02-release-b2b-price`
- Состав (поверх `bb55516e`, cherry-pick `-x`):
  1. `8c7a1503` ← `0f4db4d8` stop guests inferring B2B prices
  2. `de485ca4` ← `ab655cce` reject guest orders before pricing
  3. `cb4e4d40` ← `ae1a0be2` enforce company ordering role on the server
  4. docs-коммиты handoff (HEAD — `git log -1`)

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
| B. Релизная ветка от `bb55516e` + cherry-pick `0f4db4d8`, `ab655cce`, `ae1a0be2` | PASS — без конфликтов |
| C. Проверки на релизной ветке | PASS |
| D. Handoff | PASS |

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

### Этап B — итог

- `git worktree add -b release/2026-11-02-b2b-price-security … bb55516e`, затем
  `git cherry-pick -x 0f4db4d8 ab655cce ae1a0be2` — без конфликтов.
- Проверка состава: `git diff bb55516e HEAD` (без handoff) побайтно совпадает с `git diff 2871240e ae1a0be2`
  (без handoff) — посторонних изменений нет. `bb55516e` — предок; image zoom `a1ea3f3f` — НЕ предок.
- 12 файлов: `.gitattributes`, `app/api/orders/route.ts` (+test), `app/api/promo/campaigns/evaluate/route.ts` (+test),
  `app/api/promo/validate/route.ts` (+test), `components/ProductFilter.tsx`, `lib/auth-access.ts`,
  `lib/initial-catalog-products.ts` (+test), `docs/handoffs/b2b-price-security-p1.md`.
- Windows: worktree, извлечённый до правила `*.json eol=lf`, держит JSON с CRLF. После checkout релиза
  переизвлечь JSON (`git ls-files -z -- '*.json' | xargs -0 rm -f && git checkout -- $(git ls-files -- '*.json')`),
  иначе SHA-тесты `lib/sync/*wave*` падают. Индекс не меняется — только рабочие копии.
- Примечание: docs-коммит `9e755f95` записал handoff без этого раздела (сбой скрипта); исправлено следующим коммитом.

### Этап C — итог (на релизной ветке, код = `cb4e4d40`)

Окружение: worktree релиза, `node_modules` — junction на основное дерево (lockfile идентичен `bb55516e`,
релиз зависимостей не меняет), `prisma generate` с фиктивным URL, без `.env.local`. Живые проверки —
`next dev` + одноразовый Docker `postgres:17-alpine` (`prisma db push`). Production Neon/Plesk не затрагивались,
миграции не запускались.

| Проверка | Результат |
|---|---|
| `tsc --noEmit` | 0 ошибок |
| `eslint .` | 0 ошибок, 63 warnings (как в `bb55516e`) |
| vitest unit, полный набор | 355 файлов, **2841/2841 pass** |
| Гость: `POST /api/orders`, `/api/promo/campaigns/evaluate`, `/api/promo/validate` | 401 / 401 / 401 |
| Гость: каталог RU/LV/EN с `minPrice=19&maxPrice=21&order=price-desc` | все 3 товара, порядок по умолчанию; 0 полей `price` в HTML |
| Клиент без компании | заказ 200, цена с сервера 20 € (клиентская 0.01 проигнорирована), total 40 |
| Компания: `buyer` / `admin` | 200 / 200, `companyId` из сессии |
| Компания: `viewer` | 403 `forbidden_role` |
| Компания: `manager` (MFA-подтверждённая сессия) | 403 `forbidden_role` (без MFA сессия даёт 401 — как и раньше) |
| Идемпотентность: повтор buyer с тем же `Idempotency-Key` | тот же заказ, `idempotent: true` |
| Клиент: promo evaluate; каталог с фильтром/`price-desc` | 200; фильтр и сортировка работают |
| БД после прогона | 3 заказа (individual, buyer, company admin); от viewer/manager — ни одного |
| `git merge-tree` с `2871240e`, `bb55516e` (оба — предки), `origin/staging` `3afab567`, `origin/main` `001d7e71` | без конфликтов |
| Dry-run cherry-pick 3 fix-коммитов на `origin/main` (`merge-tree` + `commit-tree`, без изменения ссылок) | без конфликтов |

## Готовность к production deployment

Готово к деплою на Plesk после подтверждения владельца.

- Деплоить: `release/2026-11-02-b2b-price-security` (HEAD — `git log -1`; код = `cb4e4d40`).
- Миграций и изменений схемы нет; зависимостей нет. `build` в этой линии не вызывает `prisma migrate deploy`.
- Откат: передеплой `bb55516e` (или текущего прода `2871240e`). Данные не меняются.
- Post-deploy smoke:
  1. гость: `POST /api/orders` → 401; `POST /api/promo/campaigns/evaluate` и `/api/promo/validate` → 401;
  2. гость: `/lv/catalog?minPrice=1&maxPrice=2` — полный каталог, без цен; нет ценового фильтра и price-сортировки;
  3. клиент (buyer или без компании): цены видны, фильтр работает, тестовый заказ проходит;
  4. company viewer → 403 `forbidden_role` (если есть тестовый аккаунт).
- Изменения поведения, о которых стоит предупредить персонал:
  - гостевые заказы через API больше невозможны (в UI их и так не было);
  - company `viewer`/`manager` (и член компании без роли) не могут заказать даже через API (в UI уже было запрещено);
  - чекаут авторизованных больше не зависит от конфигурации Turnstile.

## Перенос в `main` (НЕ выполнялось — после подтверждения)

`git cherry-pick -x 8c7a1503 de485ca4 cb4e4d40` поверх `origin/main` (dry-run чистый). Не мержить релизную ветку целиком:
она принесла бы в `main` прод-линию `2871240e` и `bb55516e`, а это отдельное решение о синхронизации `main` с Plesk.

## Оставшиеся риски

- `User.approvalRequired` (workflow одобрения заказов компании) хранится, но сервером не применяется — вне scope, нужна отдельная задача.
- `teamRole='manager'` одновременно роль компании и роль персонала (доступ к админ-панели) — модель двусмысленна;
  запрет заказа для него соответствует решению владельца.
- `canPlaceOrders(null)` по-прежнему `true` только ради UI (гость без корзины); сервер отвечает гостю 401 до этой проверки.
- Клиентский код Turnstile в чекауте — мёртвый, сервером игнорируется.
- Фильтр `onSale` для гостя раскрывает факт акции, но не цену.
- Не обновлённые зависимости из аудита 11-01 (next 16.3.3, nodemailer, zod, sharp) — отдельный релиз.

## Следующий шаг

Владелец: подтвердить деплой `release/2026-11-02-b2b-price-security` на Plesk; затем smoke по списку выше;
затем отдельно — cherry-pick в `main`.

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
