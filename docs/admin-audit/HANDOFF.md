# Hairshop Pro: аудит решений по заявкам на доступ — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-access-requests`.
- Stacked base: `5ff8204d1125ea953b63bc593029110b6d0c6ee5`, проверенный head открытого Draft PR #20 (`fix/2026-11-09-admin-audit-configuration-restore`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #20 `open`, `draft=true`, `merged=false`, head точно `5ff8204d…`, base `fix/2026-11-09-admin-audit-price-groups`; `static-and-unit` на `5ff8204d` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42684637345/job/129388037096. Browser jobs (`chromium-critical-smoke`, `firefox-smoke`, `accessibility-webkit`) на том же SHA падают — известная проблема установки Playwright, PR #17.
- Коммит реализации: `27e84a6d` (`fix(audit): record access request decisions once`).
- Draft PR в `fix/2026-11-09-admin-audit-configuration-restore`: **не создан**. `gh` не авторизован (`gh auth status`: not logged in), токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена; PR открывается по ссылке: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-configuration-restore...fix/2026-11-09-admin-audit-access-requests?expand=1 (выбрать «Create draft pull request»).
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI на этой ветке появится только после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Реализовано

Прослежен `PATCH /api/admin/access-requests/[id]` (`app/api/admin/access-requests/[id]/route.ts`). Единственный вызывающий в UI — `app/[lang]/admin/client-barcodes/useAdminClientBarcodesPage.tsx`, работает только со списком `?status=pending`.

Сохранено без изменений: проверка `getServerUser()` + `hasAdminPermission(user, 'customers.read')` → 403; 404 для неизвестной заявки; zod-схема тела и `400 invalid_status` / `invalid_company_details` / `invalid_card`; `409 staff_account` / `card_taken` / `user_has_card`; создание или обновление аккаунта, `mustChangePassword: true`; формат ответов `{ request, cardNumber, userId, emailStatus: 'sent' }` (200), `{ …, emailStatus: 'error' }` (502), `{ request }` для отклонения, `500 server_error`.

### Новый порядок одобрения

1. Предпроверки вне транзакции (права, тело, карта, staff-аккаунт) — как раньше.
2. `existing.status !== 'pending'` → `409 { error: 'already_decided', status }`.
3. Одна транзакция:
   - условный `accessRequest.updateMany({ where: { id, status: 'pending' } })`; `count !== 1` → откат и `409 already_decided`. В PostgreSQL условный UPDATE берёт row lock, поэтому из конкурентных решений проходит ровно одно;
   - `user.create` или `user.update`;
   - `deleteCertificate(tx, id)` (теперь возвращает, был ли сертификат удалён);
   - `replaceInvitation(tx, …)` — **перенесено внутрь транзакции** (раньше выполнялось после коммита);
   - `appendServerAudit(tx, req, user, …)`;
   - чтение ответа.
4. После коммита — отправка письма. При ошибке токен помечается `status: 'error'`, ответ `502 emailStatus: 'error'`; решение, аккаунт, приглашение и аудит остаются.
5. `P2002` при гонке двух разных заявок за одну карту → `409 card_taken`, за один email → `409 concurrent_update`.

Отклонение: тот же claim, `deleteCertificate(tx)` и аудит в одной транзакции (раньше `update` и удаление сертификата шли отдельными запросами). Письмо об отклонении отправляет UI отдельным вызовом `POST /api/admin/card-request` — этот маршрут не менялся и по-прежнему без аудита.

### Исправленное поведение повторов

До этого PR повторный PATCH уже решённой заявки выполнял весь сценарий заново: снова ставил `mustChangePassword: true` (в том числе уже активированному клиенту), перезаписывал согласия, удалял действующие неиспользованные приглашения, создавал новое и снова отправлял письмо. Отклонение одобренной заявки меняло статус на `rejected`, но аккаунт с картой оставался. Теперь любое решение по не-`pending` заявке — `409 already_decided` без побочных эффектов. В UI добавлено сообщение RU/LV/EN «Заявка уже обработана», список после этого перезагружается.

