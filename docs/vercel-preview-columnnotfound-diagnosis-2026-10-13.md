# Vercel Preview `ColumnNotFound` — диагностика и handoff (2026-10-13)

Статус (2026-10-13, итог): **Vercel Preview `release/2026-10-20` восстановлен и собирается на Neon `stock-ledger-rehearsal-20261012` под ограниченной ролью `vercel_preview`; Production `main` `e8379993` собирается без миграций. Функциональное тестирование Preview не выполнено. Актуальная сводка и инструкции — раздел 17.** Разделы 1–16 — история диагностики.
Изменения Vercel и Neon выполнил владелец вручную (п.17.2). Агентами код, Prisma schema, миграции, Git-ветки, Neon, Vercel и Plesk не изменялись; в документе нет паролей, токенов и строк подключения.
Публичная редакция для репозитория: удалены идентификаторы инфраструктуры (endpoint ID Neon), сведения о тестовых учётных записях и локальных конфигурациях. Полная внутренняя версия хранится у владельца вне репозитория.
Продолжать может Claude или Codex. **Актуально только раздел 17.** Разделы 1–16 — исторический журнал диагностики: их инструкции отражают состояние на момент записи, многие уже выполнены или отменены; **не выполнять их без повторной проверки текущего состояния**.

---

# Часть A. Исторический журнал диагностики (разделы 1–16)

> ⚠ Всё ниже до раздела 17 — история. Состояние Vercel, Neon и веток с тех пор изменилось (см. раздел 17). Команды и планы из этих разделов нельзя выполнять без повторной проверки актуального состояния и отдельного разрешения владельца.

## 1. Состояние релиза на момент начала диагностики

- Релиз: `origin/release/2026-10-20` = `b6e6375fa620f7a4d133bb4912c25ddf85f40aa0`. Независимое ревью Codex: PASS, staging-ready YES.
- `origin/release/grins-manual-import` = `7b22e2b2` — предок релиза (0 коммитов только в ней); `prisma/` и `package-lock.json` идентичны → новых миграций и `npm ci` не требуется.
- Резервная ветка: `origin/backup/feat-grins-stock-ledger-2026-10-13` = `52238422`.
- Plesk staging (Neon branch `grins-staging-2026-10-11`) **ещё не переключён**. План развёртывания утверждается владельцем; первое действие плана — скриншот экрана Plesk Git staging (ветка, путь развёртывания, режим deploy, deployment actions, последний commit), без изменений.
- Read-only проверка staging-БД перед развёртыванием: `staging-release-2026-10-20-readonly-precheck.sql` (внутренний файл владельца, не в репозитории) — выполнять только в Neon Console → SQL Editor на ветке `grins-staging-2026-10-11` (READ ONLY + ROLLBACK, синтаксис проверен на PGlite).
- Отпечатки развёрнутой версии (GET, без побочных эффектов): `/api/orders/paypal-return` → новый релиз `503 paypal_disabled`, старый `400`; `/api/admin/orders/late-payment-exception` → новый `405`, старый `404`.
- В Plesk Run script разрешены только `prisma:generate` и `build:plesk`. Никогда в рамках развёртывания: `db:migrate:deploy`, `restore:database`, `backup:database`, `ops:*`, `sync:*`, `import:client-types`, `test:*`.

## 2. Симптом

Preview-сборки Vercel падают при пререндере `/lv`:
`PrismaClientKnownRequestError … DriverAdapterError: ColumnNotFound … Export encountered an error on /[lang]/page: /lv`.
Через driver adapter проходят **все** запросы Prisma (включая `findMany`), поэтому ошибка значит: БД, к которой подключена сборка, не содержит колонку из `schema.prisma` ветки.

## 3. Подтверждённые факты

Статусы Vercel получены из публичного GitHub commit status API (только чтение):

| SHA | Ветка | Vercel | `prisma/` содержит Ledger-колонки Product |
|---|---|---|---|
| `42409ce3` | main | success (10-08) | нет |
| `7b359b1d` | feat/mandatory-admin-mfa | success (10-08) | нет |
| `7b22e2b2` | release/grins-manual-import | **success** (10-12 21:30Z) | **да** |
| `52238422` | backup/feat-grins-stock-ledger-2026-10-13 | **failure** | да |
| `d5d83683`, `6d2c6257`, `b6e6375f` | release/2026-10-20 | **failure** | да |

- `prisma/` в `7b22e2b2`, `52238422` и `b6e6375f` **побайтно идентична**. Два коммита между `7b22e2b2` и `52238422` (deinitialize/Plesk scripts) не используются главной страницей.
- Отсутствующие в «общей» Preview-БД колонки — с высокой вероятностью `Product.grinsStock`, `grinsStockUpdatedAt`, `grinsStockRunId` (миграция `20261012170000_split_grins_stock_ledger`); main/MFA-схемы их не имеют и собираются.
- Выбор URL одинаков в сборке (`prisma.config.ts`) и рантайме (`lib/prisma.ts`): `DATABASE_URL` → `POSTGRES_PRISMA_URL` → `POSTGRES_URL` → `POSTGRES_URL_NON_POOLING`.
- Vercel запускает `npm run build`. Скрипт `build` различается по веткам:

| Ветка | `build` |
|---|---|
| main, feat/mandatory-admin-mfa, release/delivery-verify-2026-10-06 | **`prisma migrate deploy &&`** prisma generate && build |
| release/grins-manual-import, release/2026-10-20, backup/feat-grins-stock-ledger-2026-10-13 | prisma generate && build (без миграций) |

## 4. Основная гипотеза (не подтверждена до проверки Vercel)

Одинаковые код и схема дают разный результат только из-за **разной БД**:
`release/grins-manual-import` имеет собственное Preview-подключение (вероятно, к staging Neon с миграциями Ledger), а остальные ветки получают общий Preview `DATABASE_URL` к БД без миграций Ledger.

Альтернатива той же природы: интеграция Neon ↔ Vercel создаёт отдельную Neon-ветку на каждую git-ветку от родителя без миграций Ledger.

## 5. Оценка риска (предварительная)

1. **Неудачные Preview-сборки сами по себе безопасны**: ничего не публикуют, production и Plesk staging не затронуты; `release/2026-10-20` миграций при сборке не выполняет.
2. **Главный риск — куда указывает общий Preview-URL.** Если это production Neon:
   - Preview-деплои main/MFA-ветки работают с production-данными (заказы, сессии, вебхуки по preview URL);
   - **сборка каждой ветки со `prisma migrate deploy` применяет её миграции к этой БД.** Косвенный признак: коммит `975bcd01` фиксирует, что staging Neon уже содержал `20261007120000_session_mfa_verified` из `feat/mandatory-admin-mfa`, хотя миграций на staging отдельно не запускали; ветка staging создана 10-11 и могла унаследовать эту миграцию от родителя. Это **не доказательство**, только согласованное наблюдение.
3. *(Устарело: проверка завершена, исправление смёржено — см. раздел 17.)* До завершения проверки: **не пушить** ветки, у которых `build` содержит `prisma migrate deploy` (main, feat/mandatory-admin-mfa, release/delivery-verify-2026-10-06), и не делать Redeploy их Preview в Vercel. Это бездействие и на production не влияет.

## 6. Ручная проверка (владелец; только просмотр)

Никогда не копировать пароль или полную строку подключения. Для сравнения достаточно **endpoint ID** Neon (`ep-…` из хоста) и имени БД, а в отчёт — только **имя Neon-ветки**, которой этот endpoint принадлежит.

