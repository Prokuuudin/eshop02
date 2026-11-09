# Hairshop Pro: аудит полного цикла архива товаров — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и границы

- Ветка: `fix/2026-11-09-admin-audit-product-archive-move`.
- Stacked base: `11bc90836eb0735e866603f413cc026f585e657f`, финальный зелёный head открытого Draft PR #16 (`fix/2026-11-09-admin-audit-product-archive`).
- Коммит реализации восстановления/permanent purge: `b0b5d5bb6bb520e958ae5f6bb9d4f94ec2c8f110`.
- Коммит реализации archive move/override reset: `c13f575cc20dea13c9656bf1972ece93d4dd66e6`.
- Коммит исправления архитектурного лимита: `eb7d3370966dde4382e16466f3d4877a14b393cc`.
- Draft PR #16: https://github.com/Prokuuudin/eshop02/pull/16; base `fix/2026-11-09-admin-audit-content-payment`, поэтому diff содержит только работу с архивом товаров.
- Stacked Draft PR #18: https://github.com/Prokuuudin/eshop02/pull/18; base `fix/2026-11-09-admin-audit-product-archive`, поэтому diff содержит только archive move/override reset.
- `static-and-unit` для исправленного SHA прошёл: https://github.com/Prokuuudin/eshop02/actions/runs/42618745522/job/129165119202.
- Финальный head PR #16 также прошёл `static-and-unit`: https://github.com/Prokuuudin/eshop02/actions/runs/42619329938/job/129167111876.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

PR #15 был проверен через публичный GitHub API до создания ветки: `state=open`, `draft=true`, `merged=false`, head точно `f53ea450753e1f2017d20a43701f1da1f20d85e9`. Поэтому ветка создана от этого SHA, а не от `main` или release-ветки.

Новая ветка создана только после успешного `static-and-unit` PR #16 и указывает ровно на его проверенный head `11bc9083…`. Новый Draft PR должен иметь base `fix/2026-11-09-admin-audit-product-archive`, чтобы diff содержал только archive move/override reset.

## Исправление `static-and-unit` PR #16

На head `ffe50351a7bd353254c7cfab33ae588dfb91f13d` CI воспроизводимо останавливался на `npm run audit:architecture`: `lib/product-overrides-store.ts: 803 lines (limit 800)`. Лимит и workflow не менялись.

Минимальный связный блок `readProductOverridesTx`/`writeProductOverridesTx` вынесен в `lib/product-overrides-transaction.ts`. Вызовы остаются внутри callback той же Prisma-транзакции восстановления; порядок Product/archive/override mutation → `appendServerAudit` → commit не изменён. После выноса локальный architecture audit и одноимённый CI step проходят.

GitHub `static-and-unit` на SHA `eb7d3370966dde4382e16466f3d4877a14b393cc` завершился `success`; внутри job также прошли lint, typecheck, security/architecture audits, unit, integration и ERP performance.

## Реализовано

### Перенос в архив и сброс override

Путь: одиночная и массовая ветки `DELETE /api/admin/products`.

- Существующий `requireAdminPermission('catalog.update')`, payload и response envelope сохранены; actor и request передаются в server helpers.
- Одиночный `permanently=true` по-прежнему переносит товар в recovery-архив. Product теперь повторно читается после archive advisory lock, поэтому конкурентный повтор не заменяет archive snapshot и не создаёт phantom event.
- Массовый `ids[]` остаётся атомарным: если хотя бы один ID отсутствует/уже архивирован, не меняется ни один товар и событий нет. Для успешного batch создаётся по одному `product.archived` на реально изменённый ID с общим server-generated request ID.
- Сброс override выполняется под advisory lock в одной транзакции с `product.override_reset`. Если override отсутствует, сохраняется прежний успешный no-op без audit event.
- Ошибка `appendServerAudit` откатывает Product, archive KV или overrides KV вместе с событием.
- Audit payload archive move содержит ID/title, `base`/`custom`, `deletedAt` и переход `archived: false → true`; reset содержит прежний override и `override: null` после операции.

Новые labels:

