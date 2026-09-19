# Deploy: Plesk / IIS (iisnode)

Практический runbook для запуска `eshop02` на Windows-сервере под Plesk с
Node.js Support for IIS (iisnode). Дополняет [`deploy-github-vercel.md`](./deploy-github-vercel.md) —
Vercel-конфигурация в репозитории пока не удаляется, миграция ещё не завершена.

Живого запуска на Plesk на момент написания этого документа ещё не было —
пункты, которые нельзя подтвердить без реального сервера, помечены
**VERIFY ON SERVER**.

## 1) Требования

-   **Node.js**: `>=22.13.0` (см. `package.json` → `engines`). Убедиться, что
    Plesk Node.js extension использует именно этот (или новее) рантайм —
    **VERIFY ON SERVER**.
-   **Entry point**: `server.js` (custom HTTP-сервер, программно поднимает Next.js).
-   **Старт**: `npm start` → `node server.js`.
-   **Сборка**: `npm run build` → `prisma migrate deploy && prisma generate && next build --webpack`.
    Это значит, что `npm run build` **накатывает миграции на БД, указанную в
    `DATABASE_URL`**, при каждом деплое. Для прод-БД это должно быть осознанно
    (см. `CLAUDE.md` → Database), а не побочный эффект.

## 2) Deploy flow

1. `git pull` (или иной способ доставки кода на сервер, без `.git` в
   рантайм-директории — см. существующие git hooks, они уже не мешают такому деплою).
2. `npm ci` — детерминированная установка по `package-lock.json`.
3. `npm run build` — прогоняет миграции, генерирует Prisma client, собирает Next.js.
4. Запуск/restart Node-приложения через Plesk (Node.js extension → Restart App).
   **VERIFY ON SERVER**: какой именно способ рестарта использует конкретная
   версия Plesk (кнопка в UI, `touch` файла для iisnode, или app pool recycle в IIS).
5. Smoke test — см. чеклист в разделе 10.

## 3) Переменные окружения

Источник истины — `.env.example` в корне репозитория (обновлён вместе с этим
документом). Ниже — привязка к реальным `process.env.*` в коде, найденным по
всему репозиторию (не только к тому, что уже было в `.env.example`).

### Обязательные для запуска production

| Переменная | Зачем |
|---|---|
| `DATABASE_URL` | Neon Postgres, через `adapter-neon`/WebSocket (443) — используется и Prisma CLI (`migrate deploy` в `npm run build`), и рантаймом |
| `NEXT_PUBLIC_SITE_URL` | canonical/OG/JSON-LD/robots/sitemap; без него в production `lib/site-url.ts` **бросает исключение** |
| `NODE_ENV=production` | переключает secure-cookie флаг, CSP (`upgrade-insecure-requests`, HSTS), режим Next.js |

### Обязательные только для конкретных функций (без них соответствующая функция не работает или падает при вызове)