**A. Vercel → Project → Settings → Environment Variables** (значения не раскрывать без необходимости; Sensitive-значения не раскрываются вовсе).
Для каждой из `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` (и `PGHOST`/`POSTGRES_HOST`, если есть) записать по строкам:

| Переменная | Environments (Production/Preview/Development) | Branch (для Preview: «All» или конкретная) | Neon-ветка по endpoint ID |
|---|---|---|---|

Отдельно ответить: есть ли строка с Environment = Preview и Branch = `release/grins-manual-import`.

**B. Vercel → Settings → Git** — значение Production Branch.

**C. Vercel → Settings → Integrations** — подключена ли интеграция Neon и включено ли создание Neon-ветки на каждый Preview.

**D. Neon Console → Project → Branches** — для каждого endpoint ID из A: имя ветки (production / `grins-staging-2026-10-11` / preview-ветка / другая). Если есть ветки вида `preview/<git-branch>` — перечислить имена и родителя.

**E (необязательно, только чтение, подтверждает п.5.2).** Neon Console → SQL Editor на **production**-ветке:
```sql
BEGIN TRANSACTION READ ONLY;
SELECT migration_name, started_at, finished_at FROM _prisma_migrations
WHERE migration_name IN ('20261007120000_session_mfa_verified','20261012170000_split_grins_stock_ledger','20261012210000_add_order_operational_exceptions')
ORDER BY started_at;
ROLLBACK;
```
Сообщить: какие строки есть и время `finished_at`. Ничего не исправлять.

## 7. Интерпретация результатов

| Результат | Вывод | Риск |
|---|---|---|
| Общий Preview-URL (Branch = All) → endpoint production | Preview работает на production; ветки с `migrate deploy` мигрируют production при пуше | **Высокий** — отдельное решение владельца до любых пушей таких веток |
| Общий Preview-URL → отдельная dev/preview Neon-ветка без Ledger | Причина подтверждена; production не затронут | Низкий |
| Интеграция создаёт Neon-ветку на каждый Preview от production | Preview пишет в копию production-данных (персональные данные), не в production; миграции применяются к копии | Средний (данные), production-схема не меняется |
| У `release/grins-manual-import` своя Preview-строка → staging endpoint | Объясняет зелёную сборку `7b22e2b2` | — |
| E: на production есть `session_mfa_verified` c `finished_at` ≈ 2026-10-07/08 | Подтверждает, что Preview-сборка MFA-ветки применила миграцию к production | **Высокий** (миграция аддитивная, но процесс неконтролируемый) |

## 8. Запрещено до завершения проверки

> ⚠ Устарело: проверка завершена, Preview восстановлен (раздел 17).

Миграции/`db push` ради зелёного Preview; изменение env/Integrations/Git-настроек Vercel; Redeploy Preview; пуш веток с `prisma migrate deploy` в `build`; любые операции с production Neon кроме read-only SELECT из п.E; правки кода/схемы.

## 9. Следующий шаг (этап 1, выполнен частично)

Владелец удалил общий Preview `DATABASE_URL` в Vercel. Результат: сборка `release/2026-10-20` падает уже на `prisma generate` с `No database URL found` (`prisma.config.ts` бросает ошибку при отсутствии всех четырёх переменных). Это **подтверждает**, что ранее Preview этой ветки получал URL из общей Preview-переменной, и что сейчас ни один из `DATABASE_URL`/`POSTGRES_PRISMA_URL`/`POSTGRES_URL`/`POSTGRES_URL_NON_POOLING` для неё в Preview не задан. Куда указывал удалённый URL (production или нет) — по-прежнему не установлено; п.6 E остаётся способом это проверить.

## 10. Аудит build-скриптов и Preview (этап 2, 2026-10-13, read-only)

### 10.1 Где выполняется `prisma migrate deploy`

Vercel выполняет `npm run build` для каждой запушенной ветки (Production Branch → Production, остальные → Preview). Скрипт `build` на origin:

| Ветка origin | HEAD | `build` | Миграций сверх `main` |
|---|---|---|---|
| main | `42409ce3` | **migrate deploy** + generate + build | — (58 всего) |
| feat/mandatory-admin-mfa | `7b359b1d` | **migrate deploy** + … | `20261007120000_session_mfa_verified` |
| release/delivery-verify-2026-10-06 | `0cbb7df0` | **migrate deploy** + … | нет |
| worktree-card-pk-registration | `9e0413c3` | **migrate deploy** + … | нет (подмножество main) |
| worktree-live-db-sync-override-layer | `c1fda46b` | **migrate deploy** + … | нет |
| worktree-product-variant-options-v2 | `da04ddf0` | **migrate deploy** + … | нет |
| release/2026-10-20 | `b6e6375f` | generate + build | 3 (MFA + 2 Ledger) — **не применяет** |
| release/grins-manual-import | `7b22e2b2` | generate + build | — не применяет |
| backup/feat-grins-stock-ledger-2026-10-13 | `52238422` | generate + build | — не применяет |

`prisma migrate deploy` удалён из `build` коммитом `45429009` («build: separate Prisma migrations from builds»), который есть только в ветках GrinS/релиза, но не в `main`.

### 10.2 Какие сборки потенциально меняют БД

- **Preview** (сейчас): ни одна. Без Preview-URL `prisma.config.ts` останавливает сборку до любой SQL-операции; `migrate deploy` упадёт так же. Исключение — ветки с собственной Branch-специфичной Preview-переменной (вероятно, `release/grins-manual-import`), но её `build` миграций не запускает.
- Если общий Preview-URL **вернуть**, пуш или Redeploy любой из шести веток с `migrate deploy` применит её миграции к этой БД. Максимум сверх `main`: `session_mfa_verified` (аддитивная колонка).
- **Production** (Vercel Production Branch): если это `main` и Production `DATABASE_URL` указывает на production Neon, каждый пуш в `main` выполняет `prisma migrate deploy` против production. Значение Production Branch и цель Production-URL **не проверены** (п.6 A, B).
- Сборка любой ветки (даже без миграций) **читает** БД при пререндере (`/[lang]` и др.): Preview-сборка с production-URL читает production-данные при сборке и работает с ними в рантайме.

### 10.3 Кому реально нужен Preview с БД

- Релизный поток staging/production идёт через Plesk; ни одна задача релиза 20 октября не требует Vercel Preview.
- Без БД Preview этого проекта не собирается вовсе: нужен URL для `prisma generate` и данные для пререндера. Preview «без БД» невозможен без изменения кода.
- Единственный кандидат — `release/grins-manual-import` (собственное подключение, исторически, вероятно, использовался как staging). Нужен ли он сейчас — решение владельца.

### 10.4 Рекомендуемая безопасная конфигурация

1. **⚠ Устарело — НЕ применять:** Preview для `release/2026-10-20` теперь используется намеренно (раздел 17); эта настройка отключила бы его. Исходная рекомендация: Vercel → Settings → Git → **Ignored Build Step** → Custom:
   `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi`
   (exit 0 = сборка пропускается, exit 1 = сборка выполняется). Все Preview-сборки отключаются; Production работает как раньше. Preview тогда никогда не обращается ни к какой БД.
2. Общий Preview `DATABASE_URL`/`POSTGRES_*` **не возвращать** (уже удалён).
3. Production-переменные БД: Environment = **только Production** (проверить, что ни у одной нет галочки Preview/Development).
4. Если Preview понадобится в будущем: отдельная Neon-ветка `vercel-preview` от **staging** (не от production), Branch-специфичная Preview-переменная только для нужной git-ветки; желательно роль без DDL-прав, чтобы `migrate deploy` в Preview падал.
5. Отдельно, кодом и с отдельным разрешением (не в релиз 2026-10-20): перенести `45429009` в `main`, чтобы ни одна сборка не выполняла миграции; миграции — только явной операторской командой.

