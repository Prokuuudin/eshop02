# Hairshop Pro: аудит приглашений — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-invitations`.
- Stacked base: `055f3af7b1990b7220a739c904fe54b092f31232`, проверенный head открытого Draft PR #22 (`fix/2026-11-09-admin-audit-media`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #22 `open`, `draft=true`, `merged=false`, head точно `055f3af7…`, base `fix/2026-11-09-admin-audit-access-requests`; `static-and-unit` на `055f3af7` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42689788833/job/129406180594.
- Коммит реализации: `fa76b7f3` (`fix(audit): record invitations once and their delivery after commit`).
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-media`
  - head: `fix/2026-11-09-admin-audit-invitations`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-media...fix/2026-11-09-admin-audit-invitations?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Что делают маршруты

| Маршрут | БД | Внешняя отправка |
|---|---|---|
| `POST /api/admin/invitations` | `replaceInvitation`: удаляет неиспользованные `InvitationToken` пользователя, создаёт новый (хранится только sha256 токена) | SMTP-письмо со ссылкой `/auth/invite?token=…` |
| `POST /api/admin/invitations/sms` | `InvitationDelivery` (`channel: 'sms'`, `status: 'sent'`) | Нет: в production `503 sms_provider_not_configured` до любых записей; вне production — симуляция, текст возвращается администратору |
| `POST /api/admin/invitations/card` | обновление `User.cardNumber` или создание «спящего» аккаунта | Нет (UI затем отдельно вызывает `POST /api/admin/invitations` для нового клиента) |

## Реализовано

Права (`requireAdmin()` / `users.manage`), лимит пакета `INVITE_BATCH_SIZE = 20` (`no_user_ids`, `too_many`), исключение staff-аккаунтов и технических email, все коды ошибок и форма ответов сохранены. Новый `lib/invitation-dispatch.ts` — общие guard'ы; `replaceInvitation` теперь возвращает число заменённых открытых приглашений (прочие вызывающие значение игнорируют).

### Email-приглашения

1. Транзакция (уровень изоляции по умолчанию): advisory lock пакета → проверка повтора → advisory locks пользователей в стабильном порядке → для каждого: проверка «доставка в процессе» → `replaceInvitation` → `appendServerAudit` (`invitation.created` или `invitation.replaced`).
2. После коммита — SMTP по каждому выпущенному приглашению.
3. Когда результат известен — отдельная транзакция: `InvitationToken.status = 'error'` для неушедших, `InvitationDelivery` (`channel: 'email'`, `sent`/`error`), событие `invitation.delivery_recorded`. Если эта запись не удалась, ответ всё равно правдивый (200 со статусами), ошибка логируется, токены неушедших писем гасятся отдельным запросом.

`Serializable` убран сознательно: снимок такой транзакции берётся до ожидания advisory lock, и `appendServerAudit` прочитал бы устаревшую голову цепочки целостности. Сериализацию теперь дают advisory locks (пакет и пользователь).

### Повторы, конкуренция и явная повторная отправка

- **Технический повтор**: клиент передаёт заголовок `Idempotency-Key` (`[A-Za-z0-9._:-]{8,128}`, иначе `400 invalid_idempotency_key`). Ключ вместе с ID сотрудника становится `requestId` строк аудита. Повтор или параллельный дубль с тем же ключом под lock находит закоммиченные строки и отвечает `{ results, replayed: true }` (статусы из `invitation.delivery_recorded`, иначе `pending`; без `inviteUrl` — токен в открытом виде не хранится). Новых токенов, писем и событий нет. UI теперь отправляет новый ключ на каждое действие (`crypto.randomUUID()`); без заголовка запрос — новая явная отправка, как раньше.
- **Конкурентный запрос с другим ключом**: если у пользователя свежий (< 60 с) токен `sent` без записанной доставки, значит, его письмо ещё отправляется. Пользователь пропускается: в ответе `status: 'pending'` без `inviteUrl`, без нового токена, письма и события. Это исправляет прежнюю гонку, когда второй запрос заменял токен и первое письмо уходило с мёртвой ссылкой. UI показывает «уже отправляется: N» и не считает это ошибкой.
- **Явная повторная отправка** работает как раньше: после записанной доставки (успех или ошибка) новый запрос заменяет приглашение (`invitation.replaced`, `before: { openInvitations: n }`) и отправляет письмо. Если процесс упал до записи доставки, повтор снова доступен через 60 с.

### SMS

В одной транзакции под lock пакета — `InvitationDelivery` и `invitation.sms_recorded` (`after: { channel: 'sms', simulated: true, batchSize, userIds }`). Повтор с тем же ключом отдаёт те же тексты с `replayed: true` без новых строк. Явный повтор (новый ключ) записывается заново, как и раньше. Пустой пакет ничего не пишет. Production по-прежнему `503` без записей.

### Выдача карты

Существующий клиент: `SELECT "cardNumber" … FOR UPDATE`; та же карта (после нормализации) — no-op с прежним ответом `{ ok, userId, created: false }`, без записи и события. Иначе `update` + `invitation.card_assigned` (`before: { hasCard }`, `after: { hasCard: true, cardChanged, accountCreated: false }`). Новый клиент: `create` + событие с `accountCreated: true` в одной транзакции. `P2002` → `409 card_taken`, как раньше.

### Содержимое журнала

| Action | entity | Данные |
|---|---|---|
| `invitation.created` / `invitation.replaced` | `user` / userId | `before: null` или `{ openInvitations }`; `after: { channel: 'email', language, expiresAt, batchSize }` |
| `invitation.delivery_recorded` | `invitation_batch` / batchId | `{ channel: 'email', batchSize, sent: [userId], failed: [userId], pending: [userId] }` |
| `invitation.sms_recorded` | `invitation_batch` / batchId | `{ channel: 'sms', simulated: true, batchSize, userIds }` |
| `invitation.card_assigned` | `user` / userId | флаги `hasCard`, `cardChanged`, `accountCreated` |

Нет токенов и их хешей, email, телефонов, имён, номеров карт, текста письма или SMS (проверено тестами по конкретным значениям). Названия RU/LV/EN: «Создание приглашения» / «Ielūgums izveidots» / «Invitation created»; «Замена приглашения» / «Ielūgums aizstāts» / «Invitation replaced»; «Результат отправки приглашений» / «Ielūgumu nosūtīšanas rezultāts» / «Invitation delivery result»; «Запись SMS-приглашений» / «SMS ielūgumi reģistrēti» / «SMS invitations recorded»; «Назначение карты клиенту» / «Klientam piešķirta karte» / «Customer card assigned».

### Изменения контракта (совместимые)

- В `results` email-приглашений появился статус `pending` (без `inviteUrl`); в ответе повтора — `replayed: true`.
- Новый необязательный заголовок `Idempotency-Key`; некорректное значение → `400 invalid_idempotency_key`.
- Сбой записи результата доставки больше не превращает ответ в `500`: письма уже ушли, ответ 200 с фактическими статусами.

## Что подтверждено

- `app/api/admin/invitations/route.post.test.ts` (16, stateful harness: staged-транзакции, сериализация как у advisory locks, управляемые часы, SMTP подменён): отказ без прав без записей; пустой, не-массив и 21 ID; некорректный ключ; staff-фильтр; пакет 3 с одной ошибкой SMTP (токены и аудит закоммичены до первого письма, статусы, `delivery_recorded` с sent/failed, токен `error`, строки доставки); отсутствие секретов в аудите; откат всех токенов пакета и отсутствие писем при сбое аудита; сбой записи доставки (ответ 200, токен погашен); повтор с тем же ключом; параллельный дубль с тем же ключом; параллельный запрос с другим ключом во время SMTP (`pending`, один токен, одно письмо, одно событие); явная повторная отправка после доставки (`invitation.replaced`); немедленный повтор после ошибки доставки; повтор после истечения окна 60 с.
- `sms/route.test.ts` (11, новый): права, пакеты, ключ, production 503 без записей, строки доставки и одно событие без телефонов и текста, повтор, параллельный дубль, явный повтор, откат при сбое аудита, пустой пакет.
- `card/route.test.ts` (16): прежние 9 сценариев + аудит существующего и нового клиента без ПДн и номера карты, no-op той же карты, смена карты, две параллельные одинаковые выдачи → одна запись, откат обновления и создания при сбое аудита.
- `route.test.ts` (GET, 6), `invitations-api.test.ts` (новый ключ на каждое действие), `lib/admin-log-store.test.ts` (RU/LV/EN), `lib/invitations.test.ts`.
- Мутационная проверка: при отключённых проверке повтора и in-flight guard падают тесты повтора, параллельного дубля и конкурентного запроса.
- PostgreSQL-семантика на изолированном PGlite (scratch-каталог вне репозитория, схема из `prisma migrate diff`): 8/8 PASS — `pg_advisory_xact_lock(hashtext($1))` с параметрами, in-flight запросы по `InvitationToken`/`InvitationDelivery`, подсчёт заменённых приглашений, `SELECT "cardNumber" … FOR UPDATE`. Настоящая конкуренция двух соединений проверена только моделью: PGlite однопользовательский. Рабочая Neon не использовалась.

## Затронутые пути

- `lib/invitation-dispatch.ts` (новый), `lib/invitations.ts`
- `app/api/admin/invitations/route.ts`, `route.test.ts`, `route.post.test.ts` (новый)
- `app/api/admin/invitations/sms/route.ts`, `sms/route.test.ts` (новый)
- `app/api/admin/invitations/card/route.ts`, `card/route.test.ts`
- `app/[lang]/admin/invitations/invitations-api.ts`, `invitations-api.test.ts`, `useInvitationsPage.ts`
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `fa76b7f3` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/invitations lib/admin-log-store.test.ts 'app/[lang]/admin/invitations' lib/invitations.test.ts
# PASS: 8 files, 90 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 959 source modules

npm run test:unit -- --reporter=dot
# PASS: 372 files, 3176 tests

npx eslint <14 изменённых файлов>
# PASS

npm run check:encoding
# PASS: 1359 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **Одобрение заявки на доступ** (`PATCH /api/admin/access-requests/[id]`, PR #21) создаёт приглашение и отправляет письмо, но не пишет `InvitationDelivery`. Поэтому явная отправка из «Приглашений» в течение 60 с после одобрения вернёт `pending`. Решение — записывать доставку там так же; оставлено, чтобы не расширять PR.
- **Самостоятельная активация карты** (`lib/card-activation.ts`) тоже вызывает `replaceInvitation`, без per-user lock. Гонка с одновременной отправкой администратора теоретически возможна. Без аудита — это не админское действие.
- **Выдача карты существующему клиенту** перезаписывает другую карту без подтверждения. Поведение прежнее, теперь фиксируется как `cardChanged: true`.
- **SMS вне production** записывает `InvitationDelivery.status = 'sent'` для симуляции. Поведение прежнее; в событии аудита явно `simulated: true`.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлены `POST /api/admin/invitations` (выпуск и замена приглашений; результат доставки — отдельным событием после SMTP), `POST /api/admin/invitations/sms`, `POST /api/admin/invitations/card`.

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #22:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #22 было 23; этот PR закрывает три маршрута, остаётся **20**:

1. `PUT /api/admin/banner-groups`
2. `PUT /api/admin/banners/[id]`
3. `DELETE /api/admin/banners/[id]`
4. `POST /api/admin/banners/reorder`
5. `POST /api/admin/banners`
6. `DELETE /api/admin/blog/[id]`
7. `POST /api/admin/blog`
8. `POST /api/admin/broadcast`
9. `PUT /api/admin/campaigns/[id]`
10. `DELETE /api/admin/campaigns/[id]`
11. `POST /api/admin/campaigns`
12. `POST /api/admin/card-request`
13. `POST /api/admin/card-rules-campaign`
14. `PATCH /api/admin/contact-messages`
15. `PUT /api/admin/dashboard-prefs`
16. `PUT /api/admin/email-templates/[id]`
17. `POST /api/admin/email-templates/[id]/send-test`
18. `POST /api/admin/notifications/assets`
19. `POST /api/admin/products/[id]/notify-promo`
20. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-media`, head `fix/2026-11-09-admin-audit-invitations`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-media --head fix/2026-11-09-admin-audit-invitations`.
1. Следующий stacked PR — карточные рассылки: `POST /api/admin/card-request` (письмо об отклонении заявки) и `POST /api/admin/card-rules-campaign` (кампания правил карты: состояние в KV, пакетная отправка). Начать от зелёного head этого PR.
2. Проследить изменения KV-состояния кампании и отправку; изменение состояния и аудит — в одной транзакции, результат доставки — отдельно после SMTP (по образцу этого PR, переиспользуя `lib/invitation-dispatch.ts` для `Idempotency-Key`).
3. Сохранить права, размеры пакетов, блокировку кампании (`CAMPAIGN_LOCK_MS`) и API-контракт; в журнале — внутренние ID, канал, размеры и счётчики, без email, текста и заметок.
4. Тесты: отказ без прав, невалидный ввод, пакет, повтор, конкуренция, откат при сбое аудита, сбой SMTP после коммита.

Далее: остальные рассылки (`broadcast`, `notify-promo`, `stock-alerts/send`, `email-templates/[id]/send-test`), затем CMS-контент (баннеры, блог, кампании, шаблоны писем), hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-invitations
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/invitations lib/admin-log-store.test.ts 'app/[lang]/admin/invitations' lib/invitations.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
