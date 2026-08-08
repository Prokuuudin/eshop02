# Production runbooks

## Alert routing

Настройте log drain/monitor на JSON-поле `event`; `alert: true` означает событие для немедленной доставки в дежурный канал. Correlation ID возвращается клиенту заголовком `x-correlation-id`.

| Event | Реакция |
|---|---|
| `health_db_failed` | Проверить статус PostgreSQL, connection limits и latency; не перезапускать миграции вслепую |
| `stripe_webhook_failed` | Проверить Stripe delivery и подпись, затем безопасно повторить событие из Stripe Dashboard |
| `stripe_webhook_amount_mismatch` | Не помечать заказ оплаченным; сверить сумму Order и Stripe session |
| `stripe_payment_failed` | Проверить статус сессии и reservation expiry; связаться с клиентом только после сверки |
| `order_create_failed` | Найти запрос и связанные события по `correlationId`, проверить stock/promo/DB |
| `erp_sync_failed` | Проверить последний SyncRun; не запускать конкурентный sync и не деактивировать товары вручную |
| `smtp_send_failed` | Проверить SMTP provider и credentials; повторить только идемпотентное письмо |

Рекомендуемые пороги: API 5xx >2%/5m; p95 >2s/10m; DB health 503 сразу; ERP failed или нет успешного run более двух расписаний; SMTP ≥3 failures/10m; Stripe webhook failure сразу.

## PostgreSQL restore drill

1. Зафиксировать у провайдера PITR, retention, регион и шифрование; целевые RPO ≤24h, RTO ≤4h.
2. Создать из backup/PITR отдельную временную БД, никогда не восстанавливать поверх production.
3. Задать только `RESTORE_DATABASE_URL` и выполнить `npm run test:restore`.
4. Сверить counts с production snapshot, выборочно открыть последние Order/Payment/Invoice и проверить последний SyncRun.
5. Записать фактические RPO/RTO, удалить временную БД средствами провайдера.

Скрипт проверки read-only и отказывается работать, если restore URL совпадает с `DATABASE_URL`.