### 10.5 Открытые вопросы владельцу (без секретов)

- Vercel Production Branch = ? Используется ли Vercel Production для реального сайта, или production — только Plesk?
- Production `DATABASE_URL`/`POSTGRES_*` в Vercel → какая Neon-ветка (по endpoint ID)?
- Остаётся ли Branch-специфичная Preview-переменная для `release/grins-manual-import`, и какая у неё Neon-ветка?
- *(Устарело: `main` больше не выполняет миграции при сборке — раздел 17.)* До ответа: не пушить `main` и ветки с `migrate deploy`, не делать Redeploy их деплоев в Vercel.

## 11. Автоматические миграции при сборке Vercel Production (этап 3, 2026-10-13, только анализ)

Контекст владельца: Vercel Production Branch = `main`; основная Neon-ветка `production` может быть целью Vercel Production. Публичного магазина ещё нет. Релиз `release/2026-10-20` = `b6e6375f` не меняется.

### 11.1 Подтверждённая причина

- `origin/main` (`42409ce3`) `package.json`: `"build": "prisma migrate deploy && prisma generate && node scripts/build-canonical-cwd.mjs"`. Vercel по умолчанию выполняет `npm run build` → **каждый пуш в `main` применяет pending-миграции к Production `DATABASE_URL`**.
- Других автоматических путей изменения схемы в `main` нет: нет `vercel.json`, `pre/postinstall`, `pre/postbuild`, `vercel-build`; `scripts/setup-git-hooks.mjs`, `scripts/build-canonical-cwd.mjs`, `next.config.js` не вызывают Prisma; `scripts/apply-*-table.ts` (ручной DDL) не вызываются ни одним npm-скриптом или workflow.
- GitHub Actions (`.github/workflows/quality.yml`, `check-encoding.yml`): сборка `npx next build --webpack`, сервер `npx next start` — **миграций нет**.
- Не проверено (интерфейс Vercel): переопределены ли Build/Install Command в Vercel → Settings → Build & Development. Если там вписан `prisma migrate deploy`, патч `package.json` его не уберёт.

### 11.2 Коммит `45429009` («build: separate Prisma migrations from builds», 2026-10-11)

5 файлов, все по теме: `package.json` (единственное исполняемое изменение), `README.md`, `.instructions.md`, `docs/deploy-github-vercel.md`, `docs/deploy-plesk.md`.
```diff
-    "build": "prisma migrate deploy && prisma generate && node scripts/build-canonical-cwd.mjs",
+    "build": "prisma generate && node scripts/build-canonical-cwd.mjs",
+    "db:migrate:deploy": "prisma migrate deploy",
```
Проверено во временном git-индексе от `origin/main` (рабочие копии не тронуты): и hunk `package.json`, и весь коммит применяются к `main` **без конфликтов**. `prisma.config.ts` в `main` и в релизе идентичен; в `main` после `45429009` нет изменений, требующих иной реализации.

### 11.3 Рекомендуемое исправление (выполнено: PR #2, `main` = `e8379993`)

- Ветка: `fix/main-build-without-migrations` от `origin/main`.
- Изменение: `git cherry-pick -x 45429009` (5 файлов, только `build`/документация; сохраняет происхождение). Минимальная альтернатива — только hunk `package.json`; тогда README/`deploy-*.md` в `main` продолжат утверждать, что build мигрирует.
- Не трогать: `prisma/schema.prisma`, `prisma/migrations/**`, `prisma.config.ts`, код приложения, release-ветки.
- Доставка в `main`: PR → ревью → merge владельцем. Merge запускает Vercel Production-сборку уже **без** миграций.

### 11.4 Влияние

| | До | После |
|---|---|---|
| Vercel Production (`main`) | migrate deploy + generate + next build | generate + next build; приложение то же |
| Миграции | автоматически при каждом пуше `main` | только явно: `npm run db:migrate:deploy` против выбранной БД |
| Vercel Preview | без URL падает на `prisma generate` | без изменений |
| Plesk staging/production | `build:plesk`/release-ветки, миграций нет | без изменений |
| Релиз `b6e6375f`, GrinS/Ledger, миграции Ledger | — | не затрагиваются |

### 11.5 Риски

- Если в `main` появится новая миграция, Production-сборка больше не применит её: пререндер упадёт с `ColumnNotFound` (fail-safe) до явного `db:migrate:deploy`.
- Build/Install Command в UI Vercel может содержать свою миграцию (см. 11.1) — проверить до merge.
- Ветки `feat/mandatory-admin-mfa`, `release/delivery-verify-2026-10-06`, `worktree-*` по-прежнему содержат `migrate deploy` в `build`; безопасны, пока в Preview нет URL БД. Для защиты в глубину — Ignored Build Step (п.10.4) отдельным разрешением.
- Попутная находка вне задачи: CI-джобы e2e (`quality.yml`) работают против `secrets.DATABASE_URL`, а `e2e/global-setup.ts` пишет пользователей (INSERT/UPDATE). Если секрет указывает на production Neon, пуш в `main` пишет тестовые данные в production. Миграций там нет. Решать отдельно.

### 11.6 Проверки без обращения к БД

1. `git diff --stat origin/main..fix/main-build-without-migrations` — ровно 5 файлов из 11.2.
2. `node -e "const s=require('./package.json').scripts; if(/migrate/.test(s.build)) process.exit(1); console.log(s.build, '|', s['db:migrate:deploy'])"`.
3. `git grep -n "migrate deploy" -- package.json` → только `db:migrate:deploy`.
4. Фиктивный пример-заглушка (не реальные учётные данные): `DATABASE_URL=postgresql://dummy:dummy@127.0.0.1:1/dummy npx prisma validate` и `… npx prisma generate` (loopback порт 1: соединение невозможно, generate к БД не подключается).
5. Полный `npm run build` **не запускать** (пререндер читает БД). `build-canonical-cwd.mjs` не меняется.
6. После merge: в логе Vercel Production-сборки нет `migrate deploy`/`Applying migration`; сайт открывается.

### 11.7 Порядок применения (выполнено; не повторять)

1. Владелец: Vercel → Settings → Build & Development — скриншот Build/Install Command (без секретов).
2. Создать `fix/main-build-without-migrations` от `origin/main` в отдельном worktree (рабочая копия `main-dev` грязная), `cherry-pick -x 45429009`, проверки 11.6.
3. Push ветки (её Preview упадёт на отсутствии URL — ожидаемо и безопасно), PR в `main`.
4. Ревью (Codex/Claude), merge владельцем, проверка лога Production-сборки.

### 11.8 Запрещено без разрешения

Commit/push/merge/cherry-pick/rebase в `main` и release-ветки; изменение `b6e6375f`; миграции и `db:migrate:deploy`; изменения Neon (включая создание/удаление веток); изменения настроек Vercel/Plesk; Redeploy; правка Prisma schema/миграций/кода приложения; удаление незакоммиченных документов владельца.

## 12. Исправление подготовлено локально; аудит GitHub Actions (этап 4, 2026-10-13)

Владелец подтвердил: в Vercel → Build & Development все Override (Build/Install/Output/Development) выключены, команд миграций нет. Разрешена только локальная подготовка, без публикации.

### 12.1 Подготовленное исправление (не опубликовано)

