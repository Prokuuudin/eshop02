# Hairshop Pro: аудит контента и ручной оплаты — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и границы

- Ветка: `fix/2026-11-09-admin-audit-content-payment`.
- База ветки: `a4cecbb34f37ef3653b44f190882b8300ae21e94` (`release/2026-11-08-prefetch-catalog`).
- Коммит реализации: `d0bc0ccb79962e9bad53f7bf186b55ea52bddcb9`.
- Draft PR: https://github.com/Prokuuudin/eshop02/pull/15 (base: `release/2026-11-08-prefetch-catalog`).
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Почему выбрана эта база

Перед началом выполнен `git fetch origin main --prune`. Актуальный на момент работы `origin/main`:

`dd3cec15e4c0c858352321451c7962aa01968b9c` (2026-11-06, merge PR #12).

Release-SHA `a4cecbb3` (2026-11-08) и `origin/main` разошлись после общего предка `c65f4501`. Для целевых путей сравнение показало:

- `app/api/admin/content/route.ts`, `lib/site-content-server-store.ts`, `app/api/orders/[id]/route.ts` и `app/[lang]/admin/orders/OrderListItem.tsx` совпадают;
- `lib/orders-data-store.ts` в release-линии отличается от `origin/main` и содержит более новые проверки/исправления владения заказом и оплаты.

Поэтому взят ровно ранее проверенный SHA `a4cecbb3`: он сохраняет воспроизводимость предыдущей сверки и не откатывает более новые защитные изменения заказа. Фактический SHA в Plesk по-прежнему не подтверждён; это установлено только по Git, не по production.

Команда сравнения:

```powershell
git diff --name-status dd3cec15e4c0c858352321451c7962aa01968b9c..a4cecbb34f37ef3653b44f190882b8300ae21e94 -- app/api/admin/content/route.ts lib/site-content-server-store.ts 'app/api/orders/[id]/route.ts' lib/orders-data-store.ts 'app/[lang]/admin/orders/OrderListItem.tsx'
```

Результат: изменён только `lib/orders-data-store.ts` (`10` строк: `7` добавлено, `3` удалено).

## Что реализовано

### `PUT /api/admin/content`

- `requireAdmin()` по-прежнему выполняется до чтения payload; actor берётся из авторизованной серверной сессии.
- `saveSiteContentOverridesToStore` теперь в одной Prisma-транзакции:
  1. сериализует конкурентные сохранения отдельным advisory lock;
  2. читает текущее значение;
  3. вычисляет фактический diff;
  4. сохраняет `KeyValueSetting`;
  5. вызывает существующий `appendServerAudit`.
- Action: `site_content.updated`, entity: `setting/site-content`.
- В `before`/`after` записываются только изменившиеся элементы. Для текста каждый элемент содержит `language`, `key`, `value`; для изображения — `key`, `value`. Удалённое/отсутствующее значение представлено `null`.
- При no-op нет ни upsert, ни события.
- Ошибка audit append откатывает изменение контента.
- `revalidatePath('/', '/blog', '/catalog')` вызывается route только после успешного возврата транзакции.

### `PATCH /api/orders/[id]` — ручное подтверждение оплаты

- Существующая проверка `requireAdmin()` сохранена; actor и `NextRequest` передаются в `updateServerOrderPayment` отдельным необязательным audit context.
- Общая функция по-прежнему обслуживает Paysera/PayPal callbacks, повтор оплаты, checkout reconciliation и служебные вызовы. Они audit context не передают, поэтому не маскируются под действие сотрудника.
- В существующей транзакции заказа после фактического изменения вызывается `appendServerAudit`.
- Action: `order.payment_status_updated`, entity: `order/<orderId>`.
- `before`/`after`: `paymentStatus` и `paymentProvider`; ID заказа находится в `entityId`.
- Терминальный повтор для уже оплаченного заказа остаётся idempotent и не создаёт второй audit event.
- Ошибка audit append откатывает изменение оплаты и связанные изменения резерва.

### Названия в журнале

| Action | RU | LV | EN |
|---|---|---|---|
| `site_content.updated` | Обновление контента сайта | Vietnes saturs atjaunināts | Site content updated |
| `order.payment_status_updated` | Ручное изменение статуса оплаты | Maksājuma statuss mainīts manuāli | Payment status updated manually |

## Затронутые пути

- `app/api/admin/content/route.ts`
- `app/api/admin/content/route.test.ts`
- `app/api/orders/[id]/route.ts`
- `app/api/orders/[id]/route.test.ts`
- `lib/site-content-server-store.ts`
- `lib/site-content-server-store.test.ts`
- `lib/orders-data-store.ts`
- `lib/order-payment-audit.test.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Подтверждено тестами:

- успешное сохранение контента и точный payload события;
- no-op контента без upsert/audit;
- rollback контента при ошибке `appendServerAudit`;
- отказ контента без admin permission;
- cache revalidation только после успешного transactional save;
- успешная ручная оплата с actor из route и точным статус/provider transition;
- повторная ручная оплата без второго события;
- rollback оплаты при ошибке audit append;
- отказ оплаты без admin permission;
- автоматические PayPal/Paysera и поздние/повторные callbacks сохраняют прежнее поведение и не получают admin audit context;
- RU/LV/EN названия обоих actions.

Точные команды и результаты:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
# PASS: Prisma Client 7.8.0 generated; соединение с БД не выполнялось

npx vitest run --config vitest.config.ts lib/site-content-server-store.test.ts app/api/admin/content/route.test.ts lib/order-payment-audit.test.ts 'app/api/orders/[id]/route.test.ts' lib/admin-log-store.test.ts
# PASS: 5 files, 19 tests

npx vitest run --config vitest.config.ts lib/delivery-production-regressions.test.ts lib/orders-late-payment.test.ts app/api/webhooks/paysera/route.test.ts app/api/webhooks/paypal/route.test.ts lib/orders-data-store.test.ts
# PASS: 5 files, 94 tests

npm run test:unit
# PASS: 365 files, 3036 tests

npm run typecheck
# PASS

npm run lint
# PASS with 63 pre-existing warnings, 0 errors; изменённые файлы без предупреждений

npm run check:admin-i18n
# PASS: 424 dictionary keys, 67 keys in use; 1 pre-existing hardcoded-Cyrillic candidate

git diff --check
# PASS
```

Коммит-hook также выполнил `npm run check:encoding`: PASS, 1348 source files.

Production build запускался только с фиктивными localhost-переменными и без рабочей БД:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3000'
npm run build
```

Webpack compilation и TypeScript завершились успешно; сборка остановилась на page-data для `/[lang]/brand/[id]` с ожидаемым `P1001` (`127.0.0.1:5432` недоступен). Полная build/page-data, integration и e2e не подтверждены: изолированная тестовая PostgreSQL не была предоставлена, а рабочую Neon использовать запрещено. Предупреждения сборки о Swiper nested CSS и ambiguous Tailwind durations существовали до этого изменения.

## Карта покрытия аудита

Методика: учитывались обработчики `POST/PUT/PATCH/DELETE` под `app/api/admin`, которые меняют состояние или отправляют сообщение. Read-only preview (`import/preview`, `grins-import/stocks-preview`, `promo-products-preview`) и намеренно запрещённые `POST/DELETE /api/admin/audit-log` (оба `405`) не считались.

### Постоянный server audit в одной транзакции

По коду mutation и `appendServerAudit` находятся в одной Prisma-транзакции (напрямую либо через server helper) у следующих групп:

- новые `PUT /api/admin/content` и ручной `PATCH /api/orders/[id]` (вне `/api/admin`);
- bonus/locale/shipping/brands/categories config;
- brand lines (create/update/membership/review через `lib/brand-lines/brand-line-admin.ts`);
- admin users, role approvals, MFA reset, bonus ledger;
- orders create/update/delete, metadata/bulk metadata, shipment, stock acknowledgment, late-payment exception, notification retry;
- product create/update/soft-delete, manual-price approval, restore-previous, image crop, price-batch revert;
- promo-code create/update/delete;
- review reply/status/delete;
- company activity-log retention delete.

Это установлено по коду; для нового контента/оплаты, ряда order/product/user routes и brand-lines транзакционность также покрыта unit/route tests. Полный runtime-аудит всех перечисленных старых routes в БД не выполнялся.

### Постоянная запись, но после операции / отдельной транзакцией

- `POST /api/admin/grins-import/apply`: сначала `applyManualImport`, затем отдельная транзакция `appendServerAudit`; ошибка аудита ловится и не откатывает уже применённый импорт. Это важный открытый риск.
- `POST /api/admin/import`: `catalog.import_started` пишется до цикла, `catalog.import_completed` — после; сами product operations выполняются между ними отдельными вызовами.
- `POST /api/admin/notifications/send`: app/email delivery выполняется до отдельной audit-транзакции.
- `POST /api/admin/orders/send-invoice` и `POST /api/admin/returns/notify`: email отправляется до audit-транзакции.
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit-транзакции.
- `POST /api/admin/grins-import/preview`: preview read-only, событие пишется после вычисления preview.

Эта классификация установлена по порядку вызовов в коде; транзакционный rollback внешней отправки принципиально невозможен.

### Без записи в `AuditLog`

На выбранной базе `a4cecbb3` подтверждены прежние **34 handler’а**. После этого PR `PUT /api/admin/content` закрыт, остаётся **33**:

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
31. `DELETE /api/admin/products/archive` (permanent purge)
32. `POST /api/admin/products/restore`
33. `POST /api/admin/stock-alerts/send`

Важно: обычный soft-delete товара через `DELETE /api/admin/products` уже имеет транзакционный audit. Пробелы — восстановление и permanent archive purge.

### Вход и выход администратора

`POST /api/auth/login` и `POST /api/auth/logout` не пишут в постоянный `AuditLog`. Они fire-and-forget пишут `CompanyActivityLog` только при `user.companyId && user.auditLoggingEnabled`. Admin MFA flow возвращает challenge до обычной login-записи; отдельного постоянного события успешного входа platform admin по коду нет. Это установлено по коду, production-данные не проверялись.

## Следующие PR

Рекомендуемый следующий небольшой PR: **восстановление и окончательное удаление товаров**.

Конкретный первый шаг:

1. Открыть `lib/product-overrides-store.ts`, функции `restoreDeletedProduct` и `purgeDeletedProductArchive`.
2. Передать туда `actor` и `NextRequest` из `app/api/admin/products/restore/route.ts` и `app/api/admin/products/archive/route.ts`.
3. Поместить изменение Product/archive и `appendServerAudit` в одну Prisma-транзакцию; no-op/not-found не журналировать.
4. Добавить route/store tests: success payload, repeat/no-op, audit failure rollback, permission denial.

Следующие очереди после этого:

1. price groups (`POST`, `PUT`, `DELETE`);
2. configuration restore (`POST /api/admin/backup`; файловая операция потребует отдельного проекта atomic journal/compensation, Prisma-транзакции недостаточно);
3. access requests (`PATCH`, включая user/request/certificate и последующую email-отправку);
4. content assets и CMS: upload, banners, blog, campaigns, email templates, media;
5. рассылки/отправки: broadcast, stock alerts, invitations/card/SMS, promo notification, test email;
6. отдельный hardening PR для post-operation audits, в первую очередь GrinS apply;
7. постоянный аудит успешного входа/выхода platform admin.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-content-payment
git status --short
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npm run prisma:generate
npm run test:unit
npm run typecheck
```

Ожидается чистый worktree. Для integration/e2e/build page-data сначала предоставить отдельную локальную/preview PostgreSQL; не подставлять production Neon URL.
