# Hairshop Pro: аудит шаблонов писем и вложений уведомлений — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-email-assets`.
- Stacked base: `8f1e224921f5ffa3a4900b4bfe36452e6af45392`, проверенный head открытого Draft PR #26 (`fix/2026-11-09-admin-audit-promo-template-sends`).
- Перед созданием ветки GitHub подтвердил: PR #26 `open`, `draft=true`, `merged=false`, head точно `8f1e224921f5ffa3a4900b4bfe36452e6af45392`.
- Коммит реализации: `1cf040ae10eed766fa4ff47fea707e3dcbff4e0f`.
- Stacked Draft PR #27: https://github.com/Prokuuudin/eshop02/pull/27; base `fix/2026-11-09-admin-audit-promo-template-sends`.
- Результат `static-and-unit` будет добавлен после проверки финального SHA.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Реализовано

### Изменение шаблона письма

Путь: `PUT /api/admin/email-templates/[id]` → `upsertTemplate` → KV-строка `email-templates` в `KeyValueSetting`.

- Существующий `requireAdmin()`, allowlist полей, validation, статусы и response body сохранены.
- Actor и request передаются из авторизованной серверной сессии.
- Read-modify-write KV, `email_template.updated` и существующий advisory lock выполняются в одной Prisma-транзакции.
- Сравниваются только разрешённые поля `name`, `subject`, `body`, `variables`. Идентичный повтор возвращает существующий шаблон без upsert, изменения `updatedAt` и события.
- Audit entity ID — ID шаблона. `before/after` содержат только список фактически изменившихся полей и для каждого поля `bytes`/SHA-256.
- Строковые поля хешируются как UTF-8; `variables` — как JSON-массив.
- Название, subject, body, значения variables и полный шаблон в `AuditLog` не попадают.
- Ошибка `appendServerAudit` откатывает KV-изменение вместе с событием.

Action label `email_template.updated`:

- RU: «Изменение шаблона письма»;
- LV: «E-pasta veidne atjaunināta»;
- EN: “Email template updated”.

### Загрузка вложения уведомления

Путь: `POST /api/admin/notifications/assets` → `createMediaAsset` → `MediaAsset`.

- Существующее право `marketing.manage`, лимит 10 MiB, image/PDF validation, safe filename, response и URL `/api/media/<encoded name>` сохранены.
- Прямой `mediaAsset.create` заменён вызовом уже существующего транзакционного helper из `lib/media-asset-store.ts`.
- Строка `MediaAsset` и `media.uploaded` создаются в одной Prisma-транзакции.
- Событие содержит сгенерированный ID/имя ассета, API path, MIME, размер и SHA-256; байты файла и исходное содержимое не журналируются.
- Ошибка аудита откатывает загрузку.
- Поведение отдельной загрузки сохранено: каждый POST получает новое имя и создаёт отдельный ассет/событие, даже если байты совпадают.
- Дисковой записи нет: содержимое хранится только в PostgreSQL `MediaAsset`, поэтому файловая staging/compensation не требуется.

`media.uploaded` и его RU/LV/EN labels уже были добавлены и протестированы в предыдущем media PR; этот PR подключает notification-assets route к тому же helper.

## Что подтверждено тестами

- отказ до mutation без требуемой server session/permission;
- malformed template variables и неподдерживаемые file bytes не доходят до storage;
- actor/request передаются из route в transactional helper;
- только разрешённые template fields сохраняются;
- успешное изменение шаблона создаёт fingerprint payload без текста;
- идентичный template update — no-op без write/event;
- параллельные изменения разных шаблонов не теряются;
- конкурентный одинаковый update создаёт одно событие;
- ошибка аудита откатывает изменение шаблона;
- notification image/PDF сохраняются через `createMediaAsset`;
- два одинаковых notification uploads остаются двумя отдельными операциями;
- media helper подтверждает hash/size payload, отсутствие bytes, rollback при ошибке аудита, collision и concurrent replace/delete;
- RU/LV/EN labels.

Конкуренция и rollback подтверждены stateful unit harness с staged commit. Настоящая изолированная PostgreSQL в этом PR не использовалась; рабочая Neon не использовалась.

## Затронутые пути

- `app/api/admin/email-templates/[id]/route.ts`
- `app/api/admin/email-templates/[id]/route.test.ts`
- `app/api/admin/notifications/assets/route.ts`
- `app/api/admin/notifications/assets/route.test.ts`
- `lib/email-templates-server-store.ts`
- `lib/email-templates-server-store.test.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки до push

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
# PASS: Prisma Client 7.8.0; подключения к БД не было

npx vitest run --config vitest.config.ts 'app/api/admin/email-templates/[id]/route.test.ts' app/api/admin/notifications/assets/route.test.ts lib/email-templates-server-store.test.ts lib/media-asset-store.test.ts lib/admin-log-store.test.ts
# PASS: 5 files, 66 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 960 source modules

npm run test:unit -- --reporter=dot
# PASS: 376 files, 3285 tests

npx eslint <8 изменённых TypeScript-файлов>
# PASS

npm run check:encoding
# PASS: 1364 source files

git diff --check
# PASS
```

## Карта покрытия

### Постоянный аудит в той же транзакции

Добавлены:

- `PUT /api/admin/email-templates/[id]` — `email_template.updated`;
- `POST /api/admin/notifications/assets` — `media.uploaded` через общий media helper.

### Запись после операции или в отдельной транзакции

По коду без изменений остаются:

- `POST /api/admin/grins-import/apply`;
- `POST /api/admin/import`;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`;
- `POST /api/admin/storefront-cache/revalidate`;
- `POST /api/admin/grins-import/preview`.

### Без записи в `AuditLog`

После PR #26 оставалось 14 handler. Этот PR закрывает два, остаётся **12**:

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

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin.

## Первый следующий шаг для Claude

Следующий stacked PR: баннеры, блог и кампании.

1. Начать с финального зелёного head этого PR и направить новый Draft PR в его ветку, если он открыт.
2. Проследить `PUT /api/admin/banner-groups`, CRUD/reorder баннеров, create/delete блога и CRUD кампаний до DB/KV/media storage.
3. Разделить реальные mutation types и no-op; использовать actor из server session и `appendServerAudit` в той же транзакции.
4. Для ссылок/изображений журналировать только ID/path, размеры и хеши, без содержимого.
5. Проверить permission, validation, success, no-op, concurrency и audit rollback.

После этого: `contact-messages`, `dashboard-prefs`; затем hardening post-operation audits, постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-email-assets
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
npx vitest run --config vitest.config.ts 'app/api/admin/email-templates/[id]/route.test.ts' app/api/admin/notifications/assets/route.test.ts lib/email-templates-server-store.test.ts lib/media-asset-store.test.ts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Ожидается чистый checkout. Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