- Отдельный worktree, ветка `fix/main-build-without-migrations` от `origin/main` `42409ce3`. **Upstream снят** (`git branch --unset-upstream`), чтобы `git push` без аргументов не мог попасть в `main`. На origin не пушилась.
- Коммит: `51a60ab32579d20bd978910ae9094c01922cdc53` = `git cherry-pick -x 45429009`; patch-id идентичен `45429009` (`592cfda8…`). Все 5 файлов в `main` до cherry-pick были побайтно равны родителю `45429009` → конфликтов и посторонних изменений нет.
- Diff vs `origin/main`: `package.json` (build без `prisma migrate deploy`; добавлен `db:migrate:deploy`), `README.md`, `.instructions.md`, `docs/deploy-github-vercel.md`, `docs/deploy-plesk.md`. Не изменены: `prisma/`, `prisma.config.ts`, `app/`, `lib/`, `components/`, workflows.
- Проверки (без БД; в shell нет DB-переменных, `.env.local` в worktree нет; URL-заглушка `127.0.0.1:1`): `scripts.build` = `prisma generate && node scripts/build-canonical-cwd.mjs` (нет `migrate`); `db:migrate:deploy` = `prisma migrate deploy`; единственное `migrate` в package.json — этот скрипт; lifecycle-хуков кроме `prepare` (git hooks) нет; `prisma validate` ✔, `prisma generate` ✔, `check:prisma` ✔, `tsc --noEmit` 0, `check:encoding` ✔, `git diff --check` ✔. `npm ci --ignore-scripts`. Полный `npm run build` не запускался (пререндер читает БД).
- Устаревшие упоминания «build мигрирует» остаются только в исторических датированных планах/handoff (`SYNC_FTPS_MIGRATION_HANDOFF.md`, `docs/superpowers/plans/*`) — намеренно не правились.

### 12.2 GitHub Actions: что и когда пишет в БД

`quality.yml`: триггеры **`pull_request` (любой PR, включая ветки этого же репозитория — секреты доступны)** и `push` в `main`. `check-encoding.yml`: только скрипт кодировки, БД нет. Миграций ни в одном workflow нет.

| Job | БД | Что выполняет | Пишет в БД |
|---|---|---|---|
| static-and-unit | заглушка `ci@localhost` | lint/typecheck/unit/integration | нет |
| accessibility-webkit | `secrets.DATABASE_URL` | Playwright `accessibility.spec.ts` (+ globalSetup) | **да — globalSetup** |
| firefox-smoke | `secrets.DATABASE_URL` | `next build` (пререндер читает БД) + `cross-browser-responsive.spec.ts` | **да — globalSetup, сессии входа тестовых учётных записей** |
| chromium-critical-smoke | `secrets.DATABASE_URL` | `next build` + `critical-flows.spec.ts` | **да — globalSetup, сессии тестовых учётных записей**; `/api/orders`, `/api/reviews` перехвачены `page.route` → заказов/отзывов/остатков нет |
| email-delivery-mailpit | нет | локальный Mailpit | нет |
| performance-smoke | `secrets.DATABASE_URL` | `next build` + `next start` + GET-нагрузка (`/api/products`, `/api/search`, `/checkout`, `/api/health`) | только чтение (возможны служебные записи, напр. rate-limit) |

Если секрет пуст, джобы с `if: env.DATABASE_URL != ''` пропускаются с warning (fail-safe), но `accessibility-webkit` тоже защищён этим условием.

### 12.3–12.5 Тестовые учётные записи CI

`e2e/global-setup.ts` создаёт/обновляет тестовые учётные записи в той БД, на которую указывает `secrets.DATABASE_URL`. Была выполнена отдельная проверка и принято решение владельца (см. 13). Подробности — только во внутренней версии документа.

### 12.6 Запрещено без разрешения (дополнение к 11.8)

Push ветки исправления; создание PR (запускает e2e против секрета); запуск e2e локально против любых реальных БД; чтение/вывод значений GitHub Secrets; изменение данных пользователей в Neon.

## 13. Готовность к публикации исправления (этап 5, 2026-10-13, только анализ)

Решение владельца: тестовые учётные записи намеренно используются для ручной разработки — **не изменять** их без отдельного решения владельца; отдельный аудит пользователей в рамках этой задачи не проводится.

### 13.1 Состояние

- `fix/main-build-without-migrations` = `51a60ab32579d20bd978910ae9094c01922cdc53`, на origin нет, upstream не задан, рабочее дерево чистое. Diff vs `origin/main` (`42409ce3`): ровно 5 файлов из п.11.2; `prisma/`, `prisma.config.ts`, `app/`, `lib/`, `components/`, `scripts/`, `.github/` не изменены. Релиз `b6e6375f` не изменён.
- `build` = `prisma generate && node scripts/build-canonical-cwd.mjs`; `db:migrate:deploy` = `prisma migrate deploy`. Vercel Build/Install Command не переопределены → Vercel выполнит именно этот `npm run build`.

### 13.2 GitHub Actions и общая БД

Публичный API запусков (`quality.yml`, run `37773550950`, push `main` `42409ce3`, 2026-10-08): во всех джобах с `secrets.DATABASE_URL` шаги `next build`, Playwright и нагрузочный тест — **skipped**, выведены warning «skipped because DATABASE_URL is unavailable». Вывод: секрет `DATABASE_URL` в Actions **не задан** (на 08.10) → e2e/globalSetup в CI к Neon не обращаются. Изменение workflow не требуется.
Push ветки, отличной от `main`, `quality.yml`/`check-encoding.yml` не запускает. PR запускает `static-and-unit` (заглушка `ci@localhost`), `check-encoding`, остальные джобы завершаются с пропущенными DB-шагами.
Если секрет когда-либо добавят: минимальная защита — в джобах с БД заменить `secrets.DATABASE_URL` на отдельный `secrets.E2E_DATABASE_URL` для изолированной CI-БД (без секрета джобы пропускаются, проверки не отключаются навсегда). Сейчас не нужно.

### 13.3 План публикации (выполнено; не повторять)

1. Push: `git push -u origin fix/main-build-without-migrations` из отдельного worktree (явный refspec). Следствие: Vercel Preview этой ветки упадёт на `prisma generate` (`No database URL found`) — ожидаемо, без доступа к БД. Actions не запускаются.
2. PR `fix/main-build-without-migrations` → `main` (через веб: `https://github.com/Prokuuudin/eshop02/pull/new/fix/main-build-without-migrations`; `gh` на этой машине не авторизован).
3. CI: ожидать `static-and-unit` ✔, `check-encoding` ✔, DB-джобы ✔ с warning о пропуске. Если в логе DB-джобы видно выполнение `next build`/Playwright — **остановиться** (значит, секрет появился).
4. Merge владельцем: «Create a merge commit» (сохраняет `51a60ab3` в истории). Merge запускает Vercel Production и `quality.yml` (push `main`).
5. Vercel → Deployments → Production → Build Logs: строка `> prisma generate && node scripts/build-canonical-cwd.mjs`; **нет** `prisma migrate deploy`, `migrations found`, `Applying migration`; статус Ready; сайт открывается. При сбое — не запускать миграции; откат через Vercel Instant Rollback только с разрешения.

## 14. Аудит веток Neon и подключений окружений (этап 6, 2026-10-13, только чтение)

Состояние: PR #2 смёржен, `origin/main` = `e8379993` (содержит `51a60ab3`, `build` без миграций), Vercel Production `e8379993` = success. `release/2026-10-20` = `b6e6375f` (Preview failure — нет URL БД).

### 14.1 Доступ

