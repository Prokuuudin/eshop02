# Hairshop Pro: аудит статуса обращений и настроек панели — handoff

Дата: 2026-11-10 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-10-admin-audit-contact-dashboard`.
- Stacked base: `551dd70a80a913f455bad54aa9ab476bad373e3a`, проверенный head открытого Draft PR #28 (`fix/2026-11-09-admin-audit-banners-blog-campaigns`).
- Проверка перед работой (публичный GitHub API, 2026-11-10): PR #28 `open`, `draft=true`, `merged=false`, head точно `551dd70a…`, base `fix/2026-11-09-admin-audit-email-assets`; `static-and-unit` на `551dd70a` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42774424209/job/129689485497.
- Коммит реализации: `bba18693` (`fix(audit): record contact message status and dashboard preferences`).
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-banners-blog-campaigns`
  - head: `fix/2026-11-10-admin-audit-contact-dashboard`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-banners-blog-campaigns...fix/2026-11-10-admin-audit-contact-dashboard?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Реализовано

### `PATCH /api/admin/contact-messages`

Хранилище: таблица `ContactMessage` (`answeredAt`, `answeredById`). Новый `lib/contact-message-status.ts` → `setContactMessageAnswered(id, answered, { actor, request })`:

1. Транзакция: `SELECT id FROM "ContactMessage" WHERE id = $1 FOR UPDATE` блокирует строку. Значения затем читаются через Prisma, а не raw SQL, чтобы timestamp не попал в известную ловушку timezone.
2. Если текущий статус совпадает с запрошенным — no-op: `answeredAt` и `answeredById` **сохраняют исходные значения**, события нет. Раньше повторное «отвечено» перезаписывало оба поля.
3. Иначе `update` + `appendServerAudit` в той же транзакции: `contact_message.marked_answered` или `contact_message.marked_unanswered`.

Сохранены: право `customers.read`, `400 id_required`, `404 message_not_found`, `500 server_error` (в том числе для некорректного JSON), ответ `{ id, answered }` (и для no-op), правило «всё, кроме `answered: false`, означает отвечено».

### `PUT /api/admin/dashboard-prefs`

Хранилище: `KeyValueSetting` с ключом `admin-dashboard-prefs:<ID сотрудника из сессии>`. `saveAdminDashboardPrefs(userId, input, { actor, request })` в `lib/admin-dashboard-prefs-server-store.ts`:

1. Транзакция, первой командой — `pg_advisory_xact_lock(hashtext('admin-dashboard-prefs:<userId>'))`. Затем чтение, частичное слияние (`{ ...существующие, ...входные }`) и нормализация прежним `normalize`.
2. Сравниваются нормализованные `cardOrder` и `favoriteCardIds`. Без изменений → ни записи, ни события, ответ — текущие настройки. Если ничего не сохранено и пришли значения по умолчанию, строка KV не создаётся.
3. Иначе `upsert` + `admin.dashboard_prefs_updated` в той же транзакции. В `before`/`after` только изменившиеся поля.

Параллельные запросы «порядок карточек» и «избранное» (UI шлёт их раздельно) теперь сериализуются и не затирают друг друга; раньше это был read-modify-write без блокировки. Сохранены: право `admin.access`, привязка к сотруднику из сессии, `GET`, ответ с сохранёнными настройками, `400 failed_to_save_dashboard_prefs` для некорректного JSON и любой ошибки сохранения или аудита.

### Содержимое журнала

| Action | entity | before / after |
|---|---|---|
| `contact_message.marked_answered` | `contact_message` / ID обращения | `answered`, `answeredAt` (ISO), `answeredById` |
| `contact_message.marked_unanswered` | то же | то же |
| `admin.dashboard_prefs_updated` | `admin_dashboard_prefs` / ID сотрудника | только изменившиеся `cardOrder` / `favoriteCardIds` (ID карточек панели) |

Имя, email, тема и текст обращения в журнал не попадают (проверено тестом по конкретным значениям). Названия RU/LV/EN: «Обращение отмечено как отвеченное» / «Ziņojums atzīmēts kā atbildēts» / «Contact message marked answered»; «Обращение отмечено как неотвеченное» / «Ziņojums atzīmēts kā neatbildēts» / «Contact message marked unanswered»; «Изменение настроек панели» / «Paneļa iestatījumi mainīti» / «Dashboard preferences updated».

## Что подтверждено

- `lib/contact-message-status.test.ts` (9, stateful harness: staged-транзакции, сериализация как у row lock):
  - отметка «отвечено» сотрудником из сессии; отмена с прежними значениями в `before`;
  - повтор «отвечено» сохраняет исходные `answeredAt`/`answeredById` без события; повтор «без ответа» — no-op;
  - отсутствующее обращение; отсутствие ПДн и текста в аудите; откат при сбое аудита;
  - два параллельных «отвечено» — сохраняется первый ответ, одно событие; параллельные противоположные запросы — оба перехода по порядку.
