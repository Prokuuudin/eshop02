# Hairshop Pro: аудит рассылок и отчёта по остаткам — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-broadcasts`.
- Stacked base: `a9950de0defb7e458179dbbc2d6a4c67ad2604d7`, проверенный head открытого Draft PR #24 (`fix/2026-11-09-admin-audit-card-mailings`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #24 `open`, `draft=true`, `merged=false`, head точно `a9950de0…`, base `fix/2026-11-09-admin-audit-invitations`; `static-and-unit` на `a9950de0` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42695941625/job/129427681438.
- Коммит реализации: `6a695d3c` (`fix(audit): record broadcasts and stock reports before and after SMTP`).
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-card-mailings`
  - head: `fix/2026-11-09-admin-audit-broadcasts`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-card-mailings...fix/2026-11-09-admin-audit-broadcasts?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Что делают маршруты

Прослежено от выбора получателей до SMTP. **Ни один из маршрутов не меняет состояние в БД** — до этого PR они только читали и отправляли письма.

| Маршрут | Получатели | Чтение БД | Отправка |
|---|---|---|---|
| `POST /api/admin/broadcast` (`requireAdmin`) | `audience` → сегмент разрешается на сервере (`getCustomerRecipients(segment, 501)`), иначе `recipients` из тела; фильтр по email-regex; лимит 500; opt-out через `getMarketingOptedOutSet` | клиенты сегмента, отписки | по письму на получателя, персонализация и подписанная ссылка отписки |
| `POST /api/admin/stock-alerts/send` (`requireAdmin`) | один адрес `to` из тела | `Product` с `stock` от 0 до порога (по умолчанию 5) | одно письмо с отчётом |

## Реализовано

Новый `lib/audited-delivery.ts` — общий механизм для отправок, которые не меняют другое состояние БД.

1. **Подготовка** (`prepareAuditedDelivery`): транзакция под advisory lock ключа пакета. Проверка предыдущих попыток с тем же `requestId`, затем `appendServerAudit` события «prepared». Событие — durable claim: сбой аудита → ничего не отправляется.
2. **SMTP** — после коммита, как раньше.
3. **Результат** (`recordAuditedDelivery`): отдельное событие «recorded» с фактическим исходом; одна повторная попытка, затем лог `audited_delivery_result_not_recorded`. Ответ клиенту остаётся правдивым.

Изменения состояния БД, которое нужно было бы связывать с событием в одной транзакции, у этих маршрутов нет. Единственная запись — сам аудит.

### Повторы (`Idempotency-Key` из #23)

| Найдено по ключу | Ответ | Отправка |
|---|---|---|
| Ничего | Обычная отправка | Да |
| «prepared» без «recorded» (отправка идёт, или результат не удалось записать) | `409 { error: 'in_progress' }` | **Нет** — уже доставленные письма не уходят повторно из-за сбоя записи результата |
| «recorded», что-то доставлено | Повтор сохранённого результата, `replayed: true` | Нет |
| «recorded», ничего не доставлено (broadcast `sent: 0`, отчёт `status: 'failed'`) | Новая попытка тем же ключом | Да |

Новый ключ означает новое действие, то есть штатную явную повторную отправку. UI теперь отправляет новый ключ на каждый клик. Без заголовка запрос ведёт себя как раньше. Если результат не удалось записать, ключ навсегда остаётся в `in_progress`: сервер не может знать, что ушло, поэтому повтор тем же ключом не отправляет ничего, а решение о новой отправке принимает человек (новый клик = новый ключ).

### Содержимое журнала

| Action | entity | Данные |
|---|---|---|
| `broadcast.prepared` | `broadcast` / batchId | `channel`, `audience` (`segment`/`manual`), `segment` (имя или `all`; `null` для ручного списка), `recipients`, `optedOut` |
| `broadcast.delivery_recorded` | то же | `channel`, `sent`, `failed`, `skipped` |
| `stock_alert.report_prepared` | `stock_alert_report` / batchId | `channel`, `threshold`, `products`, `outOfStock`, `lowStock`, `recipientIsActor` |
| `stock_alert.report_recorded` | то же | `channel`, `status` (`sent`/`failed`) |

Нет адресов, имён, темы, текста, ссылок отписки, названий товаров, брендов и SKU (проверено тестами по конкретным значениям). batchId = `<scope>:<ID сотрудника>:<ключ>` или `<scope>:<uuid>` без ключа. Названия RU/LV/EN: «Подготовка рассылки» / «Sagatavots e-pasta izsūtījums» / «Broadcast prepared»; «Результат рассылки» / «E-pasta izsūtījuma rezultāts» / «Broadcast delivery result»; «Подготовка отчёта по остаткам» / «Sagatavots krājumu pārskats» / «Stock report prepared»; «Результат отправки отчёта по остаткам» / «Krājumu pārskata nosūtīšanas rezultāts» / «Stock report delivery result».

### Сохранено и совместимые изменения

- Права, серверное разрешение сегментов (подменённые `recipients` при `audience` игнорируются), opt-out, лимит 500, порог по умолчанию 5 и его нормализация, все коды ошибок (`invalid_segment`, `subject_required`, `body_required`, `no_recipients`, `too_many_recipients`, `internal_error`, `invalid_email`, `send_failed`) и форма ответов.
- Новое: необязательный `Idempotency-Key` (некорректный → `400 invalid_idempotency_key`), `409 in_progress`, `replayed: true`. В повторе broadcast `failedEmails: []`: адреса не сохраняются.
- Валидация ключа в broadcast выполняется сразу после разбора тела, в отчёте — после проверки адреса.

## Что подтверждено

- `lib/audited-delivery.test.ts` (7): prepared под requestId; claim без результата → `in_progress` (в том числе после сбоя записи результата); replay; повтор после retryable-исхода; конкурентные claim — ровно один prepared; сбой аудита ничего не пишет; одна повторная попытка записи результата и лог.
- `app/api/admin/broadcast/route.test.ts` (18; 4 прежних сценария сохранены, SMTP подменён):
  - права, персонализация без утечек, opt-out и частичный сбой, серверный сегмент;
  - 5 видов невалидного ввода и некорректный ключ — без аудита и отправки;
  - порядок «prepared → SMTP → recorded»; счётчики без адресов и текста; сегмент `all`;
  - сбой аудита до SMTP — ни одного письма; сбой записи результата (обе попытки) — ответ 200, а технический повтор → 409 без повторной отправки;
  - replay; конкурентный дубль — каждое письмо один раз; повтор тем же ключом, когда ничего не доставлено; явная повторная отправка новым ключом.
- `app/api/admin/stock-alerts/send/route.test.ts` (13, новый): права до запроса к БД; три невалидных адреса; ключ; порог и контракт; аудит без адреса и содержимого отчёта; сбой аудита до SMTP; сбой SMTP (`failed`, 500) и повтор тем же ключом; replay; сбой записи результата → 409 без повторной отправки; конкурентный дубль; явная повторная отправка.
- `lib/admin-log-store.test.ts` (RU/LV/EN).
- Мутационная проверка: без ветки `in_progress` падают 6 тестов (сбой записи результата и конкурентные дубли во всех трёх файлах).
- Нового raw SQL нет; `pg_advisory_xact_lock(hashtext($1))` проверен на PGlite в PR #23. Реальная PostgreSQL-конкуренция проверена только моделью. Рабочая Neon не использовалась; реальные письма не отправлялись.

## Затронутые пути

- `lib/audited-delivery.ts`, `lib/audited-delivery.test.ts` (новые)
- `app/api/admin/broadcast/route.ts`, `route.test.ts`
- `app/api/admin/stock-alerts/send/route.ts`, `send/route.test.ts` (новый)
- `app/[lang]/admin/customers/segments/useCustomerSegmentsPage.ts`, `app/[lang]/admin/stock-alerts/page.tsx`
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `6a695d3c` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/audited-delivery.test.ts app/api/admin/broadcast app/api/admin/stock-alerts lib/admin-log-store.test.ts
# PASS: 5 files, 70 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 960 source modules

npm run test:unit -- --reporter=dot
# PASS: 376 files, 3254 tests

npx eslint <10 изменённых файлов>
# PASS

npm run check:encoding
# PASS: 1364 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **Отчёт по остаткам уходит на произвольный адрес.** Любой администратор может отправить внутренние данные (названия, бренды, SKU, остатки) на любой email. Теперь в журнале видно, совпадает ли получатель с сотрудником (`recipientIsActor`), но сам адрес не хранится. Это аналог задачи с `card-request`; решать вместе с ней (например, разрешённый список адресов).
- **Длинная рассылка и таймаут.** У `broadcast` нет `maxDuration`, до 500 писем отправляются последовательно. При обрыве процесса после «prepared» ключ остаётся в `in_progress` (повторов нет), но фактический результат неизвестен: в журнале будет «prepared» без «recorded».
- Отправка `card-request` на произвольный адрес — отдельная задача (по указанию владельца, не трогалась).

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлены `POST /api/admin/broadcast` и `POST /api/admin/stock-alerts/send`: подготовка аудируется до SMTP (claim), результат — отдельным событием после.

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #24:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #24 было 18; этот PR закрывает два маршрута, остаётся **16**:

1. `PUT /api/admin/banner-groups`
2. `PUT /api/admin/banners/[id]`
3. `DELETE /api/admin/banners/[id]`
4. `POST /api/admin/banners/reorder`
5. `POST /api/admin/banners`
6. `DELETE /api/admin/blog/[id]`
7. `POST /api/admin/blog`
8. `PUT /api/admin/campaigns/[id]`
9. `DELETE /api/admin/campaigns/[id]`
10. `POST /api/admin/campaigns`
11. `PATCH /api/admin/contact-messages`
12. `PUT /api/admin/dashboard-prefs`
13. `PUT /api/admin/email-templates/[id]`
14. `POST /api/admin/email-templates/[id]/send-test`
15. `POST /api/admin/notifications/assets`
16. `POST /api/admin/products/[id]/notify-promo`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-card-mailings`, head `fix/2026-11-09-admin-audit-broadcasts`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-card-mailings --head fix/2026-11-09-admin-audit-broadcasts`.
1. Следующий stacked PR — оставшиеся отправки: `POST /api/admin/products/[id]/notify-promo` и `POST /api/admin/email-templates/[id]/send-test`. Начать от зелёного head этого PR.
2. Проследить отбор получателей и возможные записи в БД (например, отметки «уведомлён» у подписок); если состояние меняется — изменение и событие в одной транзакции, иначе — `lib/audited-delivery.ts`. SMTP после коммита, результат отдельно, `Idempotency-Key` для технических повторов.
3. Сохранить права, лимиты и API-контракт; в журнале — внутренние ID (товар, шаблон), канал, счётчики, без адресов и текста.
4. Тесты: отказ без прав, невалидный ввод, частичный сбой, повтор, конкуренция, сбой аудита до и после SMTP.

Далее: `notifications/assets`, затем CMS-контент (баннеры, блог, кампании, шаблоны писем), `contact-messages`, `dashboard-prefs`; hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events. Отдельно — ограничение адресов для `card-request` и отчёта по остаткам.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-broadcasts
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/audited-delivery.test.ts app/api/admin/broadcast app/api/admin/stock-alerts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
