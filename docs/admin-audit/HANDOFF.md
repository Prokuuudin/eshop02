# Hairshop Pro: аудит админских действий — handoff (задача закрыта)

Обновлено: 2026-11-11 (Europe/Riga), после слияния PR. Предыдущие версии: `c0162740` (2026-11-10), `58333dbb` и `fd3a3bb5` (2026-11-11).

## Статус: ЗАКРЫТА

- Исходный список админских handler'ов, которые совсем не писали постоянный `AuditLog`, **закрыт: осталось 0**. Вход, отклонённый вход и выход сотрудников тоже пишутся.
- Кандидат `c0162740dd406bbbc775ec449596e12ac7a36c58` (PR #30) **выложен на production** (Plesk, `hairshoppro.lv`).
- PR слиты 2026-11-11 по решению владельца: #31 → ветка кандидата (`186e26df`), #30 → `release/2026-11-08-prefetch-catalog` (`8a16c48a`); #15–#29 и #17 закрыты как вошедшие в #30 (см. «Состояние PR»). Выкладки при слиянии не было.
- Оставшиеся работы вынесены в [BACKLOG.md](BACKLOG.md).

## Выкладка на production

- Выложен: `c0162740dd406bbbc775ec449596e12ac7a36c58` (ветка `release/2026-11-10-staging-admin-audit-candidate`). Владелец, вручную, процедура «папка → `…prev`, чистый clone по прежнему пути, перенос серверных файлов, `npm ci`, `prisma:generate`, `build:plesk`, Restart App».
- Миграций нет: кандидат не меняет `prisma/`, `package.json`/lock, `server.js`, `next.config.js`, `tsconfig.json`. Новых переменных окружения нет.
- После рестарта, внешняя проверка: `/api/health` 200 `{"status":"ok","db":"ok"}`; `/`, `/lv`, `/en` — 200. Повторно 2026-11-10 23:18Z — то же.
- Владелец подтвердил на production: успешное оформление заказа и аудит входа и выхода сотрудника.
- Откат: прежняя папка `…prev` (переименовать обратно, Restart App). Прежний SHA ожидался `a4cecbb34f37ef3653b44f190882b8300ae21e94` (по внешним признакам и словам владельца от 2026-11-08); фактическое значение, считанное перед выкладкой, в эту сессию не передано — сверить с журналом выкладки. БД не откатывается: схема не менялась, записи `AuditLog` новой версии старой не мешают.
- Резервная копия: Neon-ветка `backup-production-pre-pr30-*` на 2026-11-10 23:18Z не найдена. Если копия делалась другим способом — дописать сюда.
- Продовая линия — ветка `release/2026-11-08-prefetch-catalog`: после слияния (`8a16c48a`) она содержит production `c0162740` плюс исправление трассировки бэкапа (PR #31) и документацию. Следующий production-релиз строить от этой ветки, а не от `a4cecbb3` и не от `main` (`main` с ней расходится).

## Приёмка

| Проверка | Где | Результат |
|---|---|---|
| Вход сотрудника с MFA (отказ по неверному коду, успешный вход), ровно один выход, `sessionHash` пустой | staging `staging.hairshoppro.lv`, `AuditLog` grins-staging | PASS (ручной smoke владельца) |
| Оба перехода статуса обращения; повтор не создаёт второе событие | staging | PASS |
| Временный админ `superAdmin=false` | staging | отозван: роль снята, пароль заменён случайным, MFA сброшен, сессии/MFA-challenge/токены сброса удалены; записи аудита сохранены |
| Критические E2E на production-сборке `c0162740` (локальный HTTPS, одноразовая PostgreSQL 17 в Docker, 3 фиксированных товара, SMTP-заглушка) | Chromium / Firefox / WebKit | **23/23 / 23/23 / 23/23, всего 69/69, пропущено 0** |
| Оформление заказа и аудит входа/выхода | production | PASS (подтверждено владельцем) |
| CI на `c0162740` | GitHub | все 9 проверок success (см. оговорку про браузерные job в BACKLOG) |

Состав 23 критических сценариев на браузер: гость без цен в HTML, meta, JSON-LD и RSC (`e2e/guest-price-leak.spec.ts`, 16); гость без цен в API и клиент с ценой (5); клиент входит через форму, кладёт товар в корзину и оформляет заказ банковским переводом — заказ создан в БД (1); удаление из корзины с подтверждением (1). Сценарии API и сквозного заказа были временным spec-файлом проверки и в репозиторий не добавлены.

Полный набор (348 тестов, dev-сервер, одноразовая ветка Neon от grins-staging): 202 прошло, 146 упало. На базе `a4cecbb3` те же падения (Chromium: 35 из 38 совпали; 2 падения только у кандидата при повторе 6/6 PASS — нестабильность dev-сервера). Регрессий от PR #30 не найдено; ремонт набора — в BACKLOG.

## Vercel Preview: исправление трассировки `/api/admin/backup` (PR #31, 2026-11-11)

- Симптом: Vercel Preview падал на каждом коммите цепочки начиная с `5ff8204d` (PR #20), включая `c0162740` и `58333dbb`: сборка завершалась, шаг «Deploying outputs» — `ENOENT: lstat '/vercel/path0/.next/lock'`. Plesk не затронут (`server.js` не использует трассы), production работает.
- Причина: `configurationPath()` в `lib/configuration-backup.ts` строил пути как `path.resolve(dataDir, name)`. Трассировка Next.js (`@vercel/nft`) не может вычислить такой путь и включала весь проект: `route.js.nft.json` — 2547 файлов (2368 вне `node_modules`), включая `.git`, документацию и временный `.next/lock`. Подтверждено бисекцией nft на транспилированном модуле: виновата только эта `path.resolve`.
- Исправление (`90566757`, ветка `fix/2026-11-11-backup-route-tracing` от `58333dbb`): литеральные пути `path.join(process.cwd(), 'data', '<file>')` для 9 файлов конфигурации, как в других хранилищах; временные файлы — `path.join` рядом с целевым, проверка `dirname` сохранена. Создание и восстановление бэкапа, advisory lock, компенсация, разрешение неопределённого коммита и аудит `settings.configuration_restored` не менялись.
- Проверено: тесты бэкапа 19/19 (новый — расположение по умолчанию `<cwd>/data`), `admin-log-store` 45/45, typecheck, eslint; production-сборка на одноразовой Docker PostgreSQL — трасса маршрута 196 файлов, 18 вне `node_modules` (9 `data/*.json`, `package.json`, чанки маршрута, `webpack-runtime.js`, manifest), всё на диске, без `.next/lock`, `.git`, документации и исходников; сквозной прогон на этой сборке по HTTPS: администратор с MFA выгружает бэкап, восстанавливает изменённую копию и оригинал, повтор ничего не меняет, в `AuditLog` ровно 2 события, временных файлов нет.
- PR #31: https://github.com/Prokuuudin/eshop02/pull/31 (база `release/2026-11-10-staging-admin-audit-candidate`), **смержен** 2026-11-11 merge-коммитом `186e26df`; CI 9/9 и Vercel на новой голове #30 — success. Vercel Preview для `90566757` — **Ready**: https://eshop02-oymy8kmdo-aleksandr-prokudins-projects.vercel.app (защищён Vercel Authentication; через `vercel curl`: `/api/health` 200 `db:ok`, `/api/admin/backup` 401 без входа).
- На production (Plesk) эта правка не нужна для работы и не выкладывалась; войдёт со следующим релизом из `release/2026-11-08-prefetch-catalog`.

## Состояние PR (2026-11-11, после слияния)

| PR | Итог | Коммит |
|---|---|---|
| #31 исправление трассировки бэкапа | смержен в `release/2026-11-10-staging-admin-audit-candidate` | merge `186e26df` (head `fd3a3bb5`) |
| #30 кандидат: цепочка #15–#29 + аудит сессий + CI-фикс | смержен в `release/2026-11-08-prefetch-catalog` | merge `8a16c48a` (head `186e26df`; production `c0162740` в истории) |
| #15 `fix/2026-11-09-admin-audit-content-payment` | GitHub сам отметил merged: head `f53ea450` вошёл в базу через #30 | — |
| #16, #18–#29 (цепочка аудита) | закрыты с комментарием «вошло в #30» | head каждого — предок `8a16c48a` |
| #17 `ci/pin-playwright-ubuntu-24-04` | закрыт с комментарием | тот же патч — `8374d61a` в #30 (cherry-pick `66a1933a` с `-x`) |

Все слияния — merge-коммитами, ветки PR не удалены. Vercel на `8a16c48a` — success. Перенос продовой линии в `main` не выполнялся (см. BACKLOG).

## Справка по реализации (без изменений с 2026-11-10)

### Сверка с базой (2026-11-10)

- `a4cecbb3` — предок `d1c66959`; ветка базы после открытия цепочки не двигалась (`d1c66959..a4cecbb3` = 0 коммитов).
- Кандидат не меняет `prisma/` (схема и миграции), `package.json` и `package-lock.json`. Из `.github` меняется только `quality.yml` (коммит CI). **Миграции БД для выката не нужны.**
- Расхождения, которые нужно учитывать:
  1. **Фикс надбавок вариантов** (`security/2026-11-07-variant-pricing`, `5a6e46da` = `68e7fae6` + `5a6e46da` поверх `a1181b3d`) **не входит ни в базу, ни в кандидат**. По памяти он запушен, но не задеплоен. В кандидат не включён, потому что задача его не называла; если он должен попасть на staging вместе с аудитом, его нужно добавить отдельным решением.
  2. `origin/main` (`dd3cec15`) не является предком базы: продовая линия `release/*` расходится с `main`, это известное состояние проекта. Кандидат строится от продовой линии, а не от `main`.
  3. Head PR #26 — `8f1e2249`, а не `9e01c7fa` из моего handoff: позже другой агент добавил в ветку документационные коммиты. В кандидат они входят через #27–#29.

### Аудит сессий

Прослежены `POST /api/auth/login`, `POST /api/auth/mfa/enroll`, `POST /api/auth/mfa/enroll/confirm`, `POST /api/auth/mfa/verify`, `POST /api/auth/logout`. Сотрудник (`requiresAdminMfa`: platform admin или staff manager) от пароля сессию не получает: она выдаётся только на шаге MFA. Новый `lib/auth-session-audit.ts`:

| Событие | Где | Как |
|---|---|---|
| `auth.admin_login_succeeded` | `mfa/verify` (`method: totp` или `backup_code`), `mfa/enroll/confirm` (`enrollment`) | В **той же транзакции**, что `createSession(..., { mfaVerified: true })`. Сбой аудита → сессия не выдаётся (fail closed, ответ 500 как при любой ошибке). Шаг пароля для сотрудника по-прежнему не выдаёт сессию и не пишет событие |
| `auth.admin_login_rejected` | `login` (неверный пароль, `reason: invalid_password`), `mfa/verify` и `mfa/enroll/confirm` (неверный код, `invalid_mfa_code`) | Только для распознанного аккаунта сотрудника. Пишется через `after()` из `next/server` **после ответа**, чтобы время ответа не выдавало, что идентификатор принадлежит сотруднику. Сбой записи только логируется |
| `auth.admin_logout` | `logout` | Если отзывается **действующая** (не истёкшая) сессия сотрудника — удаление и событие в одной транзакции. Сбой аудита → сессия всё равно удаляется отдельно (`deleteSession`), лог. Повторный и параллельный logout ничего не находят и событий не пишут |

- Клиентские вход и выход админских событий не создают; истёкшая сессия сотрудника при logout удаляется без события.
- В журнал не попадают пароли, токены, cookie, MFA-коды и хеши сессий. `appendServerAudit` хеширует session-cookie запроса, поэтому auth-события пишутся с копией запроса без cookie: остаются только `x-forwarded-for`, `x-real-ip`, `user-agent`, `x-request-id`, и в `AuditLog.sessionHash` записывается `null`.
- Сохранены правила MFA (challenge, enrollment, backup codes с compare-and-swap), все rate limit (IP, идентификатор, MFA-token, MFA-user), `CompanyActivityLog`, все ответы API и коды. `createSession` получил необязательный параметр клиента транзакции, поведение по умолчанию прежнее.
- Названия RU/LV/EN: «Вход сотрудника» / «Darbinieka pieteikšanās» / «Staff sign-in»; «Отклонённый вход сотрудника» / «Noraidīta darbinieka pieteikšanās» / «Staff sign-in rejected»; «Выход сотрудника» / «Darbinieka izrakstīšanās» / «Staff sign-out».

Проверено:

- `lib/auth-session-audit.test.ts` (12, stateful harness с реальными `createSession`/`deleteSession`/`hashToken`/`requiresAdminMfa`): сессия и событие вместе; запрос без cookie, заголовки клиента сохранены; fail closed при сбое аудита; нет токена и хеша в событии; отклонённый вход после ответа, клиенты игнорируются, сбой записи только логируется; logout сотрудника с событием; клиент и истёкшая сессия без события; повторный и параллельный logout — одно событие; отзыв при сбое аудита.
- Маршруты (`login` 19, `logout` 3, `mfa/verify`, `mfa/enroll/confirm` — всего 110 тестов `app/api/auth`): неверный пароль сотрудника аудируется без изменения ответа; клиент, неизвестный идентификатор и шаг пароля сотрудника не аудируются; метод входа (`totp`, `backup_code`, `enrollment`); неверный MFA-код; logout передаёт токен в аудируемый отзыв.
- Изолированный PGlite (in-memory PostgreSQL вне репозитория, реальный `appendServerAudit`, `PrismaPg`): 10/10 PASS — сессия и событие в одной транзакции, `sessionHash = null`, `userAgent` сохранён, отзыв с событием, повторный logout без события, клиентский logout без события, сбой аудита: сессия не выдаётся, а logout всё равно отзывает. Новый процесс PGlite не смог занять порт 54329, поэтому проверка выполнялась на уже запущенном изолированном экземпляре из этой сессии.

### Проверки кандидата (до staging)

> Снято после этого раздела: полная production-сборка прошла на staging (`build:plesk` против grins-staging) и локально на изолированной PostgreSQL 17; PR #30 создан, CI на `c0162740` — 9/9 success; критические E2E на production-сборке — 69/69 (см. «Приёмка»).

Ранние прогоны в рабочем worktree шли на `node_modules` основного checkout (другая ветка, другой набор пакетов). Поэтому итоговые проверки повторены в **чистом worktree кандидата** (`C:/Users/User/eshop02-work/worktrees/eshop02-staging-candidate`, detached `8374d61a`) после `npm ci` по lockfile кандидата и `prisma generate`:

| Проверка (чистое окружение, `8374d61a`) | Результат |
|---|---|
| `npm ci --prefer-offline --no-audit` | PASS (exit 0) |
| `npm run typecheck` | PASS |
| `npm run audit:architecture` | PASS: 963 source modules |
| `npm run lint` | PASS: 0 errors, 63 warnings (прежние) |
| `npm run test:unit -- --reporter=dot` | PASS: 386 files, 3370 tests |
| `npx next build --webpack` | **Не завершён — нужна БД.** Webpack: «Compiled successfully», TypeScript build-фазы — OK. Сбор page data без БД падает на `Can't reach database server at 127.0.0.1:5432`. С изолированным PGlite page data собраны, но prerender 636 страниц в 11 воркерах падает с «Server has closed the connection»: PGlite однопользовательский. Затронутые страницы (`/[lang]/brand/[id]`, `/privacy`, `/admin/config/locale` и др.) в кандидате не менялись |

До этого на `a1d101f2` в рабочем worktree также прошли: `app/api/auth` (110 тестов), `lib/auth-session-audit.test.ts` (12), eslint 13 изменённых файлов, `check:encoding` (1377 файлов), `git diff --check`. Коммит `8374d61a` меняет только `quality.yml`.

GitHub (кандидат ещё не прогонялся; ниже — доказательства на компонентах):

- Head цепочки `d1c66959` (PR #29): `static-and-unit` — success (https://github.com/Prokuuudin/eshop02/actions/runs/42779927408/job/129707224685); `check-encoding`, `email-delivery-mailpit`, `performance-smoke`, GitGuardian — success; `chromium-critical-smoke`, `firefox-smoke`, `accessibility-webkit` — failure (сбой `playwright install --with-deps` на `ubuntu-latest`, его чинит #17).
- PR #17 (`66a1933a`, run https://github.com/Prokuuudin/eshop02/actions/runs/42618982955) на `ubuntu-24.04`: шаги `npx playwright install --with-deps webkit|firefox|chromium` — **success, все три браузера установились**. Сами браузерные тесты **не запускались**: шаги `playwright test` / `test:e2e:smoke:*` — `skipped`, Firefox и Chromium вывели предупреждение «skipped because DATABASE_URL is unavailable» (секрет `E2E_DATABASE_URL` для этих запусков недоступен). Jobs поэтому зелёные, но браузерного покрытия нет.

Пропущено: изолированная PostgreSQL недоступна (`127.0.0.1:5432` закрыт, Docker не запущен). Integration и e2e на реальной PostgreSQL не выполнялись; проверки транзакций сделаны на stateful harness и на PGlite. Рабочая Neon не использовалась.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch release/2026-11-08-prefetch-catalog   # продовая линия после слияния (8a16c48a)
git log --oneline -3
git rev-list --count a4cecbb34f37ef3653b44f190882b8300ae21e94..c0162740   # 43 (production)
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/auth lib/auth-session-audit.test.ts lib/admin-log-store.test.ts
npm run typecheck
npm run audit:architecture
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
