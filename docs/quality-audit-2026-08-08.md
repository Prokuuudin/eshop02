# Аудит эксплуатационной готовности — 2026-08-08

Проверены accessibility, нагрузочные риски, disaster recovery, мобильный checkout и production-наблюдаемость. Проверки выполнялись локально и против тестовой БД; разрушительные операции и production-нагрузка не выполнялись.

## Итог

| Направление | Статус | Главный вывод |
|---|---|---|
| Accessibility | требует доработки | Базовая семантика есть, но часть самописных модальных окон и ошибок форм не соответствовала ожидаемому keyboard/screen-reader поведению |
| Каталог и поиск | высокий риск под нагрузкой | `/api/products` без `skip/take` загружает весь объединённый каталог; обязательного pagination-контракта нет |
| Checkout | Android пройден, Safari не подтверждён | Оба Pixel 7 / Chromium сценария проходят после изоляции тестовых side effects; WebKit runner в текущей Windows-среде зависает |
| ERP sync | логически устойчив, не измерен | Есть lock, batch=200, retry и безопасный отказ от деактивации при ошибках; нет performance budget и алерта |
| Disaster recovery | не готово | PostgreSQL backup/PITR и проверяемого restore-runbook в репозитории нет; UI экспортирует только конфигурацию |
| Observability | частично | Есть health, Web Vitals и структурированные sync-логи; доставки алертов и SLO нет |

## Выполненные проверки

- `npm run typecheck` — успешно.
- `npm run test:unit` — 111 файлов, 801 тест, все успешно.
- Playwright `critical-flows.spec.ts`, Pixel 7 / mobile Chromium, checkout — bank и card flow успешно. WebKit 26 установлен; iPhone 15 прогон не завершился за общий лимит 180 секунд и не может считаться пройденным.
- Статическая проверка checkout, общих Dialog-компонентов, самописных модальных окон, API каталога/поиска, ERP runner, health/telemetry и backup API.
- Проверка конфигурации браузеров показала отсутствие WebKit/Safari-профиля; профиль iPhone 15 / WebKit добавлен.

## P0 — до production

1. Подтвердить checkout на реальном Safari/iOS runner. Найденный `NaN` создавался E2E-фикстурой: она запрашивала каталог без серверной сессии, получала намеренно скрытую цену и вручную клала такой объект в корзину. Фикстура исправлена; Android-сценарии проходят.
2. Настроить настоящий backup PostgreSQL у провайдера: ежедневный backup, PITR, отдельное хранение, retention и шифрование. Зафиксировать RPO/RTO.
3. Выполнить restore drill в отдельную временную БД: восстановить backup, применить read-only smoke queries, сверить количество `Product`, `User`, `Order`, `Invoice`, `Payment` и последний `SyncRun`, затем удалить временную БД. Текущий `/api/admin/backup` для этого непригоден; POST restore намеренно возвращает 405.
4. Подключить доставку production-алертов. Одних `console.error` недостаточно.

## P1

### Accessibility

- Перевести оставшиеся самописные модалы на Radix Dialog. Найденный `OrderInvoiceModal` не имел `role=dialog`, focus trap, Escape handling и возврата фокуса; исправлен.
- Прогнать WCAG contrast scanner в светлой и тёмной теме. В проекте нет автоматического contrast engine, поэтому контраст нельзя считать доказанным одним ESLint.
- Добавить axe-core в Playwright CI для homepage, catalog, product, cart, checkout и основных admin dialogs.
- Проверить zoom 200/400%, reduced motion и порядок tab-navigation вручную.
- Поля checkout получили явные `htmlFor/id`, ошибки — `role=alert` и `aria-describedby`.

### Нагрузка

Локальный non-destructive smoke (`20` запросов, concurrency `5`, dev server):

| Сценарий | p50 | p95 | p99 | req/s | Ошибки |
|---|---:|---:|---:|---:|---:|
| catalog page | 334 ms | 941 ms | 1018 ms | 9.86 | 0 |
| search | 826 ms | 1639 ms | 1640 ms | 4.96 | 0 |
| health | 205 ms | 2029 ms | 2031 ms | 7.57 | 0 |

Это smoke локального dev-окружения, а не production capacity test. Поиск и хвост health уже показывают необходимость отдельного production-like теста и индексов/профилирования. Воспроизводимый runner добавлен как `npm run test:load:smoke`; параметры задаются `LOAD_BASE_URL`, `LOAD_CONCURRENCY`, `LOAD_REQUESTS`.

- Сделать pagination обязательным для `/api/products`; ветка без `skip/take` возвращает весь каталог и выполняет merge в памяти.
- Для поиска зафиксировать p95/p99. Сейчас есть `take <= 50` и rate limit 30/min/IP, но similarity вычисляется по объединённой строке; нужен подтверждённый trigram/GiST или GIN индекс и `EXPLAIN ANALYZE` на production-like объёме.
- Для checkout измерять отдельно создание заказа и создание Stripe session; POST-нагрузку выполнять только в изолированной БД и с тестовым Stripe.
- Для ERP проверить 1x/5x/10x объём feed, peak memory, длительность batch, блокировку второго runner и восстановление после сетевого обрыва. Текущие unit-тесты подтверждают алгоритм, не пропускную способность.

### Observability

Минимальные алерты:

| Сигнал | Условие |
|---|---|
| Checkout/API | 5xx > 2% за 5 минут или p95 > 2 с |
| Stripe webhook | любой signature/amount mismatch; 3 ошибки за 5 минут; backlog pending > 15 минут |
| Платежи | paid в Stripe без paid order > 5 минут |
| ERP | failed run; running > 30 минут; sync не запускался > 2 расписаний; резкое изменение deactivated |
| SMTP | 3 ошибки за 10 минут; очередь/повторные попытки исчерпаны |
| DB | `/api/health` возвращает 503 или latency превышает порог |
| Frontend | рост client-error и ухудшение LCP/INP/CLS |

Health endpoint изменён: при недоступной БД теперь возвращает 503, пишет структурированное событие `health_db_failed` и не раскрывает текст ошибки клиенту. Это позволяет обычному uptime-monitor поднять алерт.

## Изменения в рамках аудита

- Исправлена идемпотентность E2E fixture setup: конфликт теперь обрабатывается по первичному `User.id`.
- Добавлен Playwright-проект `mobile-webkit` (iPhone 15) для Safari-совместимости.
- `OrderInvoiceModal` переведён на доступный Dialog primitive.
- Улучшены label/error associations checkout.
- DB degradation health check теперь имеет корректный HTTP 503.

## Критерии закрытия

- Checkout E2E проходит в desktop Chromium, Pixel 7 Chromium и iPhone 15 WebKit.
- Axe не находит serious/critical нарушений на критических страницах; ручная клавиатурная проверка пройдена.
- Нагрузочный отчёт содержит throughput, p50/p95/p99, error rate и peak memory на согласованном объёме.
- Restore drill документирован фактическим временем восстановления и проверкой целостности.
- Тестовый alert от health, Stripe, ERP и SMTP доходит до ответственного канала и имеет runbook.