- `lib/admin-dashboard-prefs-server-store.test.ts` (9): частичное обновление порядка с сохранением избранного; только избранное; сброс порядка; нормализованный no-op без записи и события; значения по умолчанию без создания строки; раздельные настройки сотрудников; параллельные порядок и избранное не затирают друг друга; параллельные одинаковые — одна запись и одно событие; откат при сбое аудита; lock по ключу пользователя.
- `app/api/admin/contact-messages/route.test.ts` (10, новый) и `app/api/admin/dashboard-prefs/route.test.ts` (5, новый): права до изменений, невалидный ввод, коды ответов, передача actor/request из сессии, форма ответа при no-op, 404 и 500/400 при сбое.
- `lib/admin-log-store.test.ts` (RU/LV/EN).
- Мутационная проверка: без no-op guard падают 3 теста (повторы и параллельное «отвечено»).
- Изолированный PGlite (in-memory PostgreSQL вне репозитория, реальный `appendServerAudit` и `PrismaPg`, `TZ=Europe/Riga`): 12/12 PASS — `FOR UPDATE` по `"ContactMessage"`, повтор сохраняет исходный `answeredAt`, ISO-время в аудите совпадает с сохранённым (без сдвига TZ), advisory lock настроек, частичное слияние, no-op без события, откат настроек при отказе вставки аудита (CHECK-ограничение). Проверка выполнялась на ранее запущенном экземпляре PGlite: новый не смог занять порт 54329, после проверки порт свободен. Настоящая конкуренция двух соединений проверена только моделью. Рабочая Neon не использовалась.

## Затронутые пути

- `lib/contact-message-status.ts`, `lib/contact-message-status.test.ts` (новые)
- `lib/admin-dashboard-prefs-server-store.ts`, `lib/admin-dashboard-prefs-server-store.test.ts` (новый тест)
- `app/api/admin/contact-messages/route.ts`, `route.test.ts` (новый)
- `app/api/admin/dashboard-prefs/route.ts`, `route.test.ts` (новый)
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `bba18693` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/contact-messages app/api/admin/dashboard-prefs lib/contact-message-status.test.ts lib/admin-dashboard-prefs-server-store.test.ts lib/admin-log-store.test.ts
# PASS: 5 files, 75 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 962 source modules

npm run test:unit -- --reporter=dot
# PASS: 385 files, 3351 tests

npx eslint <10 изменённых файлов>
# PASS

npm run check:encoding
# PASS: 1375 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Карта покрытия после этого PR

### Ранее выявленные админские маршруты без записи в `AuditLog`

Этот PR закрывает последние два (`PATCH /api/admin/contact-messages`, `PUT /api/admin/dashboard-prefs`). **В ранее выявленном списке админских маршрутов без записи в `AuditLog` осталось 0.**

### Открытые задачи

**Вход и выход администраторов.** `POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin; при некоторых настройках компании пишется только fire-and-forget `CompanyActivityLog` (по коду).

**Аудит пишется после основного действия или в отдельной транзакции** (без изменений):

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

**Ранее зафиксированные находки** (решения владельца, не исправлялись):

- отправка на произвольный адрес: `card-request` без `accessRequestId`, отчёт по остаткам, тестовое письмо шаблона — нужен отдельный ограничитель адресов;
- одобрение заявки на доступ гейтится `customers.read`, которое есть и у `manager`;
- кампания правил карты теряет продвижение курсора при убийстве процесса посреди пакета; у `broadcast` нет `maxDuration`.

**Находка этого PR:** `PUT /api/admin/dashboard-prefs` по-прежнему нормализует нестроковое значение поля в «пусто» (`cardOrder` → `null`, `favoriteCardIds` → `[]`). Некорректный запрос сбрасывает настройку, а не отклоняется. Поведение прежнее и сохранено ради контракта; теперь такой сброс виден в журнале.

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-banners-blog-campaigns`, head `fix/2026-11-10-admin-audit-contact-dashboard`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-banners-blog-campaigns --head fix/2026-11-10-admin-audit-contact-dashboard`.
1. Следующий этап — постоянные события входа и выхода администраторов (`POST /api/auth/login`, `POST /api/auth/logout`): успешный вход, неудачная попытка для staff-аккаунта, выход; без пароля, токенов и хэша сессии в открытом виде. Не менять семантику аутентификации и сессий без трассировки затронутых API.
2. Затем — hardening post-operation audits, в первую очередь `POST /api/admin/grins-import/apply` (аудит атомарно с применением или по схеме «prepared → результат»).

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-10-admin-audit-contact-dashboard
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/contact-messages app/api/admin/dashboard-prefs lib/contact-message-status.test.ts lib/admin-dashboard-prefs-server-store.test.ts lib/admin-log-store.test.ts
npm run typecheck
npm run audit:architecture
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
