# B2B Client Guide

## 1. Что доступно B2B клиенту

Платформа поддерживает:

-   корпоративные аккаунты и команды
-   счета и отсрочки оплаты
-   API интеграции
-   webhook уведомления
-   RFQ (Request for Quote)
-   аналитику закупок
-   чат с аккаунт-менеджером

## 2. API интеграции

Базовый путь API:

-   /api/v1/products
-   /api/v1/orders
-   /api/v1/invoices
-   /api/v1/webhooks

Аутентификация:

-   x-api-key: API ключ
-   x-company-id: ID вашей компании (обязательно для company-scoped endpoint)

Пример запроса каталога:

```bash
curl -H "x-api-key: your-api-key" \
  -H "x-company-id: company_123" \
  "https://your-domain/api/v1/products?limit=20"
```

## 3. Webhook уведомления

Поддерживаемые события:

-   order.created
-   order.shipped
-   order.cancelled
-   payment.recorded
-   invoice.issued

Управление webhook endpoint:

-   GET /api/v1/webhooks
-   POST /api/v1/webhooks
-   DELETE /api/v1/webhooks?id=...

Формат подписи:

-   x-webhook-event
-   x-webhook-signature (HMAC-SHA256)
-   x-webhook-delivery-attempt (1..3)

Рекомендации:

-   проверяйте подпись на вашей стороне
-   отвечайте 2xx как можно быстрее
-   тяжелую обработку переносите в фоновые задачи

## 4. Счета и оплаты

Счета доступны в аккаунте и через API:

-   /account/invoices
-   GET /api/v1/invoices
-   GET /api/v1/invoices/:id
-   POST /api/v1/invoices/:id/payments

Стандартный поток:

1. создается заказ
2. по роли клиента формируется счет с dueDate
3. после оплаты фиксируется payment record
4. статус меняется на paid при полном погашении

## 5. RFQ (Запрос спецпредложения)

Клиентская страница:

-   /request-quote

Админ-обработка RFQ:

-   /admin/rfq

Поля запроса:

-   товары и количество
-   комментарий
-   компания

Поля предложения:

-   итоговая сумма
-   срок действия
-   условия оплаты/поставки

## 6. Экспорт каталога

В шапке доступен экспорт каталога:

-   CSV
-   JSON

Экспорт учитывает роль клиента и возвращает role-based цены.

Структура CSV:

-   ID
-   Название
-   Бренд
-   SKU
-   Цена
-   Старая цена
-   Категория
-   Рейтинг
-   В наличии

Структура JSON:

-   generatedAt
-   version
-   role
-   locale
-   totalItems
-   categories

## 7. Чат с аккаунт-менеджером

Функции:

-   окно чата в аккаунте
-   отправка сообщений менеджеру
-   история сообщений компании

API:

-   GET /api/account-manager?companyId=...
-   POST /api/account-manager

## 8. Лучшие практики для интеграции

-   Всегда передавайте x-company-id для B2B endpoint
-   Логируйте request/response и webhook deliveries
-   Используйте retry с backoff на вашей стороне
-   Сверяйте суммы invoice и payment перед финальным подтверждением
-   Для больших заказов используйте RFQ вместо ручных скидок

## 9. Типичные проблемы

401 Unauthorized:

-   не передан x-api-key
-   неверный API ключ

403 Forbidden:

-   роль без API доступа

400 Company context required:

-   не передан x-company-id

Webhook не доставляется:

-   endpoint отвечает не 2xx
-   таймаут или сетевой отказ
-   подпись не валидируется на стороне получателя

## 10. Поддержка

Для B2B технических вопросов:

-   аккаунт-менеджер в личном кабинете
-   чат поддержки в аккаунте
