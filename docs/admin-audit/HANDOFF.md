# Hairshop Pro: кандидат для staging — аудит админских действий + аудит сессий + CI — handoff

Дата: 2026-11-10 (Europe/Riga)

## Итог

- Ветка кандидата: `release/2026-11-10-staging-admin-audit-candidate`.
- База staging: `release/2026-11-08-prefetch-catalog` = **`a4cecbb34f37ef3653b44f190882b8300ae21e94`**. Это база всей цепочки аудита (PR #15 направлен в эту ветку) и база PR #17. По памяти проекта — текущий прод Plesk с 2026-11-08 (подтверждено владельцем, не проверялось в этой сессии).
- Состав кандидата: 43 коммита поверх базы — 42 коммита кода и CI (на `8374d61a`: 124 файла, +9086 / −1143) и коммит с этим handoff.
  1. Цепочка аудита до PR #29 включительно: `a4cecbb3..d1c66959` (40 коммитов, PR #15–#29), без изменений.
  2. Аудит сессий — отдельный коммит `a1d101f2` (`fix(audit): record staff sign-in, rejected sign-in and sign-out`).
  3. Исправление раннера Playwright из PR #17 — отдельный коммит `8374d61a` (cherry-pick `66a1933a` с `-x`): `runs-on: ubuntu-24.04` для `accessibility-webkit`, `firefox-smoke`, `chromium-critical-smoke`.
- Draft PR: **не создан** — `gh` не авторизован, токена в окружении нет, GitHub-подключения в сессии Claude нет. Ветка запушена.
  - base: `release/2026-11-08-prefetch-catalog`
  - head: `release/2026-11-10-staging-admin-audit-candidate`
  - ссылка: https://github.com/Prokuuudin/eshop02/compare/release/2026-11-08-prefetch-catalog...release/2026-11-10-staging-admin-audit-candidate?expand=1 («Create draft pull request»)
- Полный CI на финальном SHA кандидата **не запускался**: `quality.yml` срабатывает только на `pull_request` и на push в `main`. Он запустится после создания PR.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Сверка с базой

- `a4cecbb3` — предок `d1c66959`; ветка базы после открытия цепочки не двигалась (`d1c66959..a4cecbb3` = 0 коммитов).
- Кандидат не меняет `prisma/` (схема и миграции), `package.json` и `package-lock.json`. Из `.github` меняется только `quality.yml` (коммит CI). **Миграции БД для выката не нужны.**
- Расхождения, которые нужно учитывать:
  1. **Фикс надбавок вариантов** (`security/2026-11-07-variant-pricing`, `5a6e46da` = `68e7fae6` + `5a6e46da` поверх `a1181b3d`) **не входит ни в базу, ни в кандидат**. По памяти он запушен, но не задеплоен. В кандидат не включён, потому что задача его не называла; если он должен попасть на staging вместе с аудитом, его нужно добавить отдельным решением.
  2. `origin/main` (`dd3cec15`) не является предком базы: продовая линия `release/*` расходится с `main`, это известное состояние проекта. Кандидат строится от продовой линии, а не от `main`.
  3. Head PR #26 — `8f1e2249`, а не `9e01c7fa` из моего handoff: позже другой агент добавил в ветку документационные коммиты. В кандидат они входят через #27–#29.

## Аудит сессий (новое в кандидате)

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

## Проверки кандидата

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

## Блокеры перед staging

1. **Создать Draft PR** по ссылке выше и дождаться полного CI на финальном SHA кандидата (`static-and-unit`, `check-encoding`, `email-delivery-mailpit`, `performance-smoke`, три браузерных job).
2. **Полная production-сборка не подтверждена**: для prerender нужна настоящая изолированная PostgreSQL (preview или staging DB, не рабочая Neon). Сборка на staging (`build:plesk`) против staging-БД станет первой полной проверкой.
3. **Браузерные тесты фактически не выполняются в CI**: нет `E2E_DATABASE_URL` для PR-запусков. Нужен отдельный изолированный E2E-стенд (не рабочая Neon) и секрет, иначе зелёные браузерные job означают только установку браузеров.
4. **Решение по фиксу надбавок вариантов** (`5a6e46da`): он не входит в кандидат; на staging и прод в таком виде он не попадёт.
5. Решения владельца по ранее зафиксированным находкам: отправка писем на произвольный адрес (`card-request` без `accessRequestId`, отчёт по остаткам, тестовое письмо шаблона); одобрение заявок на доступ по праву `customers.read` (есть у `manager`); `dashboard-prefs` сбрасывает поле некорректного типа вместо 400.

## Открытые задачи (отдельные этапы)

- **Аудит, который пишется после основного действия или в отдельной транзакции** (без изменений): `POST /api/admin/grins-import/apply` (импорт применяется до отдельной audit-транзакции), `POST /api/admin/import`, `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`, `POST /api/admin/storefront-cache/revalidate`, `POST /api/admin/grins-import/preview`.
- Кампания правил карты может повторить до 50 писем при убийстве процесса посреди пакета; у `broadcast` нет `maxDuration`.
- В ранее выявленном списке админских маршрутов без записи в `AuditLog` осталось **0**; вход и выход сотрудников закрыты этим кандидатом.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch release/2026-11-10-staging-admin-audit-candidate
git log --oneline -3
git rev-list --count a4cecbb34f37ef3653b44f190882b8300ae21e94..HEAD   # 43
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts app/api/auth lib/auth-session-audit.test.ts lib/admin-log-store.test.ts
npm run typecheck
npm run audit:architecture
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной, PGlite или preview DB.