### Событие аудита

| Action | Entity | before | after |
|---|---|---|---|
| `access_request.approved` | `access_request` / ID заявки | `{ status: 'pending', approvedTeamRole: null }` | `status`, `approvedTeamRole` (назначенная роль, по умолчанию `viewer`), `requestType`, `customerType`, `account: { userId, action: 'created' \| 'updated' }`, `invitation: { created: true, expiresAt }`, `certificateDeleted` |
| `access_request.rejected` | `access_request` / ID заявки | то же | `status`, `approvedTeamRole: null`, `requestType`, `certificateDeleted` |

Actor и request передаются из серверной сессии. `entityTitle` не пишется. В журнал не попадают: email, имя, телефон, хэш пароля, название компании и регистрационный номер заявителя, номер карты, заметка проверяющего (свободный текст), сертификат и его имя файла, токен приглашения и его хэш (проверено тестом по списку конкретных значений). Названия: RU «Одобрение заявки на доступ» / «Отклонение заявки на доступ», LV «Piekļuves pieteikums apstiprināts» / «Piekļuves pieteikums noraidīts», EN «Access request approved» / «Access request rejected».

## Фактические гарантии при сбоях

| Сбой | Результат |
|---|---|
| Ошибка `appendServerAudit` | Транзакция откатывается целиком: заявка остаётся `pending`, аккаунт не создан и не изменён, сертификат на месте, приглашения нет, письмо не отправлено; `500 server_error` |
| Ошибка в `user.create/update`, `deleteCertificate`, `replaceInvitation` | То же — всё в одной транзакции |
| Ошибка SMTP после коммита | Решение, аккаунт, приглашение (`status: 'error'`) и одна строка аудита сохранены; `502 emailStatus: 'error'`; повторная отправка — с экрана «Приглашения». Отдельного события аудита о сбое доставки нет — только `logApiError` |
| Ошибка `invitationToken.updateMany` после сбоя SMTP | Приглашение остаётся `sent`, хотя письмо не ушло; ответ `500` вместо `502` (поведение не менялось) |
| Повтор / второй администратор / двойной клик | Ровно одно решение, один аккаунт, одно приглашение, одно письмо, одна строка аудита; остальные — `409 already_decided` |

## Что подтверждено тестами

`app/api/admin/access-requests/[id]/route.test.ts` — 33 теста на stateful harness: каждая `$transaction` работает на staged-копии состояния (заявки, пользователи, сертификаты в KV, приглашения, аудит) и публикует её только при успешном callback; транзакции выполняются по одной (модель row lock); `P2002` моделируется по уникальности `cardNumber`/`email`; реальный `replaceInvitation`; `sendEmail` и `appendServerAudit` подменены.

- прежние сценарии: спящий аккаунт, юрлицо, неверный рег. номер, `card_taken`, дописывание карты существующему пользователю, `invalid_card`, отклонение без аккаунтов, удаление сертификата при обоих решениях, card-заявка, staff-аккаунты (состояние не меняется), владелец B2B-компании;
- отказ без прав (без сессии, клиент, владелец B2B-компании) → 403, состояние не меняется, нет аудита и письма;
- точное содержимое события одобрения и отклонения, actor и request из сессии;
- отсутствие ПДн, карты, заметки, сертификата, токена и его хэша в аудите;
- откат одобрения и отклонения при ошибке аудита (состояние побайтно равно исходному, письма нет);
- приглашение сохранено до отправки письма;
- повторы во всех 4 комбинациях решений → 409 без побочных эффектов;
- два конкурентных одобрения; конкурентные одобрение и отклонение; две заявки в гонке за одну карту;
- сбой SMTP → 502, решение и аудит сохранены, приглашение `error`; повтор после сбоя не дублирует аккаунт, приглашение, аудит и письмо.

Мутационная проверка: при отключении проверки `pending` и условного claim падают 6 тестов повторов и конкурентности.

