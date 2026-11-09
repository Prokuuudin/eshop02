# Hairshop Pro: аудит уведомлений об акциях и тестовых писем шаблонов — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-promo-template-sends`.
- Stacked base: `8a1fc1da51b8d1d1764cf2a70cc9ce7a0a9aee74`, проверенный head открытого Draft PR #25 (`fix/2026-11-09-admin-audit-broadcasts`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #25 `open`, `draft=true`, `merged=false`, head точно `8a1fc1da…`, base `fix/2026-11-09-admin-audit-card-mailings`; `static-and-unit` на `8a1fc1da` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42698142515/job/129435406240.
- Коммит реализации: `e6895e07` (`fix(audit): record promo notifications and template test emails`).
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-broadcasts`
  - head: `fix/2026-11-09-admin-audit-promo-template-sends`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-broadcasts...fix/2026-11-09-admin-audit-promo-template-sends?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Что делают маршруты

| Маршрут | Права | Получатели | Записи в БД | Отправка |
|---|---|---|---|---|
| `POST /api/admin/products/[id]/notify-promo` | `catalog.update` | `ProductNewsSubscription` с `notifyPromo = true`; email — каналы `email`/`both` с валидным адресом; in-app — каналы `app`/`both` | **Подписки не меняются.** После SMTP создаются `UserNotification` (in-app) с флагом `emailSent` | Параллельные письма подписчикам; текст — необязательное сообщение администратора (≤ 500 символов) или стандартный |
| `POST /api/admin/email-templates/[id]/send-test` | `requireAdmin` (`users.manage`) | Один адрес `to` из тела | Нет | Одно письмо `[Тест] …` с образцами значений подстановок |

## Реализовано

### notify-promo

`lib/product-news-notify.ts` разделён на шаги: `planProductNews` (отбор и разбиение по каналам), `sendProductNewsEmails` (SMTP, возвращает доставленных и число ошибок), `productNewsNotifications` (строки in-app с `emailSent`), `promoNews`. `deliverProductNews`, `notifyPriceChange` и `notifyRestock` собраны из тех же шагов, их поведение не менялось (существующие тесты product-news проходят).

Маршрут:

1. Права, 404 для отсутствующего или удалённого товара, обрезка сообщения — как раньше; затем проверка `Idempotency-Key`.
2. План получателей. Нет подписчиков → `{ ok: true }` без писем, записей и событий (как раньше).
3. `prepareAuditedDelivery` (`lib/audited-delivery.ts`) — событие `product.promo_notification_prepared` под advisory lock ключа **до** SMTP. Сбой аудита → `500 server_error`, ни одного письма и уведомления.
4. SMTP.
5. Одна транзакция: `UserNotification.createMany` + `product.promo_notification_recorded`. Если аудит результата не записался, уведомления создаются отдельно (подписчики их не теряют), а ключ остаётся в `in_progress` — технический повтор не отправит письма второй раз.

### send-test

Только отправка, поэтому напрямую `lib/audited-delivery.ts`: `email_template.test_prepared` до SMTP, `email_template.test_recorded` (`sent`/`failed`) после. Сбой SMTP по-прежнему `500 send_failed`, неизвестный шаблон — `404 not_found` до аудита.

### Повторы (`Idempotency-Key`)

| Найдено по ключу | notify-promo | send-test |
|---|---|---|
| Ничего | Отправка | Отправка |
| «prepared» без «recorded» (идёт отправка, или результат не записался) | `409 in_progress`, без писем и уведомлений | `409 in_progress`, без письма |
| «recorded», что-то доставлено | `{ ok: true, replayed: true }` | `{ ok: true, replayed: true }` |
| «recorded», ничего не доставлено | Новая попытка тем же ключом (`sent = 0` и `appNotifications = 0`) | Новая попытка (`status: 'failed'`) |

Новый ключ означает явную повторную отправку. UI (`NotifyPromoSubscribersButton`, `email-template-api.ts`) отправляет новый ключ на каждый клик. Без заголовка запрос ведёт себя как раньше.

### Содержимое журнала

| Action | entity | Данные |
|---|---|---|
| `product.promo_notification_prepared` | `product` / ID товара | `channel: 'email+app'`, `subscribers`, `emailRecipients`, `skippedInvalidEmail`, `appRecipients`, `customMessage` (флаг) |
| `product.promo_notification_recorded` | то же | `sent`, `failed`, `skippedInvalidEmail`, `appNotifications` |
| `email_template.test_prepared` | `email_template` / ID шаблона | `channel`, `variables` (число), `recipientIsActor` |
| `email_template.test_recorded` | то же | `channel`, `status` |

`requestId` = `<scope>:<ID сотрудника>:<ключ>` или `<scope>:<uuid>` без ключа. Нет адресов, темы, тела, текста акции, названия товара и значений подстановок (проверено тестами по конкретным значениям). Названия RU/LV/EN: «Подготовка уведомления об акции» / «Sagatavots akcijas paziņojums» / «Promo notification prepared»; «Результат уведомления об акции» / «Akcijas paziņojuma rezultāts» / «Promo notification result»; «Подготовка тестового письма шаблона» / «Sagatavota veidnes testa vēstule» / «Template test email prepared»; «Результат тестового письма шаблона» / «Veidnes testa vēstules rezultāts» / «Template test email result».

### Изменения контракта (совместимые)

Необязательный `Idempotency-Key` (некорректный → `400 invalid_idempotency_key`), `409 in_progress`, `replayed: true`. Остальные коды и ответы не менялись.

## Что подтверждено

Дополнительная проверка Codex покрывает потерю ответа на коммит после фактической записи результата. Отдельная запись уведомлений выполняется только после ошибки самого `appendServerAudit` внутри callback транзакции. При неопределённом исходе коммита маршрут возвращает 500, а технический повтор с тем же ключом сверяется с журналом без повторной отправки.

- `notify-promo/route.test.ts` (13; реальные планировщик и отправщик product-news, SMTP подменён, staged-транзакции для аудита и `UserNotification`):
  - права и ввод: `catalog.update`; 404 для отсутствующего и удалённого товара; некорректный ключ; без подписчиков — ничего;
  - доставка и аудит: claim и событие до SMTP, уведомления и результат после; разбиение по каналам; текст акции в письме, но не в аудите; частичный сбой SMTP (`emailSent: false`); сбой аудита до SMTP — ни писем, ни уведомлений; сбой аудита результата — уведомления созданы, повтор → 409 без повторных писем;
  - повторы: replay; параллельный дубль — каждый подписчик один раз; повтор тем же ключом, когда ничего не доставлено; явная повторная отправка новым ключом.
- `send-test/route.test.ts` (11; 3 прежних сценария сохранены): права и адрес; подстановки образцов; 404 и сбой SMTP; некорректный ключ; аудит без адреса и содержимого; сбой аудита до SMTP; сбой SMTP и повтор тем же ключом; replay; сбой записи результата → 409 без повторной отправки; параллельный дубль; явная повторная отправка.
- `lib/product-news-notify.test.ts`, `app/api/product-news/*`, `app/api/admin/products/*` (цена и наличие используют те же шаги) — без изменений, проходят. `email-template-api.test.ts`, `lib/admin-log-store.test.ts` (RU/LV/EN).
- Мутационная проверка: без fallback-создания уведомлений падает тест сбоя аудита результата; ветка `in_progress` проверена мутацией в PR #25.
- Нового raw SQL нет. Реальная PostgreSQL-конкуренция проверена только моделью. Рабочая Neon не использовалась; реальные письма не отправлялись.

## Затронутые пути

- `lib/product-news-notify.ts`
- `app/api/admin/products/[id]/notify-promo/route.ts`, `route.test.ts`
- `app/api/admin/email-templates/[id]/send-test/route.ts`, `route.test.ts`
- `components/admin/products/NotifyPromoSubscribersButton.tsx`, `app/[lang]/admin/config/email-templates/email-template-api.ts`
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `e6895e07` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts 'app/api/admin/products/[id]/notify-promo' 'app/api/admin/email-templates' 'app/[lang]/admin/config/email-templates' lib/product-news-notify.test.ts lib/admin-log-store.test.ts
# PASS: 7 files, 74 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 960 source modules

npm run test:unit -- --reporter=dot
# PASS: 376 files, 3275 tests

npx eslint <9 изменённых файлов>
# PASS

npm run check:encoding
# PASS: 1364 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **Тестовое письмо шаблона уходит на произвольный адрес.** В письме только образцы значений, без реальных данных; теперь в журнале есть флаг `recipientIsActor`. Решать вместе с ограничением адресов для `card-request` и отчёта по остаткам (отдельная задача владельца).
- **Уведомления о цене и наличии** (`notifyPriceChange`, `notifyRestock`) вызываются из сохранения товара и отката цен. Это не отдельные админские отправки, и в этот PR они не входили. Их SMTP по-прежнему выполняется внутри вызывающего кода.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлены `POST /api/admin/products/[id]/notify-promo` (claim до SMTP; in-app уведомления и результат — одной транзакцией после) и `POST /api/admin/email-templates/[id]/send-test` (claim до SMTP, результат после).

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #25:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #25 было 16; этот PR закрывает два маршрута, остаётся **14**:

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
14. `POST /api/admin/notifications/assets`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-broadcasts`, head `fix/2026-11-09-admin-audit-promo-template-sends`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-broadcasts --head fix/2026-11-09-admin-audit-promo-template-sends`.
1. Следующий stacked PR — шаблоны писем и ассеты уведомлений: `PUT /api/admin/email-templates/[id]` (изменение темы и тела шаблона) и `POST /api/admin/notifications/assets` (загрузка изображения для уведомлений, `validateUploadedImage`). Начать от зелёного head этого PR.
2. Проследить хранилище шаблонов (`lib/email-templates-server-store`: KV, файл или их сочетание) и место хранения ассета. Изменение и событие — в одной транзакции; для файлов — подготовка и компенсация (по образцу configuration restore, PR #20); для `MediaAsset` — по образцу медиа (PR #22).
3. Сохранить права, лимиты, валидацию и API-контракт; в журнале — ID шаблона или ассета, хеши и размеры до и после, без текста шаблона и содержимого файла; no-op без события.
4. Тесты: отказ без прав, невалидный ввод, успех, no-op, параллельные изменения, сбой аудита с откатом.

Далее: CMS-контент (баннеры, блог, кампании), `contact-messages`, `dashboard-prefs`; hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events. Отдельно — ограничение адресов для `card-request`, отчёта по остаткам и тестовых писем шаблонов.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-promo-template-sends
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts 'app/api/admin/products/[id]/notify-promo' 'app/api/admin/email-templates' lib/product-news-notify.test.ts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
