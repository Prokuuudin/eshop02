# Hairshop Pro: staging TypeScript fix, 9 октября 2026

## Исходное состояние и воспроизведение

- Ветка: `release/grins-manual-import`; исходный полный SHA: `d8f2a222489d369839ec2850a8687d884c551a99`.
- Рабочий каталог исправления: `C:/Users/proku/eshop02-release-grins-manual-import`, существующий чистый worktree релизной ветки. Основной checkout на `feat/mandatory-admin-mfa` содержит чужой WIP и не использован для сборки/коммита.
- В Git-дереве исходного RC `scripts/verify-paysera-runtime-diagnostic.ts` отсутствует. Локальный источник: `test-results/paysera-staging-20261007/proposal/verify-paysera-runtime-diagnostic.ts` в основном checkout. По сообщению владельца аналогичный файл лежит на staging в `scripts`; серверное содержимое в этой задаче не читалось. Его идентичность локальной копии не доказана, но копия воспроизводит точно те же ошибки и строки.
- Исходный RC: `npm.cmd run typecheck` — exit 0. После копирования исходной диагностики в `scripts`: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — exit 2, ровно TS2345:115, TS18048:121, TS2540:126; других ошибок нет.
- Локальные версии: Windows, Node 22.13.1, Next 16.3.3, Prisma 7.8.0. Это не staging Node 22.23.2. Использованы существующие зависимости и generated Prisma; install/generate не выполнялись.

## Причина и исправление

`tsconfig.json` включает `**/*.ts` и `**/*.tsx`, исключая только `node_modules`. Поэтому staging-local diagnostic попадает в Next production typecheck независимо от импортов приложения и Git tracking. Это проверка типов, а не выполнение диагностики. Исключение файла и отключение typecheck не нужны; tsconfig и Next config не изменены.

`parseEnv` возвращает значения `string | undefined`. Перед `new URL` добавлено runtime narrowing с сохранением безопасного `RUNTIME_DB_URL_PARSE_FAILED`. GrinS credential принимается как пустой только при строковом значении и пустом `trim`; undefined отклоняется с `GRINS_CREDENTIALS_PRESENT`, без TypeError. Next в `node_modules/next/types/global.d.ts` объявляет `ProcessEnv.NODE_ENV` readonly. Вместо присваивания этому свойству формируется типизированная копия `NodeJS.ProcessEnv` с production mode и staging URL, удаляются альтернативные DB URLs, затем заменяется `process.env` только диагностического процесса.

Скрипт добавлен в Git именно по staging-пути `scripts/verify-paysera-runtime-diagnostic.ts`, чтобы исправленный файл доставлялся как часть RC, а не оставался неуправляемой локальной копией. Остальной код скопирован без изменений; существующие `any` в исходной диагностике не использованы для устранения ошибок и не расширены. Нет `@ts-ignore`, assertions для обхода проверок или ослабления compiler options. Бизнес-код Paysera, GrinS, sync, оплаты и заказов не изменён.

**Не запускать диагностику как приёмку этого GrinS RC:** её существующие identity gates относятся к delivery SHA `0cbb7df0475d4518beb6f3c65fab589a998a8992` и Neon branch `delivery-staging-2026-10-06`. Эти проверки намеренно сохранены. Их адаптация и реальное выполнение требуют отдельного задания; typecheck скрипт не запускает.

## Проверки

- Исправленный полный `npm.cmd run typecheck`: exit 0; дополнительные блокирующие TS ошибки не обнаружены.
- `npm.cmd run test:unit`: exit 0, 289 файлов, 2085 тестов passed.
- `node --test scripts/verify-paysera-runtime-diagnostic.typecheck.test.cjs`: exit 0, 5/5 passed. VM fixture подменяет file reads, environment и блокирует Prisma/application import. Проверены missing/malformed URL, missing/nonempty GrinS credential и сохранение переменных при изоляции environment; реальных DB/HTTP операций нет.
- Lint изменённых script/test: exit 0, 0 errors, 24 warnings (существующие any/return types в диагностике и CommonJS imports в fixture).
- Полный `npm.cmd run lint`: exit 0, 0 errors, 62 warnings.
- `git diff --check`: exit 0.

Полная Next build не запускалась: `npm run build` выполняет запрещённые миграции, а migration-free Next build может выполнять server modules/SSG и обращаться к БД/сервисам. Локальный worktree уже имел `.next/types` и BUILD_ID; typecheck использовал существующие generated route types. Новый BUILD_ID не создавался. Успех tsc не равен подтверждённой полной staging-сборке или readiness к restart.

## Продолжение

После отдельного разрешения использовать обычную deployment-процедуру: проверить полный новый SHA и server-managed hashes, сохранить staging-local protected files, доставить исправленный script, выполнить контролируемую migration-free сборку только со staging env, проверить новый `.next/BUILD_ID` и полный артефакт перед стартом. Не считать Git export гарантированной очисткой старых диагностик: другие untracked TS файлы также могут попасть под include и требуют inventory/typecheck.

В этой задаче нет push/merge/deploy/restart, подключений к БД, миграций, XML preview/apply или production изменений. Полный SHA итогового локального коммита выдаётся отдельно; внутри checkout его можно получить через `git rev-parse HEAD`.
