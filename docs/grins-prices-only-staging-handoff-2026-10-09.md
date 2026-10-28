# GrinS prices-only: OB1/L1/L2 handoff, 9 октября 2026

Исходный commit: `41923c0974caa701049795fc2ad85d5636c4f0e1`, release/grins-manual-import, рабочая копия `.backups/grins-safety-release`. Кандидат — отдельный локальный commit, содержащий этот документ; точный SHA взять из итогового сообщения/`git rev-parse HEAD`. Прочитан и сохранён без изменений `grins-prices-only-claude-review-2026-10-09.md` (APPROVED WITH BLOCKERS).

**Вердикт: READY FOR INDEPENDENT REVIEW.** Новый кандидат ещё не проверен Claude. Нет production readiness. Production-дедлайн 20 октября 2026, Europe/Riga. Main/MFA WIP сохранён. Push, merge, deploy, миграции, Neon и изменения реальных staging/production БД не выполнялись; реальных XML/заказов не создавалось. Все SQL writes — только synthetic PGlite.

## Принятый scope

Prices-only не меняется. Apply/restore SQL, shared lease, ценовой fingerprint preview, backup v3, mode-aware SHA, prices/stock/ERP invariants не изменены. Gate не распространён на returns, releases, cancel/admin edits или другие existing-order/product writers. Владелец принимает M1 на первый запуск только при доказанной процедуре закрытого окна без этих writers; процедура: [staging/production preparation](grins-prices-only-staging-production-preparation-2026-10-09.md).

## OB1 — реализованная подготовка, без runtime auto-open

`initializeGrinsCheckoutState` выполняет один параметризованный INSERT false ON CONFLICT DO NOTHING и строгое чтение boolean после него. Existing true/false/extra fields/timestamp не изменяются; malformed state не «лечится» заменой; concurrent callers защищены unique key. `readGrinsCheckoutState` возвращает missing отдельно от false. Runtime при missing/неизвестном формате по-прежнему закрыт; initializer не вызывается из checkout, API, startup, build или npm lifecycle.

Новая установка имеет обязательный release gate: отдельная approved init-if-missing и read-only check до включения/перезапуска новых workers. Нельзя завершить подготовку с missing; это NO-GO для переключения, сохраняя прежний artifact. Это минимальное решение OB1, выбранное вместо небезопасного автоматического открытия отсутствующей записи. Если оператор пропустит обязательную preparation, runtime всё ещё вернёт 503 — такая выкладка не допущена процедурой.

CLI `prepare-grins-checkout-state.ts` по умолчанию читает; перед import Prisma требует target staging/production, approved expected host/database и expected open/closed. Process DATABASE_URL обязателен, dotenv не читается, URL/драйверные ошибки не печатаются. Write требует одновременно --initialize, --expect-state open, --confirm-initial-state open. Это отдельное явное операторское действие, не deployment hook. Существующее true сохраняется и при ожидании open приводит к exit 1; для намеренного закрытого окна допустим только check expecting closed. Инициализация не используется для окончания maintenance/unknown incident. Host/db берутся из доверенной записи среды, не выводятся из случайного shell URL как «ожидаемые».

## L1 — реальный Prisma mock

Customer route непосредственно импортирует prisma. В app/api/orders/route.test.ts добавлен vi.mock('@/lib/prisma'); unexpected raw DB access специально отвергается mock-ошибкой. Existing fakeTx/price/reserve/payment assertions не удалены и не ослаблены. Проверки выполнены с удалёнными DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL и POSTGRES_URL_NON_POOLING: suite больше не требует даже фиктивного endpoint.

## L2 — понятный customer message

Client API сохраняет checkout_maintenance как отдельную failure reason. UI использует локализованный текст RU/LV/EN «Оформление временно недоступно, корзина сохранена, попробуйте позже». Нет автоматического retry, создания локального Order или изменения stock/payment logic. Выделенный resolver сохраняет прежние сообщения остальных ошибок. Поведение cart/success/Turnstile осталось прежним.

## Файлы кандидата