- Neon API: **нет** — сохранённая авторизация CLI истекла; обновление не выполнялось.
- Vercel: CLI нет; только публичные GitHub commit statuses. Plesk: доступа нет.
- Источники: документы проекта, локальные `.env*` (выведены только endpoint ID), коммит-статусы GitHub.

### 14.2 Endpoint ↔ ветка

Сопоставление endpoint ID и веток Neon (production, `grins-staging-2026-10-11`, `stock-ledger-rehearsal-20261012`, `delivery-staging-2026-10-06`; у `staging-pre-ledger-20261012` compute необязателен) установлено по внутренним документам проекта и хранится во внутренней версии. Публично endpoint ID не приводятся. Имена двух резервных веток в репозитории не упоминаются.

### 14.3 Локальные конфигурации

Локальные `.env.local` рабочей станции разработчика указывают на production-ветку Neon. Для любых операций с БД их не использовать.

### 14.4 Скрипты/документы, зависящие от веток

- `scripts/verify-paysera-runtime-diagnostic.ts` (есть в `release/grins-manual-import` и `release/2026-10-20`, нет в `main`): identity gate `BRANCH = 'delivery-staging-2026-10-06'`, SHA `0cbb7df0`.
- Ledger-документы: `grins-staging-2026-10-11` — staging; `staging-pre-ledger-20261012` — откат staging (удалить «после стабилизации»); `stock-ledger-rehearsal-20261012` — rehearsal завершён, предписано удалить после стабилизации; enable-plan §5 предлагает будущую ветку `staging-pre-ledger-init-<дата>` (создана ли — неизвестно).
- `docs/staging-release-2026-10-20-readonly-precheck.sql` — только для `grins-staging-2026-10-11`.

### 14.5 Выводы (уверенность)

- Plesk staging → `grins-staging-2026-10-11`: высокая по документам 12–13.10; фактический `.env.local` на сервере не проверен (до 10.10 цель была `delivery-staging-2026-10-06`).
- Vercel Production → неизвестно (гипотеза: production — `main` до 13.10 при каждой сборке выполнял migrate deploy, и staging 11.10 унаследовал `session_mfa_verified`).
- Vercel Preview общий → удалён; branch-override для `release/grins-manual-import` → неизвестно, гипотеза: ветка с миграциями Ledger на 12.10 21:30 (staging или rehearsal).
- Plesk production → неизвестно.

### 14.6 Кандидат для Preview: `stock-ledger-rehearsal-20261012` (гипотеза до проверок 14.7)

Плюсы: дочерняя от staging, обе Ledger-миграции применены 12.10, rehearsal завершён, не используется staging/GrinS по документам, не production. Минусы/условия: копия реальных данных (персональные данные клиентов) — Preview должен быть защищён (Vercel Deployment Protection); роли копируются с родительской ветки → для Preview нужна отдельная роль с ограниченными правами (изменение Neon — отдельное разрешение). `grins-staging-2026-10-11` для Preview не использовать (влияние на приёмку и cutover-аудит). `staging-pre-ledger-20261012` — сохранить (откат staging). `delivery-staging-2026-10-06` — вероятно устарела, но на неё ссылается диагностический скрипт; удаление — только после подтверждения.

### 14.7 Ручные проверки владельца (без секретов)

1. Neon Console → Branches: имя, Branch ID, parent, дата создания, compute endpoint ID, Last active — для всех веток (включая две резервные).
2. Vercel → Settings → Environment Variables: для `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `PGHOST` — Environment, Branch и только endpoint ID.
3. Plesk staging → File Manager → `.env.local`: endpoint ID в `DATABASE_URL` (сравнить с endpoint ветки `grins-staging-2026-10-11`).
4. Plesk production: развёрнуто ли приложение; если да — endpoint ID.
5. Neon SQL Editor на `stock-ledger-rehearsal-20261012` (READ ONLY): все 61 миграции применены, нет failed; `grinsStock` не инициализирован; `StockAllocation` активных нет; шлюз checkout.

### 14.8 План настройки Preview (выполнен владельцем; не повторять)

1. Проверки 14.7; стоп при любом несовпадении.
2. Отдельные учётные данные для Preview на rehearsal-ветке (сброс пароля роли на дочерней ветке или новая роль).
3. Vercel: `DATABASE_URL`, Environment = Preview, Branch = `release/2026-10-20` (pooled host rehearsal). Общих Preview-переменных БД не создавать.
4. Redeploy Preview `b6e6375f` (код не меняется). Лог: `prisma generate && …`, без `migrate deploy`; Ready.
5. Проверка: Neon Monitoring — активность только на endpoint rehearsal; отпечатки `/api/orders/paypal-return` = 503, `/api/admin/orders/late-payment-exception` GET = 405.
6. Откат: удалить branch-scoped переменную → Preview снова падает без БД; ветка Neon не меняется.

## 15. Роль `vercel_preview` для Preview `release/2026-10-20` на `stock-ledger-rehearsal-20261012` (этап 7, 2026-10-13, только подготовка)

Факты владельца: ветка `stock-ledger-rehearsal-20261012` (endpoint rehearsal), parent `grins-staging-2026-10-11`, БД `neondb`, единственная роль `neondb_owner`; Vercel Authentication = Standard Protection; Production `DATABASE_URL` есть; общий Preview-URL удалён; branch-override есть только у `release/grins-manual-import`; `main` = `e8379993`. **Ничего не выполнено.**

### 15.1 Что нужно приложению от PostgreSQL (проверено по коду `b6e6375f`)

- Сборка: `build` = `prisma generate && node scripts/build-canonical-cwd.mjs` — **миграций нет**; `prisma generate` к БД не подключается (`prisma.config.ts` лишь требует наличия URL и переводит pooler→direct для CLI). Пререндер (`/[lang]` и др.) — только чтение.
- Рантайм: `PrismaNeon` (WebSocket) для Neon-хостов. Только DML: Prisma CRUD/upsert, raw `SELECT … FOR UPDATE` (12 файлов), `FOR SHARE` (шлюз GrinS), `INSERT … ON CONFLICT` (5), `pg_advisory_xact_lock` (8), `set_config('hairshop.stock_ledger_write', …, true)`. Ни одного DDL/GRANT/TRUNCATE/COPY/LISTEN в `app/`, `lib/` (кроме теста PGlite). Нет обращений к `_prisma_migrations`, `information_schema`, `pg_catalog`, нет `nextval`/`setval`, нет временных таблиц.
- Схема: одна (`public`), 41 модель, таблицы принадлежат `neondb_owner`. Последовательность одна: `AuditLog.sequence` (BIGSERIAL) → нужен `USAGE`. Триггерные функции `prevent_audit_log_mutation`, `guard_erp_stock_ledger_write` — не `SECURITY DEFINER`, выполняются с правами вызывающего; `EXECUTE` есть у `PUBLIC` по умолчанию (в миграциях нет REVOKE). `pg_trgm` доступен `PUBLIC`.
- `AuditLog`: рантайм только читает и вставляет (`appendServerAudit`; DELETE-маршрут отвечает 405). Append-only держится на триггере, который любая роль обходит через `SET app.audit_retention='enabled'` ⇒ для Preview дать только `SELECT, INSERT`.

| Объект | Права `vercel_preview` | Почему |
|---|---|---|
| database `neondb` | CONNECT | подключение |
| schema `public` | USAGE (без CREATE) | доступ к объектам; DDL запрещён |
| все таблицы, кроме двух ниже | SELECT, INSERT, UPDATE, DELETE | CRUD; UPDATE нужен и для `FOR UPDATE/FOR SHARE`, `ON CONFLICT DO UPDATE` |
| `AuditLog` | SELECT, INSERT | append-only на уровне прав |
| `_prisma_migrations` | нет | рантайм не использует; миграции только owner |
| sequences `public` | USAGE | `AuditLog_sequence_seq` (BIGSERIAL) |
| TRUNCATE, REFERENCES, TRIGGER, владение, CREATEDB/CREATEROLE, BYPASSRLS, REPLICATION | нет | не нужны |
| TEMP на БД | есть у `PUBLIC` по умолчанию | не меняем; таблицы приложения не затрагивает |

### 15.2 Особенности Neon (документация neon.com/docs/manage/roles и /database-access)

- **Console → Roles → Add role создаёт роль-член `neon_superuser`** (CREATEDB, CREATEROLE, BYPASSRLS, REPLICATION — «administrator roles»). Для Preview **не использовать**. Роль создаётся **SQL-запросом**: такие роли в `neon_superuser` не входят.
- Пароль: минимум 60 бит энтропии, задаётся открытым текстом и может остаться в истории SQL Editor ⇒ роль создаётся без пароля, пароль генерирует Console (Reset password). Работает ли Reset для SQL-роли, документация явно не говорит — проверить на шаге и подтвердить, что членство в `neon_superuser` не появилось.
- Роли копируются в дочернюю ветку при её создании. Роль, созданная на rehearsal после её создания, на `grins-staging` и `production` отсутствует — вывод из «roles belong to a branch», **подтверждается проверкой 15.4.3**. Любая будущая ветка от rehearsal унаследует `vercel_preview` с тем же паролем — не ветвить от rehearsal без удаления роли.
- Учётные данные владельца rehearsal хранить как секреты высокого уровня (наравне со staging).

### 15.3 SQL — создание и права (SQL Editor, ветка `stock-ledger-rehearsal-20261012`, БД `neondb`, как `neondb_owner`)

```sql
-- Hairshop Pro: least-privilege role for Vercel Preview (release/2026-10-20).
-- Branch: stock-ledger-rehearsal-20261012 ONLY. No password here (set via Console Reset password).
BEGIN;
CREATE ROLE vercel_preview WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20;
GRANT CONNECT ON DATABASE neondb TO vercel_preview;
GRANT USAGE ON SCHEMA public TO vercel_preview;                 -- no CREATE
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vercel_preview;
REVOKE ALL ON TABLE public."_prisma_migrations" FROM vercel_preview;
REVOKE UPDATE, DELETE ON TABLE public."AuditLog" FROM vercel_preview;   -- append-only by privilege
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO vercel_preview;
COMMIT;
```
Без `ALTER DEFAULT PRIVILEGES`: новых миграций на rehearsal не планируется; если появятся (только owner), повторить GRANT-блок.

### 15.4 Проверки

SQL 15.3, 15.4.1 и 15.4.2 проверены 2026-10-13 на локальной PGlite (PostgreSQL в памяти, схема `b6e6375f`): атрибуты роли как ожидалось, членств 0, CREATE на БД/схеме false, 2 строки-исключения (`AuditLog`, `_prisma_migrations`), sequence USAGE true; все 5 негативных команд → `42501`; разрешены SELECT, `FOR UPDATE`, `FOR SHARE`, `INSERT … ON CONFLICT DO UPDATE`, `nextval`, `set_config` + `pg_advisory_xact_lock`, DELETE. Neon (pooler, Console Reset password) этим не проверен.

**15.4.1 Права (read-only, rehearsal, как owner):**
```sql
BEGIN TRANSACTION READ ONLY;
-- 1 строка; всё false, кроме rolcanlogin = true; rolconnlimit = 20
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit
FROM pg_roles WHERE rolname = 'vercel_preview';
-- 0 строк: ни в одной роли (в т.ч. neon_superuser)
SELECT r.rolname AS member_of FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member
WHERE u.rolname = 'vercel_preview';
-- false, false, true
SELECT has_database_privilege('vercel_preview', 'neondb', 'CREATE') AS db_create,
       has_schema_privilege('vercel_preview', 'public', 'CREATE')   AS schema_create,
       has_schema_privilege('vercel_preview', 'public', 'USAGE')    AS schema_usage;
