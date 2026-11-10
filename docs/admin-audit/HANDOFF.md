# Hairshop Pro: аудит баннеров, блога и кампаний — handoff

Дата: 2026-11-10 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-banners-blog-campaigns`.
- Stacked base: `6495c287646ec67afd269d6831d258d4139417ce`, проверенный head открытого Draft PR #27 (`fix/2026-11-09-admin-audit-email-assets`).
- Перед созданием ветки GitHub подтвердил: #27 `open`, `draft=true`, `merged=false`, head точно `6495c287646ec67afd269d6831d258d4139417ce`.
- Коммит реализации: `42ddbd187fe25eeb1a5c6aad5cd286983e9a0844`.
- Новый stacked Draft PR нужно направить в `fix/2026-11-09-admin-audit-email-assets`.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Покрытые маршруты и события

Все перечисленные mutation хранят данные только в PostgreSQL; записей или замен файлов на диске нет.

| Маршрут | Фактическое хранилище | Событие |
|---|---|---|
| `PUT /api/admin/banner-groups` | `KeyValueSetting.banner-groups` | `banner_groups.updated` |
| `POST /api/admin/banners` | `Banner` + `KeyValueSetting.banner-group-assignments` | `banner.created` |
| `PUT /api/admin/banners/[id]` | `Banner` + assignment KV | `banner.updated` |
| `DELETE /api/admin/banners/[id]` | `Banner` + assignment KV | `banner.deleted` |
| `POST /api/admin/banners/reorder` | `Banner.order` | `banner.reordered` |
| `POST /api/admin/blog` (create) | `BlogPost` | `blog.created` |
| `POST /api/admin/blog` (edit) | `BlogPost` | `blog.updated` |
| `DELETE /api/admin/blog/[id]` | `BlogPost` | `blog.deleted` |
| `POST /api/admin/campaigns` | `KeyValueSetting.promo-campaigns` | `campaign.created` |
| `PUT /api/admin/campaigns/[id]` | тот же KV | `campaign.updated` |
| `DELETE /api/admin/campaigns/[id]` | тот же KV | `campaign.deleted` |

Названия всех 11 событий добавлены в RU/LV/EN.

## Фактические гарантии реализации

- Actor и request берутся из существующей серверной `requireAdmin()`-сессии; прежние admin gates сохранены.
- Mutation и `appendServerAudit` выполняются в одной Prisma-транзакции.
- Domain advisory lock — первая команда транзакции. После ожидания lock данные читаются в стандартном `Read Committed`, поэтому конкурентный запрос видит уже зафиксированное состояние предыдущего запроса.
- Banner row и assignment KV теперь меняются атомарно; раньше это были раздельные транзакции.
- Reorder блокирует весь banner mutation-domain, сохраняет полный порядок одним transaction commit и пишет массив ID до/после. Ошибка любой позиции или аудита откатывает весь порядок.
- Общий KV кампаний читается, валидируется и записывается под одним lock. Конкурентные create/update не теряют изменения и повторно проверяют пересечение second-item кампаний по актуальному состоянию.
- Идентичные banner-group, banner, blog и campaign update не пишут данные, не меняют служебный timestamp и не создают событие.
- Повторное удаление отсутствующей статьи остаётся прежним успешным no-op; повторное удаление отсутствующего banner/campaign сохраняет прежний `404`. Событие не дублируется.
- Revalidation вызывается только после успешного возврата из транзакционного helper, то есть после commit.
- Права, validation errors/statuses, banner order rules, campaign scheduling/second-item/BrandLine validation и response shapes сохранены.

## Состав AuditLog

- Для update записываются только фактически изменившиеся поля; entity ID всегда хранится отдельно.
- Для banner image reference сохраняются UTF-8 размер и SHA-256, но не сама ссылка/медиа.
- Для статей `title`, `excerpt`, `content`, `contentBlocks`, `translations`, `authorBio` и `image` сохраняются как размер + SHA-256. Текст статьи, блоки и ссылки на медиа в журнал не попадают.
- Для campaign description сохраняются размер + SHA-256; остальные изменившиеся настройки сохраняются как минимальные значения до/после.
- Reorder хранит полный массив banner ID до и после.

## Что подтверждено тестами

Stateful transaction harness с staged commit/rollback подтвердил:

- отказ без прав до вызова storage;
- invalid JSON, group schema, blog blocks и campaign rules не создают mutation/event;
- успешные create/update/delete и содержимое событий;
- отсутствие текста статей, media references и campaign description в AuditLog;
- идентичный повтор без write/event;
- конкурентные одинаковые update создают одно событие;
- конкурентные campaign create сохраняют обе записи KV;
- audit failure откатывает Banner, assignment KV, BlogPost и campaign/banner-group KV;
- сбой после первой позиции reorder и сбой аудита возвращают весь исходный порядок;
- route actor/request передаются в transactional helper;
- RU/LV/EN labels.

Настоящая изолированная PostgreSQL в этом PR не использовалась. Конкуренция и rollback подтверждены stateful unit harness и структурой кода; рабочая Neon не использовалась.

## Проверки до push

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
# PASS: Prisma Client 7.8.0; подключения к БД не было

npx vitest run --config vitest.config.ts app/api/admin/banner-groups/route.test.ts app/api/admin/banners/route.test.ts app/api/admin/banners/reorder/route.test.ts app/api/admin/blog/route.test.ts app/api/admin/campaigns/route.test.ts lib/banner-groups-store.test.ts lib/banners-server-store.test.ts lib/blog-store.test.ts lib/campaigns-server-store.test.ts lib/admin-log-store.test.ts
# PASS: 10 files, 99 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 961 source modules

npm run test:unit -- --reporter=dot
# PASS: 381 files, 3315 tests

npx eslint <23 changed TypeScript files>
# PASS

npm run check:encoding
# PASS: 1370 source files

git diff --check
# PASS
```