`lib/admin-log-store.test.ts` — RU/LV/EN; `lib/certificate-store.test.ts` — без изменений, проходит.

Изолированная PostgreSQL недоступна (`127.0.0.1:5432` закрыт, Docker daemon не запущен). Row lock условного UPDATE, реальный откат и `P2002` проверены только моделью; рабочая Neon принципиально не использовалась.

## Затронутые пути

- `app/api/admin/access-requests/[id]/route.ts`
- `app/api/admin/access-requests/[id]/route.test.ts`
- `app/[lang]/admin/client-barcodes/useAdminClientBarcodesPage.tsx`
- `lib/certificate-store.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `27e84a6d` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts 'app/api/admin/access-requests/[id]/route.test.ts' lib/admin-log-store.test.ts lib/certificate-store.test.ts
# PASS: 3 files, 59 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 957 source modules

npm run test:unit -- --reporter=dot
# PASS: 369 files, 3113 tests

npx eslint 'app/api/admin/access-requests/[id]/route.ts' 'app/api/admin/access-requests/[id]/route.test.ts' lib/admin-log-store.ts lib/admin-log-store.test.ts lib/certificate-store.ts 'app/[lang]/admin/client-barcodes/useAdminClientBarcodesPage.tsx'
# PASS

npm run check:encoding
# PASS: 1354 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **Право на решение — `customers.read`.** Одобрение создаёт аккаунт с картой и приглашение, но проверяется право чтения. Его имеет и роль `manager` (`MANAGER_PERMISSIONS`). Это архитектурная слабость, а не эксплуатируемая уязвимость: manager — доверенный сотрудник, а staff-аккаунты защищены `staff_account`. Права сохранены по условию задачи; ужесточение (например, отдельное право или `users.manage`) — решение владельца.
- `POST /api/admin/card-request` (письмо об отклонении) по-прежнему без аудита — в списке ниже.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлен `PATCH /api/admin/access-requests/[id]` (одобрение и отклонение). Доставка письма с приглашением идёт после коммита и в аудит не пишется.

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #20:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #20 было 27; этот PR закрывает `PATCH /api/admin/access-requests/[id]`, остаётся **26**:

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
15. `POST /api/admin/content/upload`
16. `PUT /api/admin/dashboard-prefs`
17. `PUT /api/admin/email-templates/[id]`
18. `POST /api/admin/email-templates/[id]/send-test`
19. `POST /api/admin/invitations/card`
20. `POST /api/admin/invitations`
21. `POST /api/admin/invitations/sms`
22. `POST /api/admin/media/replace`
23. `DELETE /api/admin/media`
24. `POST /api/admin/notifications/assets`
25. `POST /api/admin/products/[id]/notify-promo`
26. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR по ссылке выше (base `fix/2026-11-09-admin-audit-configuration-restore`) и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-configuration-restore --head fix/2026-11-09-admin-audit-access-requests`.
1. Следующий stacked PR — аудит контент-ассетов и медиа: `POST /api/admin/content/upload`, `POST /api/admin/media/replace`, `DELETE /api/admin/media`. Начать от зелёного head этого PR.
2. Проследить каждую операцию до файловой системы/хранилища и ссылок в БД/KV; определить, что входит в одну транзакцию, а что требует staging/компенсации (по образцу configuration restore в PR #20).
3. Сохранить права, лимиты размера/типа и API-контракт; `appendServerAudit` с actor из сессии; в журнале — путь/ID ассета, размер, тип и хеш до/после, без содержимого файла; no-op без события.
4. Тесты: отказ без прав, невалидный файл, успех, no-op, параллельные запросы, сбой после записи файла и сбой аудита.

Далее: рассылки (`broadcast`, `invitations*`, `card-request`, `card-rules-campaign`), затем hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-access-requests
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts 'app/api/admin/access-requests/[id]/route.test.ts' lib/admin-log-store.test.ts lib/certificate-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной или preview DB.