-- 0
SELECT count(*) AS owned_objects FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'vercel_preview';
-- только public
SELECT schemaname, count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') GROUP BY 1;
-- ровно 2 строки: _prisma_migrations (всё false) и AuditLog (sel, ins = true; upd, del = false); trunc/trig/refs везде false
SELECT t.tablename,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'SELECT')     AS sel,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'INSERT')     AS ins,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')     AS upd,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'DELETE')     AS del,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE')   AS trunc,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'TRIGGER')    AS trig,
  has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'REFERENCES') AS refs
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND (NOT has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'SELECT')
    OR NOT has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'INSERT')
    OR NOT has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'UPDATE')
    OR NOT has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'DELETE')
    OR has_table_privilege('vercel_preview', format('%I.%I', t.schemaname, t.tablename), 'TRUNCATE, TRIGGER, REFERENCES'));
-- AuditLog_sequence_seq: true
SELECT sequencename, has_sequence_privilege('vercel_preview', format('%I.%I', schemaname, sequencename), 'USAGE') AS usage
FROM pg_sequences WHERE schemaname = 'public';
ROLLBACK;
```

**15.4.2 Негативный тест (необязательно; SQL-клиент, вошедший как `vercel_preview`; всё откатывается).** Каждая команда должна дать `permission denied` / `must be owner`:
```sql
BEGIN; CREATE TABLE public.preview_probe(id int); ROLLBACK;
BEGIN; ALTER TABLE public."Product" ADD COLUMN preview_probe int; ROLLBACK;
BEGIN; DELETE FROM public."AuditLog" WHERE false; ROLLBACK;
BEGIN; SELECT 1 FROM public."_prisma_migrations" LIMIT 1; ROLLBACK;
BEGIN; TRUNCATE public."KeyValueSetting"; ROLLBACK;
```
Если клиента под этой ролью нет — опираться на 15.4.1 (`has_*_privilege` — авторитетный источник).

**15.4.3 Изоляция (read-only, отдельно на `grins-staging-2026-10-11` и на `production`, как owner) — до и после создания роли:**
```sql
SELECT count(*) AS vercel_preview_roles FROM pg_roles WHERE rolname = 'vercel_preview';  -- 0 на обеих
```

**15.4.4 После Redeploy Preview:** лог сборки — `prisma generate && …`, без `migrate deploy`; статус Ready. На rehearsal (owner): `SELECT usename, application_name, backend_start FROM pg_stat_activity WHERE usename = 'vercel_preview';` — есть сессии. Neon Monitoring: активность только на endpoint rehearsal. Отпечатки релиза (через Vercel Authentication): `/api/orders/paypal-return` → 503, `GET /api/admin/orders/late-payment-exception` → 405.

### 15.5 Персональные данные и побочные эффекты (до подключения БД)

- rehearsal = копия staging = копия production на 2026-10-11: реальные `User` (email, телефоны, адреса, хэши паролей, зашифрованные MFA-секреты), `Order`, `Company`/`CompanyMember`, `Invoice`, `ReturnRequest`, `ContactMessage`, `AccessRequest`, `AuditLog` (IP, user agent), `Session`, `UserNotification`, `CompanyApiKey`.
- Preview показывает их через обычную авторизацию и админку всем, кто прошёл Vercel Authentication (члены команды Vercel). Это не контроль данных: проверить отсутствие Protection Bypass/Shareable Links и считать доступ к Preview доступом к реальным данным.
- **Письма реальным клиентам**, если Preview получает рабочие `SMTP_*`: рассылки (`admin/broadcast`, `card-rules-campaign`, `stock-alerts/send`, `notifications/send`), статусы заказов, счета, сброс пароля, `product-news-notify`. Без `SMTP_HOST` в production-режиме отправка падает с ошибкой — писем нет.
- Платёжные, ERP/FTPS, API-, MFA- и прочие служебные секреты не должны попадать в Preview с production-значениями.
- Оценка объёма (read-only, rehearsal, owner):
```sql
BEGIN TRANSACTION READ ONLY;
SELECT (SELECT count(*) FROM "User") AS users,
       (SELECT count(*) FROM "Order") AS orders,
       (SELECT count(*) FROM "Company") AS companies,
       (SELECT count(*) FROM "ContactMessage") AS contact_messages,
       (SELECT count(*) FROM "Session") AS sessions;
