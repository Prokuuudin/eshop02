STOCK CONCURRENCY P0: FIXED

# Hairshop Pro — stock release race, 6 октября 2026

## Root cause

На starting HEAD `1f306c67eebfefcb5bed78074e1584d0d2d59a0e` повторено исходное real-DB reproduction. Получены available=4 при physical=3 и последующий paid/committed order qty=4 через synthetic signed callback.

```text
Cleanup (A): SELECT expired Order/items qty=2 вне transaction
Admin (B):  BEGIN → Order FOR UPDATE
            qty 2→1; Product stock +1; items qty=1; COMMIT
Cleanup (A): BEGIN → conditional reserved→released
             Product stock +2 из старого JavaScript snapshot; COMMIT

physical=3; available=4; следующий qty=4 получает paid/committed
```

Conditional UPDATE уже блокировал Order, но последующее stock restoration использовало items, прочитанные до этой блокировки. Такой lock не обновляет ранее сохранённый JavaScript object.

## Fix

- Expired scan выбирает только Order IDs, не items.
- `releaseReservation` принимает ID, получает `Order FOR UPDATE` и перечитывает актуальные items внутри той же transaction.
- Conditional transition reserved→released по актуальному status/deadline допускает restoration ровно один раз.
- Stock increment выполняется по перечитанным quantities и коммитится атомарно с reservation transition.
- Failed-payment release использует тот же защищённый helper. Повторное получение собственного Order lock внутри transaction безопасно.
- Product mutations в reserve/release/admin edit/single cancel/reopen/return идут в одинаковом порядке SKU IDs. Bulk cancel получает locks всех затронутых Product IDs в этом порядке до mutations/audit.
- Новых глобальных table locks нет. Existing audit advisory lock не менялся.

При READ COMMITTED `FOR UPDATE` ждёт конкурентного writer и блокирует актуальную версию строки; следующий SELECT после получения lock видит committed edit. Это соответствует [PostgreSQL transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html). Одинаковый порядок row locks уменьшает deadlock risk согласно [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).

## Audit аналогичных путей

| Путь | Authoritative quantity/state | Результат |
|---|---|---|
| Create/reserve (`createServerOrder`) | Создаваемый order + guarded Product decrement в одной transaction | Snapshot не может быть изменён другим writer до commit; SKU locks упорядочены |
| Expiry cleanup | Ранее items из scan вне transaction | Исправлен: ID → lock → reread → conditional release |
| Failed/canceled payment | Order read под lock в payment transaction | Теперь дополнительно использует общий release helper по ID |
| Paid commit | Order lock, current session/amount, conditional reserved→committed | Idempotent; paid terminal сохранён |
| Admin quantity edit | Current Order/items после Order lock | Delta oldQty→newQty в той же transaction; SKU order выровнен |
| Single cancel/reopen | Order/items после Order lock | Quantity защищена; current released/paid checks сохранены |
| Bulk cancel | Все Order locks в stable order, затем current items | Product locks упорядочены для всего batch до audit |
| Retry payment | Read для eligibility, повторный authoritative read под Order lock при minting | Старый items snapshot для stock mutation не используется; re-reserve отсутствует |
| Customer returns restore | Immutable ReturnRequest items; API не допускает items edits | Conditional approved/refunded restore сохранён; SKU order выровнен |
| `createOrUpdateServerOrder` | Legacy exported upsert | Активных callers не найдено; не является текущим API stock flow и не расширялся |

ERP/warehouse/manual catalog stock changes находятся вне проверяемого conservation scenario. Unrelated return-state/business-policy changes не выполнялись.

## Original reproduction: before / after

| Состояние | До fix | После fix |
|---|---:|---:|
| Physical initial | 3 | 3 |
| A qty=2: available/reserved | 1 / 2 | 1 / 2 |
| Admin qty 2→1: available/reserved | 2 / 1 | 2 / 1 |
| Cleanup: available | **4** | **3** |
| Последующий qty=4 | Accepted, paid/committed | **InsufficientStockError**, transaction rollback |
| Последующий qty=3 | Не является доказательством отсутствия phantom stock | Accepted, paid/committed; available=0, committed=3 |

После release старый order остаётся released с последними items qty=1. Эта released quantity уже включена в available, поэтому не добавляется повторно в conservation sum.

## Concurrency matrix

| Scenario | Iterations | Result | Final invariant |
|---|---:|---|---|
| A: reserve + cleanup | 30 | PASS; повторный sweep обрабатывает невидимый до commit новый order | available+reserved+committed=3 |
| B: admin decrease 2→1 + cleanup | **100** | PASS; actual Product/Order lock waits, **0 phantom iterations** | final available=3, released qty=1 |
| C: admin increase 1→3 + cleanup | 30 | PASS | physical=4, final available=4 |
| D: cleanup + expired signed callback | 30 | PASS; callback rejected | available=3; paid/released не появляется |
| E: admin edit + current callback | 30 | PASS; **15 edit wins, 15 callback wins** | Сессия инвалидируется либо paid edit rejected; conservation=3 |
| F: cancel + cleanup | 30 | PASS | Reservation возвращается один раз; available=3 |
| G: duplicate cleanup, 4 workers | 30 | PASS; сумма release counts=1 | available=3 |
| H: duplicate callbacks, 4 workers; cancel after paid | 30 | PASS | available=1, committed=2, paid terminal |
| I: cleanup + expired retry | 30 | PASS; retry HTTP 409 | available=3; новая session не выдаётся |
| Last unit: two concurrent orders | 30 | PASS; один reserve, один rejection | available=0, committed=1 |
| Reverse SKU order; bulk cancel + cleanup | 20 | PASS, deadlocks не наблюдались | 2 SKUs × physical 2; final available=4 |
| Insufficient increase rollback | 10 | PASS; qty остаётся 1 | После cleanup available=3 |

