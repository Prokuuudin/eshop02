# Hairshop Pro: аудит восстановления конфигурации — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-configuration-restore`.
- Stacked base: `a700ccc2a5c1b235df9332f79dc9c3ee89f937c4`, проверенный head открытого Draft PR #19 (`fix/2026-11-09-admin-audit-price-groups`).
- Проверка перед работой (публичный GitHub API, 2026-11-09): PR #19 `open`, `draft=true`, `merged=false`, head точно `a700ccc2…`, base `fix/2026-11-09-admin-audit-product-archive-move`; `static-and-unit` на `a700ccc2` — `success`: https://github.com/Prokuuudin/eshop02/actions/runs/42624578706/job/129184935085. Browser jobs (`firefox-smoke`, `accessibility-webkit`, `chromium-critical-smoke`) на том же SHA падают — известная проблема установки Playwright, PR #17.
- Коммит реализации: `59bf4e0c` (`fix(audit): record configuration restore with file compensation`).
- Draft PR в `fix/2026-11-09-admin-audit-price-groups`: **не создан** — `gh` на этой машине не авторизован (`gh auth status`: not logged in), токена в окружении нет. Ветка запушена; PR открывается по ссылке: https://github.com/Prokuuudin/eshop02/compare/fix/2026-11-09-admin-audit-price-groups...fix/2026-11-09-admin-audit-configuration-restore?expand=1 (отметить «Create draft pull request»).
- `static-and-unit` запускается только на `pull_request` (`.github/workflows/quality.yml`), поэтому CI на этой ветке появится только после создания PR. Результат CI на финальном SHA **не проверен**.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Реализовано

Прослежен `POST /api/admin/backup` → `restoreConfigurationBackup` в `lib/configuration-backup.ts`. Restore меняет только 9 JSON-файлов в `data/` (`CONFIGURATION_FILES`); БД restore не трогает (PostgreSQL восстанавливается отдельно через PITR). В одной PostgreSQL-транзакции находятся только advisory lock и строка `AuditLog`; файловая часть транзакционной быть не может и защищена staging + компенсацией.

Сохранены без изменений: `requireAdmin` (`users.manage`) до чтения тела, фраза `RESTORE CONFIGURATION`, лимит 20 MB (заголовок и фактический размер), `validateConfigurationBackup` (версия, полный набор файлов, sha256/bytes manifest), формат ответа `{ ok: true, restored: string[] }` и `400 invalid_or_failed_restore` при любой ошибке.

Изменение семантики: `restored` теперь перечисляет только фактически изменённые файлы (раньше — всегда все 9). UI (`app/[lang]/admin/system/backup/page.tsx`) показывает `restored.length`, поэтому при no-op покажет «Восстановлено файлов: 0». Форма ответа не изменилась.

| Action | Сущность | before / after |
|---|---|---|
| `settings.configuration_restored` | `configuration` / `configuration-files` | `{ files: [{ name, bytes, sha256 }] }` только по изменённым файлам; хеш и размер считаются по байтам файла до и после |

Содержимое файлов и payload бэкапа в журнал не попадают (проверено тестом с маркером в исходном файле). Actor и request берутся из `requireAdmin()`; `requestId` = operationId восстановления. Названия: RU «Восстановление конфигурации», LV «Konfigurācija atjaunota», EN «Configuration restored».

### Порядок выполнения

1. Валидация бэкапа; in-process очередь (`serialized`) — параллельные restore в одном процессе идут строго по очереди.
2. Вне транзакции: все 9 целевых файлов пишутся во временные `.<operationId>.stage.<name>` (`flag: 'wx'`) в том же каталоге (тот же том — `rename` атомарен).
3. Транзакция `maxWait 10s / timeout 30s`: `pg_advisory_xact_lock(hashtext('configuration-backup-restore'))` сериализует restore между процессами; под lock текущие файлы перечитываются; файл считается неизменным, если sha256 канонического JSON совпадает с manifest. Для изменённых пишется rollback-копия `.<operationId>.rollback.<name>`.
4. Если изменённых нет — возврат `[]`, ни одного `rename`, события нет.
5. `rename(stage → destination)` по каждому изменённому файлу. Без предварительного `unlink`: Node `fs.rename` на Windows использует `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`, читатели не видят отсутствующего файла, а сбой `rename` оставляет оригинал на месте.
6. `appendServerAudit(tx, …)`; после коммита rollback-копии удаляются.