| Action | RU | LV | EN |
|---|---|---|---|
| `product.archived` | Перенос товара в архив | Produkts pārvietots uz arhīvu | Product moved to archive |
| `product.override_reset` | Сброс переопределения товара | Produkta pārrakstījums atiestatīts | Product override reset |

### Восстановление из архива

Путь: `POST /api/admin/products/restore` → `restoreDeletedProduct`.

- Существующий `requireAdmin()` сохранён и выполняется до чтения payload.
- Actor берётся из авторизованной серверной сессии и передаётся вместе с `NextRequest` в server helper.
- Восстановление `Product`, восстановление override-полей, удаление записи из `deleted-products-archive` и `appendServerAudit` теперь находятся в одной Prisma-транзакции.
- Ранее override-поля базового товара сохранялись отдельным вызовом после коммита архива; этот частичный commit устранён. Поле `stock` по-прежнему не восстанавливается как override: актуальный ERP-остаток остаётся источником истины.
- Action: `product.restored`; entity: `product/<productId>`.
- Audit payload: название товара, источник (`base`/`custom`), `deletedAt` и переход `archived: true → false`.
- Если ID уже отсутствует в архиве, товар и журнал не меняются.
- Advisory lock на архив сериализует конкурентные restore/purge. Два одновременных восстановления одного ID дают ровно одно изменение и одно событие.

### Окончательное удаление

Путь: `DELETE /api/admin/products/archive` → `purgeDeletedProductArchive`.

- Существующий `requireAdmin()`, статус ответа и envelope сохранены.
- Удаление recovery-записи из архива и `appendServerAudit` выполняются в одной Prisma-транзакции.
- Action: `product.permanently_deleted`; entity: `product/<productId>`.
- Audit payload: название товара, источник, `deletedAt` и переход к `permanentlyDeleted: true`.
- Повторный или конкурентный запрос после первого успешного удаления получает прежнюю domain-ошибку и не создаёт событие об отсутствующем изменении.
- Для базового товара физическая строка `Product` остаётся с `isDeleted=true`; для custom-товара строка была удалена ещё при переносе в архив. Окончательность здесь означает удаление последней recovery-копии из KV-архива — это фактическое прежнее поведение API.

### Массовые действия

UI и раньше отправлял по одному параллельному запросу на каждый ID, сохраняя частичную успешность. Формат API не менялся. Теперь один bulk restore или bulk purge создаёт один UUID и передаёт его во всех запросах как `x-request-id`; существующий `appendServerAudit` сохраняет этот общий ID в каждой фактически созданной строке журнала.

Тест массового purge отправляет `p1`, отсутствующий ID и `p2` с одним request ID. Изменяются и журналируются только `p1`/`p2`; обе записи имеют общий request ID.

### Названия событий

| Action | RU | LV | EN |
|---|---|---|---|
| `product.restored` | Восстановление товара | Produkts atjaunots | Product restored |
| `product.permanently_deleted` | Окончательное удаление товара | Produkts neatgriezeniski dzēsts | Product permanently deleted |

## Фактическая классификация всех проверенных путей

| Путь/ветка | Фактическое действие | Состояние аудита после этого PR |
|---|---|---|
| `POST /api/admin/products/restore` | Восстановление Product/override и удаление recovery-записи | Постоянный server audit в той же транзакции |
| `DELETE /api/admin/products/archive` | Удаление последней recovery-записи, то есть окончательное удаление | Постоянный server audit в той же транзакции |
| `DELETE /api/admin/products`, одиночный, `permanently=true` | Перенос в архив; base получает `isDeleted=true`, custom удаляется из Product, но остаётся восстановимый snapshot | Постоянный server audit в той же транзакции |
| `DELETE /api/admin/products`, `ids[]` | Массовый перенос в архив по тем же правилам | По событию на фактически изменённый ID, одна транзакция и общий request ID |
| `DELETE /api/admin/products`, одиночный без `permanently=true` | Сброс записи из `product-overrides`, товар не удаляется | Постоянный server audit при фактическом override; no-op без события |
| `deleteCustomProduct` | Физическое удаление custom Product без архива | Не имеет серверных вызывающих в выбранной базе; не считается API-path |

