# Hairshop Pro: аудит медиафайлов — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-media`.
- Stacked base: `8519830864af8f27eaca21eb5649d172972d1eaa`, проверенный head открытого Draft PR #21 (`fix/2026-11-09-admin-audit-access-requests`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #21 `open`, `draft=true`, `merged=false`, head точно `85198308…`, base `fix/2026-11-09-admin-audit-configuration-restore`; `static-and-unit` на `85198308` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42687029062/job/129396477986.
- Коммит реализации: `90ddbb40` (`fix(audit): record media uploads, replacements and deletions`).
- Draft PR в `fix/2026-11-09-admin-audit-access-requests`: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `fix/2026-11-09-admin-audit-access-requests`
  - head: `fix/2026-11-09-admin-audit-media`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-access-requests...fix/2026-11-09-admin-audit-media?expand=1 («Create draft pull request»)
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI появится после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Где живут медиафайлы

Прослежены все три маршрута до фактических изменений: байты хранятся **только** в таблице `MediaAsset` (`name` PK, `mimeType`, `size`, `data Bytes`, `createdAt`, `updatedAt`). Файловой системы, Blob/S3 или CDN-копии нет; `/api/media/<name>` читает строку из БД (`Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`). Поэтому staging/компенсация не нужны: каждая мутация и её строка аудита — одна PostgreSQL-транзакция.

## Реализовано

Новый `lib/media-asset-store.ts` (по образцу `price-groups-server-store`): `createMediaAsset`, `replaceMediaAsset`, `deleteMediaAssets`. Маршруты оставляют у себя права, лимиты, валидацию и формат ответа.

| Маршрут | Событие | Транзакция |
|---|---|---|
| `POST /api/admin/content/upload` | `media.uploaded` | `mediaAsset.create` + аудит |
| `POST /api/admin/media/replace` | `media.replaced` | `SELECT … FOR UPDATE` + сравнение хеша + `update` + аудит |
| `DELETE /api/admin/media` | `media.deleted` (по строке на файл, общий `requestId`) | `SELECT … WHERE name = ANY($1) ORDER BY name FOR UPDATE` + `deleteMany` + аудит |

Опции транзакции: `maxWait 10s`, `timeout 60s` — видео до 50 МБ передаётся внутри интерактивной транзакции.

Аудит: `entityType: 'media_asset'`, `entityId`/`entityTitle` = имя файла; `before`/`after` = `{ path, mimeType, size, sha256 }` (`before: null` для загрузки, `after: null` для удаления). Хеш хранящихся байт считает PostgreSQL (`encode(sha256(data), 'hex')`), байты в приложение ради аудита не загружаются. Содержимое файла и исходное имя файла с компьютера сотрудника в журнал не попадают. Actor и request — из `requireAdmin()`.

Названия: RU «Загрузка медиафайла» / «Замена медиафайла» / «Удаление медиафайла»; LV «Multivides fails augšupielādēts» / «Multivides fails aizstāts» / «Multivides fails dzēsts»; EN «Media file uploaded» / «Media file replaced» / «Media file deleted».

### Сохранено без изменений

- `requireAdmin()` (`users.manage`) до чтения тела во всех трёх маршрутах.
- Upload: `file_is_required`, лимит 10 МБ для изображений / 50 МБ для видео (`file_too_large`), сигнатурная проверка `validateUploadedMedia` (`unsupported_file_type`, SVG и активный контент отклоняются), имя `<Date.now()>-<нормализованное имя>`, ответ `{ path, originalName, size, mimeType }`, `500 failed_to_upload_file`.
- Replace: `invalid_filename`, `file_required`, лимит 10 МБ, только изображения (`validateUploadedImage`, `unsupported_type`), `404 not_found`, ответ `{ ok: true, path }`, `500 replace_failed`. Замена на месте под тем же именем — все ссылки `/api/media/<name>` остаются рабочими.
- Delete: `name` или `names`, `400 name_required`, ответ `{ ok: true, deleted, errors: [...невалидные, ...отсутствующие] }`, `500 failed_to_delete`.
- `GET /api/admin/media` не менялся.

### Повторы и конкурентность

- **Replace без изменений** (тот же sha256, тип и размер): `200 { ok: true, path }`, без записи, без сдвига `updatedAt` (порядок в медиатеке не меняется), без события.
- **Параллельные replace одного файла** сериализуются row lock: второй видит результат первого, поэтому `before` второго события равен `after` первого; если байты одинаковы — второй запрос становится no-op.
- **Повторный и параллельный delete**: существование решается под row lock; удалённый другим запросом файл возвращается в `errors`, `deleted: 0`, второго события нет. Порядок блокировки по имени исключает взаимную блокировку пакетных удалений.
- **Upload** по контракту каждый раз создаёт новый ресурс с новым именем — повтор того же файла даёт отдельный ресурс и отдельное событие (дедупликации не было и не добавлялось). Совпадение имени в ту же миллисекунду → `P2002` → откат вместе с аудитом, `500 failed_to_upload_file` (как раньше).

### Гарантии при сбое

| Сбой | Результат |
|---|---|
| Ошибка `appendServerAudit` при upload | Ресурс не создан, `500 failed_to_upload_file` |
| Ошибка аудита при replace | Прежние байты, тип и `updatedAt` сохранены, `500 replace_failed` |
| Ошибка аудита на любом файле пакетного delete | Не удалён ни один файл пакета, `500 failed_to_delete` |

## Что подтверждено

**Unit** (`lib/media-asset-store.test.ts`, 15): stateful harness со staged-копией состояния и сериализацией транзакций (модель row lock):