| Переменная | Функция |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | письма (регистрация, инвойсы, уведомления, контактная форма) |
| `SMTP_SECURE`, `SMTP_IGNORE_TLS` | опциональные модификаторы транспорта SMTP |
| `CONTACT_TO` | куда падают заявки с контактной формы (по умолчанию = `SMTP_USER`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | anti-spam на чекауте/контакте/заявках. **Оба или ни одного** — частичная настройка бросает ошибку (`lib/turnstile-server.ts`). Сейчас в проде это fail-open стопгэп (см. память `project_turnstile_checkout_outage`) |
| `MFA_ENCRYPTION_KEY` | шифрование TOTP-секретов (AES-256-GCM); без него включение MFA сломано |
| `PAYSERA_PROJECT_ID`, `PAYSERA_CLIENT_ID`, `PAYSERA_CLIENT_SECRET` | Paysera Checkout Modern |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE` | PayPal Orders v2 REST |
| `PAYPAL_WEBHOOK_ID` | верификация подписи `/api/webhooks/paypal` |
| `NEWSLETTER_UNSUB_SECRET` | подпись ссылок отписки от рассылки |
| `GRINS_FTPS_HOST`, `GRINS_FTPS_USER`, `GRINS_FTPS_PASSWORD`, `GRINS_FTPS_REMOTE_PATH` | ERP-синк (сейчас выключен — см. раздел 9) |

### Optional (есть безопасный дефолт/деградацию)

| Переменная | Поведение без неё |
|---|---|
| `ADMIN_SETUP_TOKEN` | без него — свой контроль доступа внутри роута (не блокер) |
| `ADMIN_API_TOKEN` | доп. заголовок `X-Admin-Token` для `/api/admin/orders/send-invoice`; без него остаётся штатная admin-сессия/permission-проверка |
| `HOST` | дефолт `0.0.0.0` в `server.js` |
| `PORT` | дефолт `3000`; **на iisnode это будет named pipe, не число** — `server.js` уже это учитывает (см. раздел 6) |

### Development / test only (не нужны в production)

`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (`prisma/seed.ts`), `MAILPIT_API_URL`
(`scripts/verify-email-delivery.ts`), `LOAD_BASE_URL`/`LOAD_CONCURRENCY`/`LOAD_REQUESTS`/
`LOAD_P95_BUDGET_MS`/`LOAD_MAX_ERROR_RATE` (`scripts/load-smoke.mjs`), `SHOT_BASE_URL`
(скриншот-скрипт), `ERP_BENCH_ITERATIONS`/`ERP_PARSE_P95_BUDGET_MS` (бенчмарк-скрипт),
`RESTORE_DATABASE_URL`/`RESTORE_CONFIRM_DATABASE`/`BACKUP_FILE`/`BACKUP_DIR`
(backup/restore-скрипты, см. `docs/production-runbooks.md`), `PLAYWRIGHT_*`, `CI`.

### Vercel-специфичные (не нужны на Plesk, ни на что не влияют вне Vercel-рантайма)

`VERCEL_URL`, `VERCEL_ENV` — используются только как fallback в `lib/site-url.ts` /
`lib/observability.ts` / `lib/product-image-crop.ts`, когда `NEXT_PUBLIC_SITE_URL` не
задан. На Plesk `NEXT_PUBLIC_SITE_URL` обязателен, поэтому эти переменные не нужны.
`VERCEL_OIDC_TOKEN`, встречающийся в `.env.local` — артефакт `vercel env pull`,
не читается кодом приложения, можно не переносить.

### Устаревшие / больше не используемые

Не найдено. Все ключи из текущего `.env.example` реально читаются кодом.
`.env.example` дополнен в этом коммите разделами PayPal, `ADMIN_API_TOKEN` и
`GRINS_FTPS_*`, которых в нём раньше не было, хотя код их уже читал.

**Реальные значения секретов в репозиторий не добавлялись** — только имена
переменных с пояснениями и (для несекретных) примерами формата.

## 4) `sharp`

Установлен как прямая production-зависимость (`npm install sharp`, теперь в
`dependencies`, не optional peer). Next.js `<Image>` использует `sharp` для
серверной оптимизации изображений вне Vercel-рантайма — без него на iisnode
image optimization на лету не работала бы (или падала). Конфигурация
`next.config.js` → `images` не менялась (домены/SVG-политика/`qualities` —
как было).

`sharp` компилируется под конкретную платформу — `npm ci` на самом
Windows-сервере обязателен (нельзя копировать `node_modules` с другой ОС/архитектуры).

## 5) HTTPS/SSL

Session-cookie (`eshop_session` и др.) выставляется с `Secure` при
`NODE_ENV=production` (см. `app/api/auth/*/route.ts`). Это значит: **без
рабочего HTTPS на проде логин не будет держаться** (браузер не отправит
Secure-cookie по HTTP). HSTS и `upgrade-insecure-requests` в CSP тоже
включены только в production (`next.config.js`).

Практически: сертификат должен быть выпущен и привязан в Plesk **до**
первого реального прохождения логина/чекаута. **VERIFY ON SERVER**: выпуск
сертификата (Let's Encrypt через Plesk или иной), привязка к домену, редирект
HTTP→HTTPS на уровне IIS-сайта.

## 6) `server.js` — готовность к iisnode

Проведён точечный ревью и правка (без усложнения сверх найденных проблем):

-   **Критично для iisnode**: `PORT` под iisnode — это Windows named pipe
    (строка вида `\\.\pipe\...`), а не число. Старый код делал `Number.parseInt`
    и падал на старте с `Invalid PORT value`. Теперь `server.js` определяет,
    похож ли `PORT` на pipe, и либо слушает pipe (`server.listen(port)`), либо
    TCP `host:port` как раньше — поведение при обычном TCP-запуске (`npm start`
    локально/через httpPlatformHandler) не изменилось.
-   Добавлен `server.on('error', ...)` — раньше ошибка listen (например,
    занятый порт) роняла процесс необработанным исключением без внятного лога.
-   Добавлен graceful shutdown на `SIGTERM`/`SIGINT` (`server.close()` перед
    `process.exit`). **Проверено экспериментально**: на Windows `SIGTERM`,
    отправленный `process.kill(pid, 'SIGTERM')`, убивает процесс мгновенно и
    безусловно — Node/libuv на Windows не эмулируют перехватываемый SIGTERM
    (в отличие от `SIGINT`/`SIGBREAK`). Обработчик оставлен (безвреден, и
    реально работает на POSIX-хостах), но полагаться на graceful shutdown
    через `SIGTERM` на этом Windows/iisnode-сервере **нельзя** — как именно
    iisnode останавливает дочерний node-процесс при recycle/idle timeout,
    нужно смотреть по факту — **VERIFY ON SERVER**.
-   `HOST`/`PORT` уже читались из env, hardcoded `localhost`/портов не было.
-   Vercel-specific допущений в `server.js` не найдено (он и не мог их
    содержать — Vercel не использует custom server).
-   Совместимость с текущей версией Next.js (16.2.x) подтверждена по
    `node_modules/next/dist/docs/01-app/02-guides/custom-server.md` — паттерн
    `next({dev, hostname, port})` + `createServer` + `app.getRequestHandler()`
    актуален для этой версии.

Не менялось: количество воркеров/кластеризация, логирование в файл, health-check
эндпоинт — не запрашивались и не являются реальными проблемами на данном этапе.

## 7) Writable directories

По коду приложения (рантайм, не dev/ops-скрипты) **не найдено** записи на
диск — нет `fs.writeFile`/`mkdir` в `app/**` или `lib/**` вне тестов и
скриптов. Загрузка медиа идёт в Neon (`MediaAsset`), не на файловую систему.
Единственные файловые операции — офлайн-скрипты (`backup-database.ts` →
`BACKUP_DIR`, `crop-product-image.ts` и т.п.), которые не выполняются в
рамках обычной работы сайта. **Вывод: отдельная writable-директория для
самого приложения не требуется.** iisnode может всё равно ожидать
write-доступ к своей log-директории — **VERIFY ON SERVER**.

## 8) Neon connectivity

Приложение уже полностью на `@prisma/adapter-neon` + `ws` (WebSocket, порт 443) —
не зависит от исходящего TCP 5432, который на некоторых сетях/VPN блокируется
(см. память `project_neon_connectivity`). Для Plesk-сервера это значит: нужен
исходящий HTTPS (443) до Neon-хоста, TCP 5432 не требуется рантайму.
Присма CLI (`prisma migrate deploy` в `npm run build`) **тоже** сейчас идёт
через тот же `DATABASE_URL`/adapter — отдельного прямого TCP-подключения CLI
к 5432 в `npm run build` не задействовано (миграции гоняются через тот же
Prisma Client путь). **VERIFY ON SERVER**: исходящий 443 до Neon с самого
Plesk-сервера не заблокирован файрволом/прокси хостинга.

## 9) ERP Scheduled Task (на будущее, НЕ включать сейчас)

ERP-синк (GRINS FTPS adapter) реализован в коде, но выключен: нет активного
cron/scheduled task, `GRINS_FTPS_*` не обязаны быть заданы для обычной
работы сайта. Когда синк будет включён:

-   Задача должна запускаться как отдельный Scheduled Task в Plesk (не как
    часть веб-процесса iisnode), вызывающий существующий sync-скрипт.
-   До включения — обязательно свериться с открытыми вопросами из памяти
    (`project_live_db_sync_design`): externalId-бэкфилл ещё не сделан,
    single-writer дизайн синка не рассчитан на несколько магазинов, пишущих в
    одну живую БД.
-   Не включать production-синк/write-back без отдельного явного запроса —
    это прямо исключено из объёма текущей задачи.

## 10) `web.config` / iisnode — VERIFY ON SERVER

`web.config` в репозитории нет и добавлять его вслепую в этом коммите не
стали — его содержимое (handlers, `iisnode` секция, URL Rewrite правила)
обычно генерирует Plesk Node.js extension при первом деплое, и переписывать
его до этого — гадание.

После первого деплоя на сервере проверить:

-   Какой файл сгенерировал Plesk (`web.config` и/или `iisnode.yml`), и
    закоммитить его в репозиторий (без секретов) как часть деплой-конфигурации.
-   URL Rewrite: все пути (`/`, `/_next/static/*`, `/api/*`, `/[lang]/*`)
    действительно проксируются в `server.js`, а не в статический IIS-хендлер
    (иначе `/api/*` и динамические страницы вернут 404 от IIS).
-   `iisnode` node process path указывает на тот же Node.js, что установлен
    как Plesk Node.js Support (версия ≥22.13.0).
-   Логи iisnode (`iisnode` log directory) пишутся и доступны для чтения —
    нужны для диагностики после restart (см. чеклист ниже).
-   Idle timeout / recycling iisnode не рвёт долгие запросы (например,
    генерация PDF-инвойса) раньше времени.

## 11) Чеклист первого Plesk-деплоя

Базовое:
-   [ ] Node.js Support запущен, `npm ci` прошёл без ошибок на самом сервере
-   [ ] `npm run build` прошёл на сервере (включая `prisma migrate deploy`)
-   [ ] Приложение стартует (`npm start` / iisnode), в логе — `Next.js is listening on ...`
-   [ ] `/` отвечает 200
-   [ ] Статика `/_next/static/*` отдаётся (не 404, верный `Content-Type`)
-   [ ] Next/Image (`/_next/image?...`) отдаёт оптимизированную картинку (проверка, что `sharp` реально используется)

Витрина и аккаунт:
-   [ ] Каталог открывается, товары грузятся из Neon
-   [ ] Карточка товара открывается
-   [ ] Регистрация/активация карты проходит
-   [ ] Login работает, **cookie ставится с `Secure`** (HTTPS уже должен быть настроен — см. раздел 5)
-   [ ] Logout гасит сессию
-   [ ] Корзина сохраняется между запросами

Чекаут и оплата:
-   [ ] Checkout доходит до шага оплаты
-   [ ] Neon: заказ реально пишется (read+write подтверждены на реальных данных)
-   [ ] SMTP: письмо подтверждения/инвойса реально доходит
-   [ ] Turnstile: виджет показывается и проходит (или осознанно выключен)
-   [ ] Paysera sandbox: платёж проходит, возврат на сайт (`return_url`) работает
-   [ ] PayPal sandbox: платёж проходит, `paypal-return` работает
-   [ ] Webhooks `/api/webhooks/paysera` и `/api/webhooks/paypal` реально достижимы **извне** (не только localhost) — оплата — внешний коллбэк, без публичного HTTPS-доступа webhook не придёт

Админка и эксплуатация:
-   [ ] `/admin` открывается, требует прав
-   [ ] Uploads/медиа (если проверяется вручную) отображаются корректно
-   [ ] Restart приложения через Plesk отрабатывает без ручного вмешательства
-   [ ] После restart — логи (iisnode + `docs/production-runbooks.md` alert-события) читаемы и не показывают startup-ошибок

## 12) Пока сознательно не делается

Не включать ERP cron, не переключать DNS, не менять архитектуру платежей/Neon,
не создавать `web.config` наугад, не удалять Vercel-конфигурацию — см.
раздел «Пока НЕ нужно» в постановке задачи. Эти пункты остаются на отдельные,
явно запрошенные шаги после первого успешного запуска на Plesk.