### Фактические гарантии при частичном сбое

| Сбой | Что происходит | Диагностика |
|---|---|---|
| Ошибка записи stage-файлов | Целевые файлы не тронуты, временные удаляются | исключение → 400 |
| Ошибка `rename` после первой замены | Под тем же lock уже заменённые файлы возвращаются из rollback-копий; файл, на котором упал `rename`, не менялся. Транзакция откатывается, события нет | `configuration_restore_failed`, `failureStage: file_replacement`, `auditCommit: not_committed` |
| Ошибка `appendServerAudit` | То же: все заменённые файлы возвращаются, транзакция откатывается | `failureStage: audit_append` |
| Ошибка после callback (коммит/ответ потерян) | Поиск строки `AuditLog` по `requestId`. Есть — restore считается успешным. Нет — компенсация под новым advisory lock (или без lock, если БД недоступна) | `configuration_restore_commit_confirmed_after_error` (warn) или `configuration_restore_failed`, `failureStage: audit_commit` |
| Проверка коммита невозможна (БД недоступна) | Файлы компенсируются, но строка аудита могла закоммититься: **журнал может содержать событие о restore, которого в файлах нет** | `configuration_restore_consistency_unknown`, `auditCommit: unknown`, `alert: true` |
| Компенсация не удалась (ошибка `rename` rollback-копии) | Файл остаётся в новом состоянии без события аудита; rollback-копия **не удаляется** и лежит в `data/.<operationId>.rollback.<name>` для ручного восстановления | `compensation: failed`, `compensationFailedFiles`, `configuration_restore_recovery_files_retained`, `alert: true` |
| Файл изменён другим писателем после нашей замены | Компенсация **не перезаписывает** чужое состояние (sha256 текущих байт ≠ staged), файл помечается как не скомпенсированный, rollback-копия сохраняется | как выше, `alert: true` |

Не гарантируется: атомарность набора из 9 файлов для читателей во время restore (другие API могут прочитать смесь старых и новых файлов в пределах миллисекунд замены); защита от прямых записей в эти файлы другими admin API, которые не берут тот же lock; повтор `rename` при временных Windows-блокировках (`EPERM`/`EBUSY` от антивируса/индексатора) — такой сбой обрабатывается как ошибка замены с компенсацией.

## Что подтверждено тестами

`lib/configuration-backup.test.ts` (11), реальные файлы во временном каталоге `os.tmpdir()`, Prisma и `appendServerAudit` — инъекция зависимостей:

- создание и валидация бэкапа; отказ на изменённом и неполном бэкапе;
- успешное восстановление: заменён только изменившийся файл, событие с именами/размерами/хешами, содержимого нет, временных файлов в каталоге не осталось;
- no-op: ни одного `rename`, нет события, временных файлов нет;
- два параллельных restore: одновременно активна одна транзакция, оба события записаны, итог — состояние второго бэкапа;
- сбой на второй замене: все 9 файлов побайтно равны исходным, события нет;
- сбой `appendServerAudit`: все файлы восстановлены, `auditCommit: not_committed`, `compensation: succeeded`;
- сбой компенсации: `compensation: failed`, rollback-копия сохранена, файл с упавшей заменой не пострадал;
- коммит неизвестен, БД недоступна: `configuration_restore_consistency_unknown`, файлы компенсированы;
- коммит неизвестен, но строка аудита найдена: результат успешен, rollback-копии удалены;
- коммит неизвестен, файл перезаписан другим писателем: компенсация его не трогает.

`app/api/admin/backup/route.test.ts` (7): отказ без прав до валидации и restore (401/403), неверная фраза, невалидный manifest → 400 без restore, передача actor/request, лимит 413. `lib/admin-log-store.test.ts`: RU/LV/EN.

