# План приоритетных проверок HairShop.lv

План основан на риске для денег, остатков, доступа к данным и восстановления. Автоматическая проверка считается выполненной только когда она обязательна в CI; ручная — когда в журнале релиза сохранены дата, исполнитель и результат.

## P0 — блокирует релиз

| Проверка | Критерий приёмки | Реализация |
|---|---|---|
| Гонка за последнюю единицу | Из параллельных заказов проходит один, остаток равен нулю | `tests/integration/stock-transactions.integration.test.ts` |
| Повтор checkout | Один idempotency key создаёт один заказ и не дублирует письма/списания | `app/api/orders/route.test.ts`, уникальный `Order.checkoutKey` |
| Авторитетная цена | Цена, скидка, доставка и бонусы пересчитываются сервером | `lib/server-pricing.test.ts`, API-тесты заказов |
| Повтор оплаты | Оплаченный документ нельзя оплатить или понизить в статусе повторно | тесты payment routes и order store |
| Tenant/RBAC/IDOR | Чужие company/order/invoice/webhook IDs не раскрываются и не изменяются | RBAC E2E, route-тесты; webhook-матрица в `app/api/v1/webhooks/route.test.ts` |
| Базовые quality gates | lint, types, Prisma, security, architecture, unit и integration зелёные | `.github/workflows/quality.yml` |

## P1 — обязательна до production deployment

1. Прогнать Chromium critical flow и Firefox responsive smoke на production build. При отсутствии `DATABASE_URL` CI выводит явное предупреждение; перед production deployment такое предупреждение необходимо считать незавершённой ручной проверкой.
2. На временной PostgreSQL восстановить предыдущий production backup, выполнить `prisma migrate deploy`, затем `npm run test:restore`. Никогда не направлять `RESTORE_DATABASE_URL` на production.
3. Проверить внешние сбои: SMTP timeout, webhook `429/500/timeout`, ERP malformed response и повтор запуска sync. Приёмка: нет дублей, лог содержит correlation ID, retry ограничен.
4. Проверить конкурентное использование последнего promo redemption и bonus balance. Приёмка: счётчики и баланс меняются в одной транзакции и не становятся отрицательными.
5. Проверить migration drift командой `prisma migrate status` против временной копии БД. `prisma validate` выполняется на каждом PR.

## P2 — еженедельно

1. Нагрузочный smoke с бюджетом p95 и нулевой долей ошибок.
2. Проверка sitemap/canonical/hreflang/JSON-LD для RU, LV и EN на deployed preview.
3. Проверка битых ссылок, redirect chains, изображений и страниц 404/500.
4. Проверка публичных ответов на отсутствие B2B-цен, персональных данных и внутренних полей.
5. Отчёт покрытия отдельно для бизнес-логики и API. Общий процент не используется как единственный gate: приоритет — checkout, pricing, stock, auth, bonus и payments.

## P3 — ежемесячно и перед крупным релизом

1. Полная репетиция disaster recovery на чистом окружении: restore → migrate → start → login → старый order/invoice → новый order.
2. Записать фактические RTO/RPO, размер и дату backup, шифрование, retention и ответственного.
3. Проверить ротацию API/SMTP/ERP secrets и отозванные ключи.
4. Dependency audit и ручной просмотр новых `dangerouslySetInnerHTML`, отключений lint и TODO в критичном коде.

## Команды релизной проверки

```bash
npm run check:prisma
npm run lint
npm run typecheck
npm run audit:security
npm run audit:architecture
npm run test
npm run test:e2e:smoke:critical
npm run test:e2e:smoke:firefox
npm run test:load:smoke
```

Для recovery rehearsal дополнительно задаются изолированный `RESTORE_DATABASE_URL` и `DATABASE_URL`, после чего выполняются `prisma migrate deploy` и `npm run test:restore`.