ROLLBACK;
```

### 15.6 Пошаговый план (выполнен владельцем; не повторять без проверки текущего состояния)

1. Vercel → Environment Variables: **имена** переменных, у которых отмечен Preview (Branch All или `release/2026-10-20`), без значений. Стоп при рабочих `SMTP_*`, `PAYSERA_*`, `GRINS_FTPS_*` или production-ключах из 15.5.
2. Vercel → Deployment Protection: Standard Protection; Protection Bypass for Automation и Shareable Links не выданы.
3. Neon → SQL Editor: 15.4.3 на staging и production (ожидание 0) → ветка **`stock-ledger-rehearsal-20261012`** (сверить в селекторе) → выполнить 15.3.
4. Neon → Branches → rehearsal → Roles → `vercel_preview` → Reset password (показывается один раз; сохранять только в Vercel). Если роли нет в списке или Reset недоступен — стоп, вернуться за решением.
5. 15.4.1 (в т.ч. членство в ролях = 0 строк уже после Reset) и, при наличии клиента, 15.4.2; повторить 15.4.3.
6. Neon → Connect: Branch rehearsal, Role `vercel_preview`, Database `neondb`, pooled → строку сразу в Vercel → Add: Key `DATABASE_URL`, Environment **только Preview**, Branch **`release/2026-10-20`**, Sensitive. Host должен содержать endpoint ID ветки rehearsal.
7. Vercel → Deployments → последний Preview `release/2026-10-20` (`b6e6375f`) → Redeploy без build cache → проверки 15.4.4.

### 15.7 Откат

1. Быстро: Vercel — удалить branch-scoped `DATABASE_URL` для `release/2026-10-20` (Preview снова падает без БД); Neon rehearsal — `ALTER ROLE vercel_preview NOLOGIN;`.
2. Полностью (rehearsal, owner):
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'vercel_preview';
BEGIN;
DROP OWNED BY vercel_preview;   -- роль ничем не владеет; снимает её привилегии в neondb
DROP ROLE vercel_preview;
COMMIT;
```
3. Данные, записанные Preview, остаются только в этой одноразовой копии; staging/production не затронуты. Сброс rehearsal к родителю — отдельное разрушительное решение.

### 15.8 Открытые вопросы (без них не продолжать)

1. Имена Preview-переменных Vercel (15.6 п.1), особенно почтовых, платёжных и служебных секретов.
2. Решение владельца: допустимо ли, что Preview работает с копией реальных персональных данных (доступ — команда Vercel). Альтернативы — обезличить rehearsal (изменение данных) или schema-only ветка (новая ветка) — отдельные решения.
3. Подтверждение, что rehearsal больше никем не используется и от неё не будут создаваться ветки.

## 16. Почта из Vercel Preview (этап 8, 2026-10-13, только анализ кода `b6e6375f`)

Владелец (скриншот Vercel): в Preview были почтовые переменные `SMTP_*` и `CONTACT_TO`, а также ряд служебных секретов; `PAYSERA_*` и `GRINS_FTPS_*` отсутствуют.

### 16.1 Build vs runtime

- Вся почта — только `lib/mailer.ts` → `sendEmail()` (nodemailer). Других отправителей/почтовых API нет.
- Транспорт создаётся лениво при каждой отправке; на импорте модулей SMTP не читается; страницы сборки (`generateStaticParams` и др.) почту не импортируют ⇒ **для build SMTP не нужен ни один**.
- Runtime: `SMTP_HOST` — единственный включатель. Без него при `NODE_ENV=production` (Vercel Preview) `sendEmail` бросает `SMTP_HOST is required in production` до любого сетевого соединения; без production-режима — тихо пропускает (`smtp_send_skipped`). Переключателя «dry-run» в коде нет.
- `CONTACT_TO` — внутренний адресат (уведомления о заказах, форма связи); `/api/admin/contact-messages` возвращает `notificationConfigured = CONTACT_TO && SMTP_HOST`.

### 16.2 Все пути отправки и поведение без SMTP

| Путь | Получатель | Без `SMTP_HOST` |
|---|---|---|
| `POST /api/orders` — подтверждение клиенту, уведомление магазину | клиент / `CONTACT_TO` | заказ создаётся; ошибки письма логируются (`.catch`) |
| `POST /api/contact` | `CONTACT_TO` | сообщение сохраняется, `emailStatus` фиксирует сбой |
| `POST /api/auth/forgot-password` | пользователь | ошибка логируется, ответ `{ok:true}` |
| `POST /api/auth/register-card` | клиент | ошибка обрабатывается в маршруте |
| `admin/order-meta` (shipped/delivered) | клиент | статус сохраняется, ответ 202 `status_saved_email_failed` |
| `admin/orders/send-invoice` | клиент | 500, письма нет |
| `admin/returns/notify` | клиент | 500 `send_failed` |
| `admin/access-requests/[id]`, `admin/invitations`, `admin/card-request` | клиент | ошибка обрабатывается |
| `admin/broadcast`, `admin/card-rules-campaign`, `admin/notifications/send`, `admin/stock-alerts/send`, `notifications/send-email`, `lib/product-news-notify` | **массово клиентам/подписчикам** | каждая отправка падает, ничего не уходит |
| `lib/sync/sync-alert` | `SYNC_ALERT_EMAIL` | в Preview переменной нет — не срабатывает |

С рабочим SMTP и копией реальных данных любой из этих путей в Preview пишет реальным людям; массовые рассылки — по всей базе.

### 16.3 Рекомендация (без изменения кода)

1. Vercel → Environment Variables: у `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` и `CONTACT_TO` **снять Preview** (Production не трогать). Минимально достаточно `SMTP_HOST`; убрать все — чтобы учётные данные SMTP не попадали в сборки любых веток.
2. Изменение env не действует на уже существующие деплои: живые Preview (например, `release/grins-manual-import`, `7b22e2b2`, с БД и SMTP) продолжают слать почту до redeploy/удаления. Отдельное решение: redeploy или удалить такие Preview.
3. Рядом (не почта, решение владельца): прочие секреты в Preview пересмотреть — неиспользуемые убрать, для нужных задать отдельные от production значения.

### 16.4 Проверка отсутствия почты

1. После правки env — Redeploy Preview (без кеша).
2. Под тестовым администратором: `GET /api/admin/contact-messages` → `notificationConfigured: false`.
3. Безопасный триггер только на тестовую учётную запись (например, «Забыли пароль» для e2e-клиента): Runtime Logs Preview содержат `SMTP_HOST is required in production`; нет `smtp_send_succeeded`.
4. В кабинете SMTP-провайдера за время теста нет отправленных писем.

---

