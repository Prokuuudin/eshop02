# GrinS: последние блокеры — передача Claude

База: `30d97a7cf43c10945df870cf13694630994ce8f2`, branch `release/grins-manual-import`. Полный SHA candidate передаётся в итоговом сообщении и отдельном review packet `test-results/final-blockers-claude-handoff.md` после локального коммита (файл внутри коммита не может содержать собственный SHA).

## Приоритет независимого ревью: M1, M2, L2

M1: успешные open/abort атомарно удаляют maintenanceWindowId. Close false→true создаёт новый random UUID; уже closed не сбрасывается. SQL close после open не получает UUID, старый run отказывается; regression включён в operator SQL. KVS SHARE ROW EXCLUSIVE сериализует проверки/изменения с Apply; concurrent open/close и abort/close проверены синтетически, реальные PostgreSQL interleavings остаются OB2.

M2: новый abort-window требует operation UUID, current window UUID и отдельный `--confirm-no-commit` равный window. Все runs окна должны иметь known failed/skipped outcome, finishedAt, productsSynced=0, prices-only diagnostics и known no-write stage/reason. Completed/running/unknown, ambiguous duplicate, backup receipt или durable KVS receipt, active import/lease, mismatch и отсутствующие подтверждения приводят к отказу. Неизвестный outcome никогда не исправляется произвольным gate edit. Явное подтверждение DBA должно подкрепляться price diff и backend outcome evidence; CLI не может самостоятельно доказать отсутствие всех внешних writers. Review empty-window allowance и whitelist no-write stages особенно внимательно.

Close сохраняет исходные SyncRun IDs. Abort требует baseline и отказывает при новых legacy/restore runs без UUID, даже если статус completed находится вне window-filter. Global unknown также блокирует отмену. Legacy window без baseline требует recovery review; история не должна удаляться. UUID/baseline удаляются вместе после open/abort. Snapshot списка — диагностическая защита, не изменение prices-only/restore SQL.

L2: restore list/dry-run/execute требуют approved private registry/DB marker/operation UUID, production отдельно подтверждается. Нет dotenv и сырых ошибок с URI. Guard задаёт lock_timeout до marker check и повторяет identity в core restore transaction. Catalog/ERP fingerprints, maintenance lock, atomic restore и price-only semantics сохранены. Правки не восстанавливают stock/orders и не отключают conflict guard.

M3: runbook требует двойную сверку платежей до и после close, реальную session lifetime и zero unknown backlog перед checkpoint/backup/Apply. Canceled callback timeout/500 требует выяснения durable outcome и separately authorized exact replay; auto provider retry не предполагается.

L3: Prisma generate использует явно заданный loopback dummy URL и восстанавливает прежний env. Оператор обязан исключить чужой dotenv. Миграции запрещены. В Git candidate нет Next output standalone: существует custom root server.js с named-pipe и полная .next. Hosting standalone packaging, если он существует отдельно, не изменяется и требует собственного подтверждения; локальная задача не доказывает его.

OB2 дополнен Preview≤60s, compute pause/resume, connection ceiling, canceled callback под Product lock и same-Prisma recovery после P2028 с заранее указанными admission/latency/integrity критериями. Real PostgreSQL/Neon/IIS series не выполнены.

## Изменённые файлы

`lib/grins-checkout-control.ts`, `lib/grins-operation-environment.ts`, его test; `scripts/operate-grins-staging.ts`, `scripts/restore-grins-manual-import.ts` и новый test; `scripts/verify-grins-operator-pglite.ts`; staging authorization/OB2 docs и этот handoff. Prices-only/Paysera business logic не менялась.

## Проверки

Unit/API: **218/218, 14 файлов**, без DATABASE_URL и остальных DB URL aliases. Operator CLI SQL: **44/44**, включая stale-run replay, concurrent close/open и abort/close, каждое условие отказа, unknown lease, missing baseline, completed legacy run, guarded restore list/dry-run/execute и запрет abort после committed restore. Prices-only SQL: **44/44**. Paysera replay SQL: **8/8**. Crash/recovery: **2/2** actual child termination + reopen; before-COMMIT0changes/running/noledger, after-COMMIT1000changes/completed/ledger, stock unchanged в обоих случаях.

Typecheck, полный lint (0 errors/62 существующих warnings), targeted lint, encoding/diff и production build без миграций (615 страниц, внутренний exit0) — PASS. Prisma generate с loopback dummy URL — PASS; в release build root только `.env.example`. Проверено Node22.13.1 с существующими dependencies; это не доказательство Plesk Node22.23.2/native architecture/runtime packaging. Один operator запуск параллельно с build не прошёл Preview и не принят как PASS; окончательная последовательная серия успешна. PowerShell native stderr warnings не заменяют проверку реального Node exit code.

Все SQL/сбои выполнялись только на синтетических loopback/file-backed PGlite. Реальных БД, Neon/Plesk, push/deploy/миграций и production действий нет. PGlite не доказывает реальные блокировки, Neon websocket/pooling, compute resume и IIS worker behavior.

## Оставшиеся условия

Independent review нового SHA; реальный OB2 с≥2 IIS workers; DBA registry/marker provision; verified backup+isolated restore rehearsal; proof остановки всех M1 writers и всех платежей; физические roots/env/Node/version/timeout budgets и runtime packaging. Authorization на каждый внешний этап отдельная. Этот candidate не является GO для live Apply/production.

Вердикт: **READY FOR INDEPENDENT REVIEW**. Claude должен независимо проверить прежде всего M1/M2/L2, включая доказательство durable rollback, отсутствие orphan/legacy операций и сохранность fingerprint guards.