- upload: событие с path/type/size/hash; откат при сбое аудита; коллизия имени без второго события;
- replace: before/after; no-op без записи, без `updatedAt` и события; смена только типа фиксируется; `not_found` без события; откат при сбое аудита; конкурентная цепочка before→after; конкурентный дубль — одно событие; SQL содержит `FOR UPDATE` и `sha256(data)`;
- delete: события по файлам с общим `requestId`; повтор — no-op; конкурентное удаление — одно событие; сбой аудита на втором файле оставляет оба файла;
- в аудите нет байт файла (маркер и base64), ключи только `mimeType/path/sha256/size`.

**Маршруты** (`content/upload` 12, `media` 9, `media/replace` 10): отказ без прав до обращения к store (upload, replace, delete), невалидный файл/имя/тип/размер до store, передача actor/request из сессии, no-op replace с тем же ответом, сбой store/аудита → прежние 500-коды, повторный delete → `deleted: 0` и файл в `errors`. `lib/admin-log-store.test.ts` — RU/LV/EN.

**PostgreSQL-семантика на изолированном PGlite** (in-memory PostgreSQL в scratch-каталоге вне репозитория, схема из `prisma migrate diff --from-empty --to-schema prisma/schema.prisma`, реальный `appendServerAudit` и `PrismaPg`): 16/16 PASS — `sha256(data)` в PostgreSQL совпадает с Node sha256; `ANY($1)` с массивом и `ORDER BY … FOR UPDATE` работают; no-op не сдвигает `updatedAt`; повторный delete — no-op; общий `requestId`; при отказе вставки аудита (CHECK-ограничение) загрузка откатывается; байт в аудите нет. PGlite однопользовательский, поэтому настоящая конкурентность двух соединений там не проверялась — только моделью в unit-тестах. Рабочая Neon не использовалась; PGlite и его пакеты не добавлены в репозиторий.

## Затронутые пути

- `lib/media-asset-store.ts` (новый)
- `lib/media-asset-store.test.ts` (новый)
- `app/api/admin/content/upload/route.ts`, `route.test.ts`
- `app/api/admin/media/route.ts`, `route.test.ts`
- `app/api/admin/media/replace/route.ts`, `route.test.ts`
- `lib/admin-log-store.ts`, `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `90ddbb40` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/media-asset-store.test.ts app/api/admin/content/upload/route.test.ts app/api/admin/media/route.test.ts app/api/admin/media/replace/route.test.ts lib/admin-log-store.test.ts
# PASS: 5 files, 67 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 958 source modules

npm run test:unit -- --reporter=dot
# PASS: 370 files, 3139 tests

npx eslint lib/media-asset-store.ts lib/media-asset-store.test.ts app/api/admin/content/upload/route.ts app/api/admin/content/upload/route.test.ts app/api/admin/media/route.ts app/api/admin/media/route.test.ts app/api/admin/media/replace/route.ts app/api/admin/media/replace/route.test.ts lib/admin-log-store.ts lib/admin-log-store.test.ts
# PASS

npm run check:encoding
# PASS: 1356 source files

git diff --check
# PASS
```

PGlite-проверка (16/16) выполнялась временным скриптом вне репозитория; файл в коммит не входит.

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»).

## Отдельные находки (не исправлялись)

- **Удаление не проверяет ссылки.** `DELETE /api/admin/media` удаляет ресурс, даже если он используется в баннерах, блоге, товарах или `site-content`; ссылки начинают отдавать 404. Поведение прежнее; теперь удаление хотя бы попадает в журнал с хешем.
- **Кэш после замены.** `/api/media/<name>` кэшируется публично на 1 час (+ stale-while-revalidate сутки), поэтому после replace CDN/браузер может показывать старое изображение. Поведение прежнее.
- **Replace принимает только изображения**, в том числе для существующего видео-ресурса (видео можно заменить картинкой, но не другим видео). Поведение прежнее.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым добавлены `POST /api/admin/content/upload`, `POST /api/admin/media/replace`, `DELETE /api/admin/media`.

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #21:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #21 было 26; этот PR закрывает три маршрута, остаётся **23**:

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
18. `POST /api/admin/invitations/card`
19. `POST /api/admin/invitations`
20. `POST /api/admin/invitations/sms`
21. `POST /api/admin/notifications/assets`
22. `POST /api/admin/products/[id]/notify-promo`
23. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR (base `fix/2026-11-09-admin-audit-access-requests`, head `fix/2026-11-09-admin-audit-media`) по ссылке выше и проверить `static-and-unit` на head ветки. С авторизованным `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-access-requests --head fix/2026-11-09-admin-audit-media`.
1. Следующий stacked PR — аудит приглашений: `POST /api/admin/invitations`, `POST /api/admin/invitations/card`, `POST /api/admin/invitations/sms`. Начать от зелёного head этого PR.
2. Проследить создание/замену `InvitationToken`, `InvitationDelivery` и внешнюю доставку (SMTP/SMS); токен — в той же транзакции, что и аудит, доставка — после коммита (по образцу access requests в PR #21).
3. Сохранить права, лимиты пакетов, API-контракт; в журнале — ID пользователя/приглашения, канал, количество и статус доставки, без токена, email, телефона и текста сообщения; повтор без изменений не должен создавать второй токен и событие.
4. Тесты: отказ без прав, невалидный ввод, успех, повтор, параллельные запросы для одного пользователя, сбой аудита (откат токена), сбой доставки после коммита.

Далее: остальные рассылки (`broadcast`, `card-request`, `card-rules-campaign`, `notify-promo`, `stock-alerts/send`), затем CMS-контент (баннеры, блог, кампании, шаблоны писем), hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-media
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/media-asset-store.test.ts app/api/admin/content/upload/route.test.ts app/api/admin/media/route.test.ts app/api/admin/media/replace/route.test.ts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