| Файл | Изменение |
|---|---|
| lib/grins-checkout-preparation.ts | Explicit idempotent initialization и strict read-state |
| lib/grins-checkout-preparation.test.ts | Missing/closed/malformed contract |
| scripts/prepare-grins-checkout-state.ts | Checked operator CLI, read-only default, identity/state confirmations |
| scripts/prepare-grins-checkout-state.test.ts | Actual child CLI refusals before DB import/connection |
| scripts/verify-grins-prices-pglite.ts | Real-SQL init/repeat/closed/concurrent tests + все прежние prices-only checks |
| app/api/orders/route.test.ts | Prisma mock, отказ unexpected DB access |
| app/[lang]/checkout/checkout-order-api.ts | Maintenance reason и message resolver |
| app/[lang]/checkout/checkout-order-api.test.ts | Actual 503 response → RU/LV/EN customer message |
| app/[lang]/checkout/useCheckoutPage.tsx | Использование message resolver без изменения checkout operations |
| data/translations/{ru,en,lv}/checkout.ts | Три customer maintenance translations |
| docs/grins-prices-only-claude-review-2026-10-09.md | Неизменённый исходный review |
| docs/grins-prices-only-staging-production-preparation-2026-10-09.md | Раздельные staging/production steps, окно, emergency и real-PG plan |
| этот handoff | Двусторонний review контекст |

## Проверки

**193/193 unit/API PASS**, 10 relevant suites без любых DB URL aliases; отдельно **3/3 actual CLI rejection tests PASS**. Среди них полный customer order suite и регрессии v1/common order store, price import, rounding, API tampering и shared gate. **44/44 real-SQL PASS** на 15 000 synthetic Product: 7 новых preparation checks плюс прежние 37 prices-only инвариантов. Read-only missing state, actual order отказ при missing, init false, repeat unchanged timestamp, existing true, 8 simultaneous initializer calls → одна строка/один creator; actual orders при open/closed, reserved-stock preservation, release after import, guarded restore, failures/replay/concurrent XML покрыты SQL. PGlite single-backend не доказывает реальные PG waits/starvation/transport. Standalone typecheck и Next typecheck — PASS. Полный lint — PASS, 0 errors/62 исходных warnings. Production build без migrations — PASS, exitCode=0, 615/615 static pages, прежние Tailwind duration warnings. Encoding и diff проходят штатные/strict UTF-8 проверки перед commit.

Evidence в ignored test-results этой worktree: staging-preparation-unit.log, staging-preparation-sql.log, staging-preparation-lint.log, staging-preparation-build.log. Node 22.13.1 Windows, существующие dependencies (Next 16.3.3/Prisma 7.8.0), не hermetic npm ci и не проверка deployed Node 22.23.2. Schema fixture только в новых PGlite; Prisma schema/migrations не менялись. Production build harness имеет очищенный env/loopback DB и вызывает только build-canonical-cwd.mjs → Next build --webpack, не package build с migrate deploy.

## Двусторонняя проверка Claude

Claude начинает с exact candidate diff от 41923c0 и исходного review. Проверить:

1. Нет callsite initializer в HTTP/runtime/lifecycle; missing/malformed остаются closed; init не обновляет existing true/value/timestamp. New-install deploy gate выполнен **до** новых workers, явно согласован initial open. CLI identity/state/consent ошибки происходят до подключения или до write; логи не раскрывают secret exception text.
2. SQL PK/DO NOTHING против одновременно стартовавших init и operator close, результат affected/read; отсутствие auto-repair/force reset. На полноценном PG воспроизвести 8 backends и uncommitted INSERT true/UPDATE true, а не принимать PGlite за lock-wait доказательство.
3. Order tests с действительно отсутствующими DB URL aliases; mock не скрывает бизнес-ошибки. Убедиться, что checkout error resolver сохраняет обычное поведение и localized message достигает toast при реальном JSON503, в том числе через IIS/proxy.
4. M1 закрыт только операционным отсутствием writers: реально паузятся returns/admin/order changes/reserve release/payment callbacks, backlog не теряется. Не разрешать live window по одному bool gate. Цены-only не делают Product-lock совместимым с этих writers.
5. Раздельная авторизация/identity staging и production, цена/stock/Order/ERP diff и controlled order до/после окна, stale cache/quote checks. При unknown outcome открытие заблокировано, initializer не recovery action.

Обратный handoff: Claude пишет новый review с full SHA, verdict, severity, file/line, fixture/command, expected/actual и evidence paths; передаёт Codex. Codex исправляет отдельным local commit, обновляет этот handoff/runbook и возвращает новый SHA/tests. Не менять чужой WIP и не выполнять push/deploy/Neon без отдельного разрешения.

OB2 (полноценный PostgreSQL concurrency/pool/timeouts) остаётся эксплуатационным blocker до production. План — в runbook; здесь не выполнен. M1 — обязательное окно без writers по решению владельца, не объявляется устранённым кодом. Нет миграций и изменения stock synchronization. До нового independent review и staging acceptance production GO отсутствует.