Поле `permanently` в `DELETE /api/admin/products` вводит в заблуждение: фактический пользовательский результат — «переместить в корзину/архив». Контракт намеренно не переименован; аудит отражает фактическое действие как `product.archived`, а не permanent delete.

## Затронутые пути

- `app/api/admin/products/archive/route.ts`
- `app/api/admin/products/archive/route.test.ts`
- `app/api/admin/products/restore/route.ts`
- `app/api/admin/products/restore/route.test.ts`
- `app/api/admin/products/route.ts`
- `app/api/admin/products/route.test.ts`
- `hooks/admin/products/useProductsAdmin.ts`
- `lib/product-overrides-store.ts`
- `lib/product-overrides-transaction.ts`
- `lib/product-overrides-store.test.ts`
- `lib/product-archive-audit.test.ts`
- `lib/product-archive-audit.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Подтверждено тестами:

- успешное восстановление custom/base-поведения и точный audit action/entity/actor/before/after;
- восстановление override внутри транзакции без возврата архивного `stock`;
- успешное окончательное удаление и точный audit payload;
- отказ route до мутации без admin session/permission;
- последовательный и конкурентный повтор без второго события;
- rollback восстановления и purge при ошибке `appendServerAudit`;
- массовый purge: журнал содержит только фактически изменившиеся ID, объединённые одним request ID;
- RU/LV/EN labels.
- одиночный/массовый archive move, конкурентный повтор, atomic missing-ID reject и общий batch request ID;
- override reset, повторный no-op без дубля и rollback reset/archive move при ошибке аудита.

Stateful rollback-тест создаёт staged-копию Product/KV/AuditLog и коммитит её только после успешного завершения transaction callback. Это подтверждает размещение мутации и аудита в одной транзакционной границе, но не заменяет проверку на настоящем PostgreSQL.

Точные команды и результаты:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
# PASS: Prisma Client 7.8.0 generated; подключение к БД не выполнялось

npx vitest run --config vitest.config.ts lib/product-archive-audit.test.ts lib/product-overrides-store.test.ts app/api/admin/products/route.test.ts app/api/admin/products/restore/route.test.ts app/api/admin/products/archive/route.test.ts lib/admin-log-store.test.ts
# PASS: 6 files, 94 tests

npm run test:unit
# PASS: 366 files, 3060 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 957 source modules; product-overrides-store.ts = 778 lines

npm run lint
# PASS: 0 errors, 63 pre-existing warnings; изменённые файлы без предупреждений

npm run check:prisma
# PASS: schema valid (фиктивный localhost URL, без подключения)

npm run check:admin-i18n
# PASS: 424 keys, 67 in use; 1 pre-existing hardcoded-Cyrillic candidate

npm run check:encoding
# PASS: 1351 source files

git diff --check
# PASS
```

Изолированная PostgreSQL недоступна: TCP `127.0.0.1:5432` закрыт, Docker daemon отсутствует. Поэтому runtime rollback на PostgreSQL не проверен. Рабочая Neon принципиально не использовалась. Локально integration/e2e/build не запускались; целевые тесты и полный unit-suite прошли, а CI `static-and-unit` дополнительно подтвердил свой integration step.

## Browser checks PR #15/#16

На head `f53ea450…` в GitHub Actions run `42610957972` упали три browser job до запуска самих тестов:

- `accessibility-webkit` — шаг `npx playwright install --with-deps webkit`;
- `chromium-critical-smoke` — шаг `npx playwright install --with-deps chromium`;
- `firefox-smoke` — шаг `npx playwright install --with-deps firefox`.

GitHub API подтверждает job/step и runner label `ubuntu-latest`. Среда `ubuntu26.04-x64` указана в передаче; публичная загрузка raw logs без авторизации вернула `403`, поэтому конкретный текст ошибки образа независимо не подтверждён. Это инфраструктурный сбой установки browser dependencies, а не падение browser assertions. Изменения workflow/CI находятся вне рамок этого PR и не вносились.

На исправленном SHA PR #16 run `42618745522` картина та же: `static-and-unit`, encoding, Mailpit и performance проходят, а `accessibility-webkit`, `chromium-critical-smoke` и `firefox-smoke` отдельно падают до browser assertions. Эти Playwright failures не смешивать с результатом `static-and-unit`; CI-конфигурация намеренно не изменялась.

