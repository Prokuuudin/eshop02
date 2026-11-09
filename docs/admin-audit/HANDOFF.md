# Hairshop Pro: аудит восстановления и окончательного удаления товаров — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и границы

- Ветка: `fix/2026-11-09-admin-audit-product-archive`.
- Stacked base: `f53ea450753e1f2017d20a43701f1da1f20d85e9`, проверенный head открытого Draft PR #15 (`fix/2026-11-09-admin-audit-content-payment`).
- Коммит реализации: `b0b5d5bb6bb520e958ae5f6bb9d4f94ec2c8f110`.
- Новый Draft PR должен иметь base `fix/2026-11-09-admin-audit-content-payment`, чтобы его diff содержал только работу с архивом товаров.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

PR #15 был проверен через публичный GitHub API до создания ветки: `state=open`, `draft=true`, `merged=false`, head точно `f53ea450753e1f2017d20a43701f1da1f20d85e9`. Поэтому ветка создана от этого SHA, а не от `main` или release-ветки.

## Реализовано

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
| `DELETE /api/admin/products`, одиночный, `permanently=true` | Перенос в архив; base получает `isDeleted=true`, custom удаляется из Product, но остаётся восстановимый snapshot | Нет записи; следующий пробел |
| `DELETE /api/admin/products`, `ids[]` | Массовый перенос в архив по тем же правилам | Нет записи; следующий пробел |
| `DELETE /api/admin/products`, одиночный без `permanently=true` | Сброс записи из `product-overrides`, товар не удаляется | Нет записи; следующий пробел |
| `deleteCustomProduct` | Физическое удаление custom Product без архива | Не имеет серверных вызывающих в выбранной базе; не считается API-path |

Поле `permanently` в `DELETE /api/admin/products` вводит в заблуждение: фактический пользовательский результат — «переместить в корзину/архив». Этот PR намеренно не переименовывает контракт и не добавляет туда аудит, чтобы diff оставался посвящён восстановлению и окончательному purge.

## Затронутые пути

- `app/api/admin/products/archive/route.ts`
- `app/api/admin/products/archive/route.test.ts`
- `app/api/admin/products/restore/route.ts`
- `app/api/admin/products/restore/route.test.ts`
- `hooks/admin/products/useProductsAdmin.ts`
- `lib/product-overrides-store.ts`
- `lib/product-overrides-store.test.ts`
- `lib/product-archive-audit.test.ts`
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

Stateful rollback-тест создаёт staged-копию Product/KV/AuditLog и коммитит её только после успешного завершения transaction callback. Это подтверждает размещение мутации и аудита в одной транзакционной границе, но не заменяет проверку на настоящем PostgreSQL.

Точные команды и результаты:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
# PASS: Prisma Client 7.8.0 generated; подключение к БД не выполнялось

npx vitest run --config vitest.config.ts lib/product-archive-audit.test.ts lib/product-overrides-store.test.ts app/api/admin/products/restore/route.test.ts app/api/admin/products/archive/route.test.ts lib/admin-log-store.test.ts
# PASS: 5 files, 76 tests

npm run test:unit
# PASS: 366 files, 3047 tests

npm run typecheck
# PASS

npm run lint
# PASS: 0 errors, 63 pre-existing warnings; изменённые файлы без предупреждений

npm run check:prisma
# PASS: schema valid (фиктивный localhost URL, без подключения)

npm run check:admin-i18n
# PASS: 424 keys, 67 in use; 1 pre-existing hardcoded-Cyrillic candidate

npm run check:encoding
# PASS: 1349 source files

git diff --check
# PASS
```

Изолированная PostgreSQL недоступна: TCP `127.0.0.1:5432` закрыт, Docker daemon отсутствует. Поэтому runtime rollback на PostgreSQL не проверен. Рабочая Neon принципиально не использовалась. Integration/e2e/build также не запускались: для них нет изолированной БД, а целевые route/store/unit проверки и полный unit-suite прошли.

## Browser checks PR #15

На head `f53ea450…` в GitHub Actions run `42610957972` упали три browser job до запуска самих тестов:

- `accessibility-webkit` — шаг `npx playwright install --with-deps webkit`;
- `chromium-critical-smoke` — шаг `npx playwright install --with-deps chromium`;
- `firefox-smoke` — шаг `npx playwright install --with-deps firefox`.

GitHub API подтверждает job/step и runner label `ubuntu-latest`. Среда `ubuntu26.04-x64` указана в передаче; публичная загрузка raw logs без авторизации вернула `403`, поэтому конкретный текст ошибки образа независимо не подтверждён. Это инфраструктурный сбой установки browser dependencies, а не падение browser assertions. Изменения workflow/CI находятся вне рамок этого PR и не вносились.

## Уточнённая карта покрытия

### Постоянный audit в той же транзакции

К ранее покрытым группам добавлены:

- `POST /api/admin/products/restore`;
- `DELETE /api/admin/products/archive`.

Для этих двух путей транзакционная граница и no-op/concurrency поведение подтверждены целевыми unit/route tests. Остальные ранее перечисленные transactional routes в рамках этого PR повторно проверялись только полным unit-suite, а не runtime PostgreSQL.

### Запись после операции или в отдельной транзакции

По коду остаются:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

Это установлено по порядку вызовов в коде; runtime PostgreSQL/SMTP проверка в этом PR не выполнялась.

### Без записи в `AuditLog`

Предыдущий handoff указывал 33 оставшихся handler после PR #15. Перепроверка веток `DELETE /api/admin/products` выявила один пропущенный handler: наличие `appendServerAudit` для POST/PUT в том же route ошибочно маскировало отсутствие аудита в DELETE. Поэтому корректное число после PR #15 было 34. Этот PR закрывает restore и archive purge; остаётся **32**:

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
31. `DELETE /api/admin/products` (single/bulk archive move и override reset)
32. `POST /api/admin/stock-alerts/send`

### Вход/выход администратора

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не пишут постоянный `AuditLog`. При определённых company-настройках они fire-and-forget пишут `CompanyActivityLog`; отдельного постоянного события успешного входа/выхода platform admin нет. Это установлено по коду, production-данные не проверялись.

## Первый следующий шаг для Claude

Следующий PR: закрыть оставшиеся ветки `DELETE /api/admin/products` без изменения их контракта.

1. Начать с `app/api/admin/products/route.ts: DELETE`, `deleteProductAny`, `deleteProductsAny` и `resetProductOverride` в `lib/product-overrides-store.ts`.
2. Передать actor/request из существующего `requireAdminPermission('catalog.update')`.
3. Для single/bulk archive move повторно читать Product после получения archive advisory lock, чтобы конкурентный повтор не создавал phantom archive/audit event.
4. Поместить Product/KV mutation и audit в одну транзакцию; для bulk создать audit только для реально изменённых ID и использовать общий request ID.
5. Отдельным action журналировать reset override только при наличии фактического override.
6. Добавить stateful rollback/concurrency tests и, если появится изолированная PostgreSQL, повторить rollback на ней.

После product DELETE следующая приоритетная очередь: price groups; configuration restore; access requests; content assets/CMS; рассылки; hardening post-operation audits (в первую очередь GrinS apply); постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-product-archive
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
npx vitest run --config vitest.config.ts lib/product-archive-audit.test.ts lib/product-overrides-store.test.ts app/api/admin/products/restore/route.test.ts app/api/admin/products/archive/route.test.ts lib/admin-log-store.test.ts
npm run typecheck
```

Ожидается чистый checkout. Не подставлять production Neon URL; для PostgreSQL integration/e2e сначала предоставить отдельную локальную или preview DB.