Изолированная PostgreSQL недоступна (`127.0.0.1:5432` закрыт, Docker daemon не запущен), поэтому реальный rollback транзакции и `pg_advisory_xact_lock` в runtime не проверены; рабочая Neon принципиально не использовалась. Тесты прогонялись на Windows 11 — `rename` поверх существующего файла и пути в `os.tmpdir()` проверены на NTFS.

## Затронутые пути

- `app/api/admin/backup/route.ts`
- `app/api/admin/backup/route.test.ts`
- `lib/configuration-backup.ts`
- `lib/configuration-backup.test.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Локально на `59bf4e0c` до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/configuration-backup.test.ts app/api/admin/backup/route.test.ts lib/admin-log-store.test.ts
# PASS: 3 files, 33 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 957 source modules

npm run test:unit -- --reporter=dot
# PASS: 369 files, 3092 tests

npx eslint lib/configuration-backup.ts lib/configuration-backup.test.ts app/api/admin/backup/route.ts app/api/admin/backup/route.test.ts lib/admin-log-store.ts lib/admin-log-store.test.ts
# PASS

npm run check:encoding
# PASS: 1354 source files

git diff --check
# PASS
```

GitHub `static-and-unit`: не запущен — нужен PR (см. «Статус и база»). После создания PR проверить job на head-коммите ветки.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым сценариям добавлен `POST /api/admin/backup` (restore). Строка аудита и advisory lock транзакционны; файловая часть — staging + компенсация с гарантиями из таблицы выше.

### Запись после операции или в отдельной транзакции

Без изменений относительно PR #19:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

### Без записи в `AuditLog`

После PR #19 было 28; этот PR закрывает `POST /api/admin/backup`, остаётся **27**:

1. `PATCH /api/admin/access-requests/[id]`
2. `PUT /api/admin/banner-groups`
3. `PUT /api/admin/banners/[id]`
4. `DELETE /api/admin/banners/[id]`
5. `POST /api/admin/banners/reorder`
6. `POST /api/admin/banners`
7. `DELETE /api/admin/blog/[id]`
8. `POST /api/admin/blog`
9. `POST /api/admin/broadcast`
10. `PUT /api/admin/campaigns/[id]`
11. `DELETE /api/admin/campaigns/[id]`
12. `POST /api/admin/campaigns`
13. `POST /api/admin/card-request`
14. `POST /api/admin/card-rules-campaign`
15. `PATCH /api/admin/contact-messages`
16. `POST /api/admin/content/upload`
17. `PUT /api/admin/dashboard-prefs`
18. `PUT /api/admin/email-templates/[id]`
19. `POST /api/admin/email-templates/[id]/send-test`
20. `POST /api/admin/invitations/card`
21. `POST /api/admin/invitations`
22. `POST /api/admin/invitations/sms`
23. `POST /api/admin/media/replace`
24. `DELETE /api/admin/media`
25. `POST /api/admin/notifications/assets`
26. `POST /api/admin/products/[id]/notify-promo`
27. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin (по коду).

## Первый следующий шаг

0. Создать Draft PR по ссылке выше (base `fix/2026-11-09-admin-audit-price-groups`) и проверить `static-and-unit` на head ветки; при наличии авторизованного `gh`: `gh pr create --draft --base fix/2026-11-09-admin-audit-price-groups --head fix/2026-11-09-admin-audit-configuration-restore`.
1. Следующий stacked PR — аудит решений по заявкам на доступ: `PATCH /api/admin/access-requests/[id]`. Начать от зелёного head этого PR.
2. Проследить approve/reject до всех DB mutations (заявка, создание/активация пользователя или компании, письма); определить, что входит в одну транзакцию, а что (отправка письма) идёт после коммита.
3. Сохранить permission gate, валидацию и API-контракт; `appendServerAudit` в той же транзакции, actor из серверной сессии, before/after по статусу заявки и созданным сущностям без персональных данных сверх необходимого; повтор того же решения — без события.
4. Тесты: отказ без прав, невалидный переход статуса, approve, reject, no-op повтор, параллельные решения по одной заявке, откат при сбое аудита.

Далее: content assets/CMS, рассылки; затем hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-configuration-restore
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/configuration-backup.test.ts app/api/admin/backup/route.test.ts lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной или preview DB.