# Часть B. Актуальное состояние (раздел 17)

## 17. Итог восстановления Vercel Preview (2026-10-13)

### 17.1 Итоговый статус

| Окружение | Ветка / коммит | Состояние |
|---|---|---|
| Vercel Production | `main` / `e8379993` (PR #2, содержит `51a60ab3`) | сборка успешна; `build` = `prisma generate && node scripts/build-canonical-cwd.mjs`, миграций нет |
| Vercel Preview | `release/2026-10-20` / `b6e6375f` | Redeploy успешен; главная и каталог открываются; **функциональное тестирование не выполнено** |
| Plesk staging | `release/grins-manual-import` (по документам) | не менялся; план переключения на `b6e6375f` — п.1 (ждёт разрешения) |
| Plesk production | — | не затрагивался |

Релиз `release/2026-10-20` = `b6e6375f` не изменён. Новых веток Neon не создавалось. Миграции не запускались.

### 17.2 Что изменил владелец (подтверждено им)

- Neon, ветка `stock-ledger-rehearsal-20261012`: создана роль `vercel_preview` (ограниченный DML по п.15.3, без административных полномочий).
- Подтверждено: роли `vercel_preview` нет на ветках `production` и `grins-staging-2026-10-11`.
- Vercel: `DATABASE_URL` добавлена **только** для Environment = Preview, Branch = `release/2026-10-20`; общей Preview `DATABASE_URL` нет; Production `DATABASE_URL` и branch-override `release/grins-manual-import` сохранены без изменений.
- Vercel: `SMTP_HOST` удалён из общего Preview. Остальные `SMTP_*` и `CONTACT_TO` не менялись.

### 17.3 Карта подключений

| Окружение | Ветка Neon | Endpoint | База / роль | Уверенность |
|---|---|---|---|---|
| Vercel Preview `release/2026-10-20` | `stock-ledger-rehearsal-20261012` | endpoint rehearsal | `neondb` / `vercel_preview` | подтверждено владельцем |
| Vercel Preview `release/grins-manual-import` | не установлено (своя branch-переменная) | — | — | неизвестно |
| Vercel Preview, остальные ветки | нет URL БД → сборка падает на `prisma generate` | — | — | подтверждено |
| Vercel Production `main` | не установлено (гипотеза: `production`) | — | — | неизвестно |
| Plesk staging | `grins-staging-2026-10-11` | endpoint staging | `neondb` | по документам; файл на сервере не проверен |
| Plesk production | — | — | — | неизвестно |
| Локальные `.env.local` разработчика | `production` | endpoint production | `neondb` | подтверждено; для операций с БД не использовать |

Прочие ветки Neon: `delivery-staging-2026-10-06` (вероятно устарела; на неё ссылается `scripts/verify-paysera-runtime-diagnostic.ts`), `staging-pre-ledger-20261012` (точка отката staging — сохранить), две резервные ветки (имена в репозитории не зафиксированы — сохранить).

### 17.4 Ограничения работы с Preview: rehearsal содержит копию реальных клиентских данных

`stock-ledger-rehearsal-20261012` — копия `grins-staging-2026-10-11`, то есть копия production на 2026-10-11: реальные клиенты, контакты, адреса, заказы, компании, счета, возвраты, сессии, журнал аудита. Доступ к Preview = доступ к этим данным (только через Vercel Authentication, Standard Protection).

**Запрещено в Preview:**
- массовые и любые клиентские рассылки: `admin/broadcast`, `card-rules-campaign`, `notifications/send`, `stock-alerts/send`, `notifications/send-email`, новости товаров; отправка счетов, уведомлений о возвратах, статусов заказов, приглашений реальным клиентам;
- реальные платежи (Paysera/PayPal); `PAYSERA_*` в Preview отсутствуют — не добавлять;
- синхронизация и импорт GrinS/ERP (`grins-import`, `import`, FULL/stocks sync, Apply ручного импорта), операции Ledger (`ops:*`, deinitialize, cutover);
- разрушительные тесты: массовые изменения/удаления, восстановление бэкапов (`admin/backup`), нагрузочные тесты, e2e против этой базы;
- изменение реальных учётных записей клиентов и сотрудников; тестовые учётные записи не менять (решение владельца);
- создание веток Neon от rehearsal (унаследуют `vercel_preview` с паролем) и миграции на rehearsal без отдельного решения.

Допустимо: просмотр каталога и страниц, вход тестовыми учётными записями, точечные проверки релиза на тестовых данных без писем, платежей и синхронизации.

### 17.5 Оставшиеся проверки (до функционального тестирования)

1. Почта: убедиться, что ни для Preview (All), ни для branch `release/2026-10-20` не задан `SMTP_HOST`; затем проверки п.16.4 (`notificationConfigured: false`; в логах `SMTP_HOST is required in production`, нет `smtp_send_succeeded`; в кабинете SMTP-провайдера нет отправок).
2. Решение владельца по остальным секретам, доступным Preview (почтовые учётные данные, служебные ключи и пароли): убрать лишние и задать для Preview отдельные значения там, где они нужны.
3. Ранее созданные Preview-деплои (например, `release/grins-manual-import`, `7b22e2b2`) сохраняют старые переменные, включая `SMTP_HOST`, до redeploy или удаления — решение владельца.
4. Vercel Deployment Protection: нет Protection Bypass for Automation и Shareable Links.
5. Права роли: при изменениях в Neon повторить read-only проверки п.15.4.1 (права) и п.15.4.3 (изоляция).
6. Активность: `pg_stat_activity` на rehearsal показывает сессии `vercel_preview`; Neon Monitoring — активность только на endpoint rehearsal.
7. Отпечатки релиза в Preview (через Vercel Authentication): `/api/orders/paypal-return` → 503 `paypal_disabled`; `GET /api/admin/orders/late-payment-exception` → 405.
8. Только после пунктов 1–4: функциональное тестирование релиза по п.1 (MFA, каталог, checkout без отправки заказа, доставка и налоги, запрет PayPal, отгрузка и резервирование) — без писем и платежей.

### 17.6 Откат Preview-подключения

Быстро: Vercel — удалить branch-scoped `DATABASE_URL` для `release/2026-10-20` (Preview снова падает без БД и к данным не обращается); Neon rehearsal — `ALTER ROLE vercel_preview NOLOGIN;`. Полностью — SQL п.15.7. Данные, записанные Preview, остаются только в rehearsal.

### 17.7 Инструкции для следующей сессии (Claude Code или Codex)

1. Прочитать п.17 целиком, затем по необходимости п.15 (роль, SQL, проверки), п.16 (почта), п.14 (ветки Neon), п.1 (план Plesk staging).
2. Не менять `release/2026-10-20` (`b6e6375f`), `main`, release-ветки, код, Prisma schema, миграции. Neon, Vercel, Plesk — только по явному разрешению владельца. Секреты не запрашивать и не выводить.
3. Не использовать локальные `.env.local` (указывают на production) ни для каких операций с БД. Любые проверки БД — read-only SQL в Neon Console на явно выбранной ветке.
4. Ветки: релиз — `release/2026-10-20` (`b6e6375f`); исправление сборки — `fix/main-build-without-migrations` (смёржено в `main`); этот документ — публичная редакция в ветке `docs/vercel-preview-recovery-2026-10-13`. Полная внутренняя версия и `staging-release-2026-10-20-readonly-precheck.sql` хранятся у владельца вне репозитория.
5. Следующие шаги, каждый по разрешению владельца: закрыть п.17.5 (1–4) → функциональное тестирование Preview → переключение Plesk staging по плану п.1.
