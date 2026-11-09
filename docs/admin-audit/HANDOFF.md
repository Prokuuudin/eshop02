# Hairshop Pro: аудит карточных рассылок — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-card-mailings`.
- Stacked base: `a0370069ec0fe5a604c55fc83bf98d5d3a4e2095`, проверенный head открытого Draft PR #23 (`fix/2026-11-09-admin-audit-invitations`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #23 `open`, `draft=true`, `merged=false`, head точно `a0370069…`, base `fix/2026-11-09-admin-audit-media`; `static-and-unit` на `a0370069` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42693719976/job/129419894460.
- Коммит реализации: `2c55020b` (`fix(audit): record card rejection emails and rules campaign batches`).
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-invitations`
  - head: `fix/2026-11-09-admin-audit-card-mailings`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-invitations...fix/2026-11-09-admin-audit-card-mailings?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Что делают маршруты

| Маршрут | Состояние | Внешняя отправка |
|---|---|---|
| `POST /api/admin/card-request` (`action: 'reject'`) | Нет изменений в БД (заявка отклоняется раньше через `PATCH /api/admin/access-requests/[id]`) | SMTP-письмо об отклонении на `email` из тела запроса; `approve` → `410 legacy_approval_disabled` |
| `POST /api/admin/card-rules-campaign` | KV `card-rules-campaign`: `runningSince` (замок на `CAMPAIGN_LOCK_MS = 120 000 мс`), `cursor`, `sentCount`, `errorCount`, `finished`, `lastRunAt`; `reset` обнуляет | SMTP: до `CAMPAIGN_BATCH_SIZE = 50` писем с правилами карты за вызов |

## Реализовано

Права сохранены: `card-request` — `requireAdminPermission('customers.read')`, кампания — `requireAdmin()`. Сохранены размер пакета, замок кампании, ответы `409 busy` / `409 finished`, `{ state }` для reset, `{ state, processed }` для пакета, коды card-request (`invalid_json` 400, `missing_fields` 422, `unknown_action` 400, `legacy_approval_disabled` 410, `email_failed` 500). Переиспользованы `invitationBatchId` и `lockBatch` из `lib/invitation-dispatch.ts` (PR #23).

### Кампания правил карты

1. **Захват или сброс** — одна транзакция под advisory lock кампании: чтение KV → проверка повтора по `Idempotency-Key` → `finished` / `busy` → запись KV → `appendServerAudit` (`card_rules_campaign.batch_started` или `card_rules_campaign.reset`). Сбой аудита откатывает захват: замок не ставится, письма не уходят. `Serializable` заменён advisory lock: снимок сериализуемой транзакции берётся до ожидания lock, и `appendServerAudit` прочитал бы устаревшую голову цепочки целостности.
2. **SMTP** — после коммита, как раньше: курсор двигается на каждом получателе, неподходящие строки пропускаются.
3. **Результат** — отдельная транзакция: итоговое KV (курсор, счётчики, снятый замок) + `card_rules_campaign.batch_completed`. Если аудит результата не записался, KV сохраняется отдельно (лог `card_rules_campaign_result_audit_failed`), чтобы следующий пакет не повторил отправленное; ответ 200. При исключении после захвата (например, недоступны шаблоны) KV сохраняется с `interrupted: true`, ответ `500 server_error`, как раньше.
4. **Сброс** уже нулевой кампании — no-op без записи и события.

### Письмо об отклонении

1. Тело письма строится как раньше.
2. Транзакция под lock ключа: проверка повтора → проверка необязательного `accessRequestId` (заявка должна существовать, иметь статус `rejected` и тот же email, иначе `409 request_mismatch`) → `access_request.rejection_email_prepared`. Сбой аудита → `500 email_failed`, письмо не уходит.
3. SMTP после коммита.
4. `access_request.rejection_email_recorded` со `status: 'sent' | 'failed'`. Сбой этой записи логируется, ответ остаётся правдивым.

Без `accessRequestId` письмо отправляется как раньше, событие пишется с `entityId: 'unlinked'`, `linked: false`. UI теперь передаёт `accessRequestId`, а сообщение «уведомление отправлено» показывает только при `res.ok` (раньше показывалось и при 500).

### Повторы и конкуренция (`Idempotency-Key` из #23)

| Ситуация | Кампания | Письмо об отклонении |
|---|---|---|
| Технический повтор с тем же ключом после завершения | `{ state, processed, replayed: true }`; следующий пакет **не** отправляется | `{ ok: true, replayed: true }`; повторного письма нет |
| Повтор сброса с тем же ключом | `{ state, replayed: true }`; прогресс после сброса **не** стирается | — |
| Параллельный дубль с тем же ключом во время отправки | `409 busy` | `409 in_progress` |
| Параллельный запуск с другим ключом | `409 busy` (как раньше) | Отдельная явная отправка |
| Явный повтор (новое действие → новый ключ) | Следующий пакет, как раньше | Новое письмо, как раньше |
| Тот же ключ после записанного сбоя SMTP | — | Разрешена новая попытка |

UI отправляет новый ключ на каждый вызов: каждый шаг цикла кампании, каждый сброс и каждое письмо об отклонении. Без заголовка запрос — новая явная операция.

### Содержимое журнала

| Action | entity | Данные |
|---|---|---|
| `card_rules_campaign.batch_started` | `campaign` / `card-rules-campaign` | before/after: `sentCount`, `errorCount`, `cursor` (ID пользователя), `finished`, `running`; `channel`, `batchLimit` |
| `card_rules_campaign.batch_completed` | то же | `processed`, `sent`, `failed`, `skipped`, `failedUserIds`, `interrupted` + итоговое состояние |
| `card_rules_campaign.reset` | то же | состояние до и после |
| `access_request.rejection_email_prepared` | `access_request` / ID заявки или `unlinked` | `channel`, `language`, `linked`, `hasNote` |
| `access_request.rejection_email_recorded` | то же | `channel`, `status` |

Нет адресов, имён, номеров карт, заметок, темы и текста писем (проверено тестами по конкретным значениям). Названия RU/LV/EN: «Запуск пакета рассылки правил карты» / «Kartes noteikumu kampaņas pakete sākta» / «Card rules campaign batch started»; «Результат пакета рассылки правил карты» / «Kartes noteikumu kampaņas paketes rezultāts» / «Card rules campaign batch result»; «Сброс рассылки правил карты» / «Kartes noteikumu kampaņa atiestatīta» / «Card rules campaign reset»; «Подготовка письма об отклонении заявки» / «Sagatavota pieteikuma noraidījuma vēstule» / «Rejection email prepared»; «Результат письма об отклонении заявки» / «Pieteikuma noraidījuma vēstules rezultāts» / «Rejection email delivery result».

### Изменения контракта (совместимые)

- Необязательный заголовок `Idempotency-Key` (некорректный → 400 `invalid_idempotency_key`; у card-request в формате `{ ok: false, code }`); поле `replayed: true` в ответах повтора.
- card-request: необязательное поле `accessRequestId` (не строка или длиннее 100 → `422 invalid_access_request_id`; несовпадение → `409 request_mismatch`); `409 in_progress` для параллельного дубля.
- Кампания: при сбое аудита результата ответ 200 (KV сохранён), а не 500.

## Что подтверждено

- `card-rules-campaign/route.post.test.ts` (19, stateful harness: staged KV и аудит, сериализация как у advisory lock, реальные `readCampaign`/`writeCampaign`, SMTP подменён):
  - права и ключ: отказ без прав без изменений; некорректный ключ; `finished` → 409;
  - пакет: захват и событие закоммичены до первого письма; частичный сбой (2 отправлено, 1 ошибка; `failedUserIds`; курсор; `finished`); нет адресов, имён и текста в аудите; пропуск неподходящей строки; полный пакет 50 и продолжение без повторов;
  - сбои: откат захвата при сбое аудита (писем нет, следующий запуск работает); сбой аудита результата (курсор сохранён, повторов нет); прерванный пакет (`interrupted`, замок снят);
  - конкуренция и повторы: параллельный запуск → `busy`; технический повтор → replay без следующего пакета; параллельный дубль → `busy`, одна отправка; устаревший замок перехватывается, свежий — `busy`;
  - сброс: событие before/after; no-op; повтор сброса не стирает прогресс; откат при сбое аудита.
- `card-request/route.test.ts` (19, новый; SMTP подменён):
  - права, JSON, поля, `unknown_action`, 410 для approve, `accessRequestId`, ключ — без отправки и аудита;
  - три вида `request_mismatch`;
  - порядок «событие → SMTP → результат»; отсутствие ПДн, заметки и текста; unlinked-вызов;
  - сбой аудита до SMTP (письма нет); сбой SMTP (`failed`, 500); повтор тем же ключом после сбоя; сбой аудита результата (ответ `ok`);
  - replay доставленного; параллельный дубль → `in_progress`; явный повтор новым ключом.
- `card-rules-campaign/route.test.ts` (GET, 5) и `lib/admin-log-store.test.ts` (RU/LV/EN).
- Мутационная проверка: при отключённых проверках повтора падают тесты технического повтора, параллельного дубля и повтора сброса.
- Нового raw SQL нет; `pg_advisory_xact_lock(hashtext($1))` проверен на PGlite в PR #23. Реальная PostgreSQL-конкуренция проверена только моделью. Рабочая Neon не использовалась; реальные письма не отправлялись.

## Затронутые пути

- `app/api/admin/card-request/route.ts`, `route.test.ts` (новый)
- `app/api/admin/card-rules-campaign/route.ts`, `route.test.ts`, `route.post.test.ts` (новый)
- `app/[lang]/admin/invitations/invitations-api.ts`
- `app/[lang]/admin/client-barcodes/useAdminClientBarcodesPage.tsx`
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `2c55020b` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/card-request app/api/admin/card-rules-campaign lib/admin-log-store.test.ts
# PASS: 4 files, 70 tests (19 + 19 + 5 + 27)

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 959 source modules

npm run test:unit -- --reporter=dot
# PASS: 374 files, 3217 tests

npx eslint <9 изменённых файлов>
# PASS

npm run check:encoding
# PASS: 1361 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **`card-request` без `accessRequestId` — по сути open relay.** Любой сотрудник с `customers.read` (в том числе `manager`) может отправить брендированное письмо «об отклонении» на произвольный адрес с произвольными именем и комментарием. Поле оставлено необязательным ради контракта; теперь каждое такое письмо видно в журнале как `unlinked`. Рекомендация: после выката нового UI сделать `accessRequestId` обязательным и брать email и имя из заявки, а не из тела запроса.
- **Обрыв процесса посреди пакета кампании.** Курсор пишется только в конце пакета или в `catch`. При убийстве процесса (а не исключении) продвижение теряется, и после истечения `CAMPAIGN_LOCK_MS` до 50 писем могут уйти повторно. Поведение прежнее; теперь такой случай виден как `batch_started` без `batch_completed`.
- `getTemplates()` для кампании вызывается после захвата: его сбой даёт пустой прерванный пакет с событием `interrupted: true`. Поведение прежнее, теперь зафиксировано.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлены `POST /api/admin/card-rules-campaign` (захват или сброс + событие атомарно; результат — отдельной транзакцией после SMTP) и `POST /api/admin/card-request` (событие до SMTP атомарно с захватом ключа; результат — отдельно).

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #23:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #23 было 20; этот PR закрывает два маршрута, остаётся **18**:

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
12. `PATCH /api/admin/contact-messages`
13. `PUT /api/admin/dashboard-prefs`
14. `PUT /api/admin/email-templates/[id]`
15. `POST /api/admin/email-templates/[id]/send-test`
16. `POST /api/admin/notifications/assets`
17. `POST /api/admin/products/[id]/notify-promo`
18. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-invitations`, head `fix/2026-11-09-admin-audit-card-mailings`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-invitations --head fix/2026-11-09-admin-audit-card-mailings`.
1. Следующий stacked PR — массовые рассылки: `POST /api/admin/broadcast` и `POST /api/admin/stock-alerts/send`. Начать от зелёного head этого PR.
2. Проследить выбор получателей, изменения в БД (флаги «уведомлён», очереди, KV) и SMTP; изменение состояния и событие — в одной транзакции, SMTP — после коммита, результат доставки — отдельно (по образцу кампании правил карты). Переиспользовать `Idempotency-Key` из `lib/invitation-dispatch.ts`.
3. Сохранить права, лимиты пакетов и API-контракт; в журнале — внутренние ID, канал, счётчики и статусы, без адресов и текста.
4. Тесты: отказ без прав, невалидный ввод, частичный сбой пакета, повтор, конкуренция, сбой аудита до отправки, сбой SMTP после коммита.

Далее: `notify-promo`, `email-templates/[id]/send-test`, `notifications/assets`; затем CMS-контент (баннеры, блог, кампании, шаблоны писем), hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-card-mailings
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/admin/card-request app/api/admin/card-rules-campaign lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
