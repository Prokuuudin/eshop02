# GrinS: эксплуатационные блокеры — handoff Claude, 10.10.2026

База: `d0fff4931921c8fc9cde272ec7eafc2d016b6bc5`, ветка `release/grins-manual-import`. SHA нового локального коммита передаётся отдельно: сам документ входит в этот коммит.

Операционная инструкция: [staging authorization](grins-staging-operational-authorization-2026-10-10.md). Исполнимый план и числовые критерии: [OB2](grins-ob2-executable-plan-2026-10-10.md). Старый preparation-документ помечен историческим. Исходный независимый review сохранён без правок.

## Изменения для независимого ревью

- `lib/grins-operation-environment.ts`, тест и `scripts/prepare-grins-checkout-state.*`: независимый приватный registry, разные UUID и hosts staging/production, проверка URI/database/schema и серверного KVS marker, отдельный UUID confirmation production. Marker не создаётся автоматически. Проверка повторяется внутри изменяющих транзакций; ошибки не раскрывают URI.
- `lib/grins-checkout-control.ts`, `scripts/operate-grins-staging.ts`: check/close/checkpoint/preview/apply/result/open. Закрытие создаёт UUID окна; открытие требует единственного успешного prices-only run этого окна, без failed/running. Ошибка никогда автоматически не открывает checkout. KVS lock сериализует проверку с Apply. Проверить реальные PostgreSQL lock ordering и отсутствие обхода через другие writers.
- `lib/sync/manual-import*.ts`: только опциональное доверенное diagnostic context окна от CLI, без изменений price/stock SQL. HTTP payload не задаёт context. UI Apply не предоставляет receipt для автоматизированной команды open этого workflow.
- Paysera: комментарий о пределах доказательства retry, mock-тест повторной доставки и отдельный синтетический SQL replay. Бизнес-логика webhook не менялась. Повтор paid/canceled и rollback при 500 проверены локально. Поздний paid после released и неизвестный order требуют reconciliation; окно запрещает активные платежи.
- `scripts/grins-ob2-{worker.ts,monitor.sql,local-ws.mjs}`: инструменты исключительно для отдельно разрешённой изолированной БД; worker требует второй synthetic authorization marker. Реальные испытания не выполнялись.
- Новые документы описывают DBA provision, полную DB recovery point с restore rehearsal, private Windows/local-tsx execution, платежный drain и аварийное закрытие. XML v3 backup не заменяет DB backup. Восстановление в отдельную БД и выборочное согласованное исправление цен сохраняет последующие заказы; whole-DB rewind поверх новых заказов запрещён.

## Проверки и пределы

Unit/API: 211/211; operator CLI SQL: 12/12; prices-only SQL: 44/44; Paysera SQL replay: 8/8. Typecheck, production build (615 страниц, `isolated_build_finished.exitCode=0`), lint (0 errors, 62 существующих warnings), targeted lint, encoding и diff check — PASS. Первый совместный запуск столкнулся с ENOMEM; финальная сборка и SQL-проверки успешно повторены вне sandbox process limit. PowerShell записал native stderr warnings как NativeCommandError, при этом внутренний Node/Next build завершился exit 0. Node 22.13.1, существующие dependencies, без npm install и migration; это не доказательство готовности Plesk Node 22.23.2.

Не подключались к PostgreSQL/Neon, не меняли реальные markers, роли, schema, checkout или данные. PGlite не доказывает PostgreSQL concurrency, pooling, P2028, websocket disconnect или iisnode. Не выполнялись push/merge/deploy, изменения Plesk, платежи или import на staging/production.

## Приёмка

Попросить Claude проверить threat model приватного registry/marker (включая ошибочную prod clone), protection до первого write, production acknowledgement, границы транзакций/Proxy, KVS lock ordering и fresh-window receipt, безопасное восстановление и все команды из runbook. Не считать review предыдущего SHA одобрением новых изменений.

Разрешения нужны отдельно на DBA identity provision/checkout initialization, backup+restore rehearsal, остановку writers/payments и обслуживание Plesk, staging deploy/install/build/restart, runtime smoke и Preview/Apply, изолированные PostgreSQL/Neon OB2 испытания. Production — отдельный release и отдельное разрешение. До выполнения live gates и OB2 нет production GO.

Вердикт: **READY FOR STAGING AUTHORIZATION**. Требуется независимое ревью нового коммита. Само разрешение не означает GO для Apply без verified backup, окна и прохождения отдельно разрешённых OB2 gates.