## Уточнённая карта покрытия

### Постоянный audit в той же транзакции

К ранее покрытым группам добавлены:

- `POST /api/admin/products/restore`;
- `DELETE /api/admin/products/archive`;
- `DELETE /api/admin/products`: single/bulk archive move и фактический override reset.

Для этих путей транзакционная граница и no-op/concurrency поведение подтверждены целевыми unit/route tests. Остальные ранее перечисленные transactional routes в рамках этого PR повторно проверялись только полным unit-suite, а не runtime PostgreSQL.

### Запись после операции или в отдельной транзакции

По коду остаются:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

Это установлено по порядку вызовов в коде; runtime PostgreSQL/SMTP проверка в этом PR не выполнялась.

### Без записи в `AuditLog`

Предыдущий handoff указывал 33 оставшихся handler после PR #15. Перепроверка веток `DELETE /api/admin/products` выявила один пропущенный handler: наличие `appendServerAudit` для POST/PUT в том же route ошибочно маскировало отсутствие аудита в DELETE. Поэтому корректное число после PR #15 было 34. PR #16 закрыл restore и archive purge; этот stacked PR закрывает `DELETE /api/admin/products`. Остаётся **31**:

1. `PATCH /api/admin/access-requests/[id]`
2. `POST /api/admin/backup` (restore configuration)
3. `PUT /api/admin/banner-groups`
4. `PUT /api/admin/banners/[id]`
5. `DELETE /api/admin/banners/[id]`
6. `POST /api/admin/banners/reorder`
7. `POST /api/admin/banners`
8. `DELETE /api/admin/blog/[id]`
9. `POST /api/admin/blog`
10. `POST /api/admin/broadcast`
11. `PUT /api/admin/campaigns/[id]`
12. `DELETE /api/admin/campaigns/[id]`
13. `POST /api/admin/campaigns`
14. `POST /api/admin/card-request`
15. `POST /api/admin/card-rules-campaign`
16. `PATCH /api/admin/contact-messages`
17. `POST /api/admin/content/upload`
18. `PUT /api/admin/dashboard-prefs`
19. `PUT /api/admin/email-templates/[id]`
20. `POST /api/admin/email-templates/[id]/send-test`
21. `POST /api/admin/invitations/card`
22. `POST /api/admin/invitations`
23. `POST /api/admin/invitations/sms`
24. `POST /api/admin/media/replace`
25. `DELETE /api/admin/media`
26. `POST /api/admin/notifications/assets`
27. `PUT /api/admin/price-groups/[id]`
28. `DELETE /api/admin/price-groups/[id]`
29. `POST /api/admin/price-groups`
30. `POST /api/admin/products/[id]/notify-promo`
31. `POST /api/admin/stock-alerts/send`

### Вход/выход администратора

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не пишут постоянный `AuditLog`. При определённых company-настройках они fire-and-forget пишут `CompanyActivityLog`; отдельного постоянного события успешного входа/выхода platform admin нет. Это установлено по коду, production-данные не проверялись.

## Первый следующий шаг для Claude

Следующий PR: price groups (`POST /api/admin/price-groups`, `PUT/DELETE /api/admin/price-groups/[id]`).

1. Проследить общий storage/helper и существующие permission gates для трёх методов.
2. Передать actor/request из server session.
3. Поместить изменение price-group и `appendServerAudit` в одну транзакцию; no-op/repeat не журналировать.
4. Добавить success payload, permission, no-op, rollback и concurrency tests.
5. Если появится изолированная PostgreSQL, повторить rollback на ней; рабочую Neon не использовать.

После price groups: configuration restore; access requests; content assets/CMS; рассылки; hardening post-operation audits (в первую очередь GrinS apply); постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-product-archive-move
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
npx vitest run --config vitest.config.ts lib/product-archive-audit.test.ts lib/product-overrides-store.test.ts app/api/admin/products/route.test.ts app/api/admin/products/restore/route.test.ts app/api/admin/products/archive/route.test.ts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Ожидается чистый checkout. Не подставлять production Neon URL; для PostgreSQL integration/e2e сначала предоставить отдельную локальную или preview DB.