**Всего 400 concurrent iterations.** Отдельный ownership test подтвердил промежуточные available/reserved/committed/released values после reserve, edit и release.

## PostgreSQL evidence

- Новый отдельный database `hairshop_stock_race_20261006` в временном standalone PostgreSQL **17.11** cluster на loopback.
- Project adapter: **PrismaPg 7.8.0**, Node **22.13.1**.
- Write transaction isolation: **READ COMMITTED**, проверен SQL.
- Conservation assertions используют consistent **REPEATABLE READ** read snapshot, чтобы не смешивать данные двух commits.
- Настоящие concurrent transactions организованы через отдельный Product/Order blocker transaction и наблюдение `pg_stat_activity.wait_event_type='Lock'`. Данные и DB methods не mock'ались.
- Original race: 100 наблюдаемых Product/Order waits; callback-first scenario отдельно ждёт две concurrent Order lock очереди.
- Invariant после каждого scenario/iteration: **physical = available + currently reserved + committed/sold**. Released quantity уже возвращена в available.
- `paid => committed` проверяется для всех найденных orders; original qty=4 rejection и legitimate qty=3 payment подтверждают реальное ownership исходных трёх units.
- Test config и test file независимо требуют explicit test target/write acknowledgement, loopback hostname и отдельное имя DB. Application DATABASE_URL не является fallback; SQL database/port identity проверяется до fixtures.
- Production DB, Paysera, SMTP, Plesk и shipments не использовались. Signed callbacks — synthetic, обработаны настоящим signature verifier/webhook и настоящей test DB.

## Regression tests

- `lib/orders-reservation.test.ts`: cleanup после admin qty decrease использует current items; lock→read→transition ordering; scan ID-only; missing candidate не возвращает stock.
- `tests/integration/stock-release-race.postgres.test.ts`: 13 real-DB cases, все scenarios выше, ownership reconciliation и rollback.
- `vitest.stock-postgres.config.ts`: явный guarded standalone suite; не входит в обычные mock integration runs и не может использовать production fallback.

Для повторения нужно задать `STOCK_TEST_DATABASE_URL` privately на созданную изолированную local DB и `STOCK_TEST_WRITE_ACK=isolated-local`, затем выполнить:

```text
npx vitest run --config vitest.stock-postgres.config.ts
```

Connection string, credentials и PostgreSQL data в commit не включаются.

## Full verification

- Targeted: **80/80 passed**.
- Full unit: **2776 passed, 0 failed, 4 skipped**, 309 files.
- Existing integration: **6/6 passed**, 2 files.
- Real PostgreSQL: **13/13 passed**, 400 concurrent iterations + ownership check.
- Всего full unit/integration/real-DB: **2795 passed, 0 failed, 4 skipped**; targeted повторно в эту сумму не включён.
- Typecheck: passed. Initial run обнаружил только generated verification scripts в ignored `test-results`; directory исключён из TypeScript, как уже был исключён из Git/lint. Старые scripts/report не редактировались. Permanent real-DB suite остаётся под typecheck.
- Lint: exit 0, 0 errors, 74 existing warnings; в изменённых файлах новых warnings нет.
- Production compilation: **exit 0**, compiled/TypeScript/static generation passed, **615 static pages**. Запуск через existing build wrapper с isolated DB, без `prisma migrate deploy`.

Evidence сохраняется отдельно от предыдущей verification:

- [Before evidence](../test-results/stock-release-race-20261006-1f306c67/before-evidence.json)
- [After evidence](../test-results/stock-release-race-20261006-1f306c67/after-evidence.json)
- [Real-DB results](../test-results/stock-release-race-20261006-1f306c67/after-results.json)
- Full suite logs и WIP hashes: `test-results/stock-release-race-20261006-1f306c67/` (ignored, не входят в commit).

## Remaining P0

**No confirmed remaining P0 in stock/reservation flow.** Это вывод в рамках проверенных stock/payment/cancel flows без внешних warehouse mutations. Production-readiness verdict в этой задаче не повышается: Paysera sandbox/Plesk остаются отдельным этапом. Известный tracking email P1 не исправлялся.

## Git

- Starting HEAD: `1f306c67eebfefcb5bed78074e1584d0d2d59a0e`, branch `main`.
- Commit message: `fix: prevent stock release race`; SHA предоставляется в финальном сообщении.
- Changes: `lib/orders-data-store.ts`, `lib/orders-reservation.test.ts`, single/bulk order-meta stock loops, returns stock lock order, permanent PostgreSQL suite/config, `tsconfig.json` generated-output exclusion и этот report.
- Baseline: 6 modified, 17 original untracked, предыдущий verification report. SHA-256 всех 24 исходных WIP/report files совпал после работы.
- Предыдущий verification report, .env, test credentials, DB URLs, PostgreSQL data, SMTP artifacts и temporary logs не входят в commit.
- Push: **no**. Deployment: **no**. Production migrations: **no**.