Первый `npm ci --prefer-offline --no-audit` установил пакеты, но завершился кодом 1 на lifecycle `prepare`: sandbox запретил `git config core.hooksPath` в общем `.git/config`. Это локальное ограничение установки hook, не ошибка исходников; Prisma generation, tests, lint и typecheck после этого выполнялись успешно.

Известные browser jobs в предыдущих stacked PR отдельно падали на `playwright install` на `ubuntu26.04-x64`. Изменения Playwright/CI находятся вне этого PR.

## Затронутые пути

- `app/api/admin/banner-groups/route.ts` и тест;
- `app/api/admin/banners/route.ts`, `[id]/route.ts`, `reorder/route.ts` и тесты;
- `app/api/admin/blog/route.ts`, `[id]/route.ts` и route test;
- `app/api/admin/campaigns/route.ts`, `[id]/route.ts` и route test;
- `lib/banner-groups-store.ts` и тест;
- `lib/banners-server-store.ts` и тест;
- `lib/blog-store.ts` и тест;
- `lib/campaigns-server-store.ts` и тест;
- `lib/admin-log-store.ts` и тест;
- `docs/admin-audit/HANDOFF.md`.

## Карта покрытия после этого PR

### Постоянный аудит в той же транзакции

Этим PR закрыты все 10 handler из этапа banner/blog/campaign. В ранее найденной группе без `AuditLog` остаются **2**:

1. `PATCH /api/admin/contact-messages`
2. `PUT /api/admin/dashboard-prefs`

### Запись после операции или в отдельной транзакции

По коду без изменений остаются:

- `POST /api/admin/grins-import/apply`;
- `POST /api/admin/import`;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`;
- `POST /api/admin/storefront-cache/revalidate`;
- `POST /api/admin/grins-import/preview`.

### Отдельные пробелы

- `POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin.
- Аудит импорта GrinS по-прежнему записывается после применения, а не атомарно с ним.

## Первый следующий шаг для Claude

Следующий stacked PR: `PATCH /api/admin/contact-messages` и `PUT /api/admin/dashboard-prefs`.

1. Начать от финального зелёного head этого Draft PR и направить новый PR в его ветку, если он ещё открыт.
2. Проследить contact-message mutation до фактического DB store и dashboard prefs до KV.
3. Сохранить actor из server session, no-op semantics и `appendServerAudit` в одной транзакции.
4. Проверить permission, invalid input, success payload, повтор, конкуренцию и audit rollback.
5. После этого обновить карту: в исходной группе из 12 handler без записи должно остаться 0.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-banners-blog-campaigns
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
npx vitest run --config vitest.config.ts app/api/admin/banner-groups/route.test.ts app/api/admin/banners/route.test.ts app/api/admin/banners/reorder/route.test.ts app/api/admin/blog/route.test.ts app/api/admin/campaigns/route.test.ts lib/banner-groups-store.test.ts lib/banners-server-store.test.ts lib/blog-store.test.ts lib/campaigns-server-store.test.ts lib/admin-log-store.test.ts
npm run typecheck
npm run audit:architecture
```

Ожидается чистый checkout. Не подставлять production Neon URL и не выполнять deploy.
