# Hairshop Pro: аудит ценовых групп и индивидуальных цен — handoff

Дата: 2026-11-09 (Europe/Riga)

## Статус и база

- Ветка: `fix/2026-11-09-admin-audit-price-groups`.
- Stacked base: `e91fc0fa1c7c3675459af9b12ee8f4c6e97f6fe8`, проверенный head открытого Draft PR #18 (`fix/2026-11-09-admin-audit-product-archive-move`).
- Проверка перед созданием ветки: PR #18 был `open`, `draft=true`, `merged=false`; его head точно совпадал с `e91fc0fa1c7c3675459af9b12ee8f4c6e97f6fe8`, а `static-and-unit` на нём имел результат `success`.
- Коммит реализации: `9272528410adc406a3483004a8481321559cc749`.
- Draft PR: будет добавлен после push; base должен быть `fix/2026-11-09-admin-audit-product-archive-move`, чтобы diff содержал только аудит ценовых групп.
- Merge и deploy не выполнялись. Production, Plesk, рабочая Neon и `hairshop.lv` не читались и не изменялись.

## Реализовано

Прослежены `POST /api/admin/price-groups` и `PUT`/`DELETE /api/admin/price-groups/[id]` до `lib/price-groups-server-store.ts`. Существующие `requireAdmin`/`requireAdminPermission`, схемы запросов, статусы и response envelope сохранены. Расчёт цен не менялся; по текущему коду price-group storage пока не подключён к расчётному контуру.

В серверную сессию и транзакционный storage подключён постоянный аудит:

| Action | Операция | Существенные данные |
|---|---|---|
| `price_group.created` | создание группы | ID, название, поля новой группы |
| `price_group.updated` | изменение группы | ID, название, только изменившиеся поля до/после |
| `price_group.deleted` | удаление группы | ID, прежние поля группы и удалённые `{productId, price}` |
| `price_group.product_price_set` | установка или изменение индивидуальной цены | ID группы, ID товара, цена до/после |
| `price_group.product_price_removed` | снятие индивидуальной цены | ID группы, ID товара, цена до и `null` после |

Каждая запись выполняется через `appendServerAudit` внутри той же Prisma-транзакции, что и upsert JSON в `KeyValueSetting`. Ошибка аудита откатывает изменение. Транзакционный advisory lock по ключу `price-groups` сериализует конкурентные read-modify-write операции и предотвращает потерю параллельных изменений. Внутри lock состояние повторно читается из БД; file fallback используется только при отсутствии KV-записи.

Повторные no-op запросы сохраняют прежний успешный API-ответ, но не выполняют upsert и не создают событие:

- PUT группы с теми же значениями;
- повторная установка той же цены;
- повторное снятие отсутствующей цены;
- повторное удаление отсутствующей группы.

Для action labels добавлены понятные названия на RU/LV/EN в `lib/admin-log-store.ts`.

## Что подтверждено тестами

- actor и request берутся из прошедшей серверную проверку сессии и передаются во все пять mutation-сценариев;
- отказ без прав происходит до вызова storage;
- аудит содержит ожидаемые action/entity/ID и before/after;
- no-op повторы не создают дубликат;
- конкурентное создание двух групп сохраняет обе группы и два уникальных ID;
- конкурентная установка цен для двух товаров не теряет ни одну запись;
- удаление группы удаляет связанные overrides и фиксирует их в одном событии;
- ошибка `appendServerAudit` откатывает изменение группы и индивидуальной цены в stateful transaction harness;
- RU/LV/EN labels.

Stateful unit harness создаёт staged-копию KV и audit state и публикует её только после успешного transaction callback. Это подтверждает транзакционную границу на уровне кода и unit-теста. Изолированная PostgreSQL недоступна: локальный `127.0.0.1:5432` не отвечает, Docker daemon отсутствует. Поэтому настоящий PostgreSQL rollback/advisory-lock runtime в этом PR не проверялся; рабочая Neon принципиально не использовалась.

## Затронутые пути

- `app/api/admin/price-groups/route.ts`
- `app/api/admin/price-groups/route.test.ts`
- `app/api/admin/price-groups/[id]/route.ts`
- `app/api/admin/price-groups/[id]/route.test.ts`
- `lib/price-groups-server-store.ts`
- `lib/price-groups-server-store.test.ts`
- `lib/admin-log-store.ts`
- `lib/admin-log-store.test.ts`
- `docs/admin-audit/HANDOFF.md`

## Проверки

Точные команды и результаты до push:

```powershell
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/price-groups-server-store.test.ts app/api/admin/price-groups/route.test.ts 'app/api/admin/price-groups/[id]/route.test.ts' lib/admin-log-store.test.ts
# PASS: 4 files, 28 tests

npm run typecheck
# PASS

npm run audit:architecture
# PASS: 957 source modules

npm run test:unit -- --reporter=dot
# PASS: 369 files, 3079 tests

npx eslint "app/api/admin/price-groups/route.ts" "app/api/admin/price-groups/route.test.ts" "app/api/admin/price-groups/[id]/route.ts" "app/api/admin/price-groups/[id]/route.test.ts" "lib/price-groups-server-store.ts" "lib/price-groups-server-store.test.ts" "lib/admin-log-store.ts" "lib/admin-log-store.test.ts"
# PASS

npm run check:encoding
# PASS: 1354 source files

git diff --check
# PASS
```

GitHub `static-and-unit` на финальном SHA и ссылка на job будут добавлены после push.

## Playwright отдельно

Известный инфраструктурный сбой установки Playwright на `ubuntu26.04-x64` отслеживается отдельным PR #17: https://github.com/Prokuuudin/eshop02/pull/17. Изменения CI в этот PR не входят. Результат `static-and-unit` нужно оценивать отдельно от browser jobs, падающих до browser assertions.

## Карта покрытия

### Постоянный аудит в той же транзакции

К ранее покрытым сценариям добавлены:

- `POST /api/admin/price-groups`: создание группы;
- `PUT /api/admin/price-groups/[id]`: изменение группы, установка/изменение/снятие индивидуальной цены;
- `DELETE /api/admin/price-groups/[id]`: удаление группы со связанными индивидуальными ценами.

Транзакционная граница, no-op и конкурентное поведение этих путей подтверждены unit/route tests, но не настоящим PostgreSQL runtime.

### Запись после операции или в отдельной транзакции

По коду остаются:

- `POST /api/admin/grins-import/apply`: каталог применяется до отдельной audit-транзакции; ошибка аудита не откатывает импорт;
- `POST /api/admin/import`: started/completed окружают отдельные product operations;
- `POST /api/admin/notifications/send`, `orders/send-invoice`, `returns/notify`: доставка выполняется до audit append;
- `POST /api/admin/storefront-cache/revalidate`: revalidation выполняется до audit append;
- `POST /api/admin/grins-import/preview`: read-only preview, событие пишется после вычисления.

Это установлено по порядку вызовов в коде; runtime PostgreSQL/SMTP в этом PR не проверялся.

### Без записи в `AuditLog`

В PR #18 была подтверждена цифра 31. Этот PR закрывает три handler (`POST /price-groups`, `PUT` и `DELETE /price-groups/[id]`), поэтому остаётся **28**:

1. `PATCH /api/admin/access-requests/[id]`
2. `POST /api/admin/backup` (restore configuration)
3. `PUT /api/admin/banner-groups`
4. `PUT /api/admin/banners/[id]`
5. `DELETE /api/admin/banners/[id]`
6. `POST /api/admin/banners/reorder`
7. `POST /api/admin/banners`
8. `DELETE /api/admin/blog/[id]`
9. `POST /api/admin/blog`
10. `POST /api/admin/broadcast`
11. `PUT /api/admin/campaigns/[id]`
12. `DELETE /api/admin/campaigns/[id]`
13. `POST /api/admin/campaigns`
14. `POST /api/admin/card-request`
15. `POST /api/admin/card-rules-campaign`
16. `PATCH /api/admin/contact-messages`
17. `POST /api/admin/content/upload`
18. `PUT /api/admin/dashboard-prefs`
19. `PUT /api/admin/email-templates/[id]`
20. `POST /api/admin/email-templates/[id]/send-test`
21. `POST /api/admin/invitations/card`
22. `POST /api/admin/invitations`
23. `POST /api/admin/invitations/sms`
24. `POST /api/admin/media/replace`
25. `DELETE /api/admin/media`
26. `POST /api/admin/notifications/assets`
27. `POST /api/admin/products/[id]/notify-promo`
28. `POST /api/admin/stock-alerts/send`

`POST /api/auth/login` и `POST /api/auth/logout` по-прежнему не создают постоянное событие `AuditLog` для platform admin. При определённых company-настройках они fire-and-forget пишут `CompanyActivityLog`; это установлено только по коду.

## Первый следующий шаг для Claude

Следующий stacked PR: восстановление конфигурации через `POST /api/admin/backup`.

1. Начать с финального зелёного head этого PR и направить новый Draft PR в `fix/2026-11-09-admin-audit-price-groups`, если он ещё открыт.
2. Проследить restore до всех DB и filesystem mutations; отдельно описать, какие части реально можно включить в одну PostgreSQL-транзакцию, а какие требуют compensation/staging.
3. Сохранить permission gate, backup validation и API-контракт.
4. Добавить `appendServerAudit` с actor из серверной сессии, before/after по фактически изменённым настройкам и без события для no-op.
5. Проверить отказ без прав, invalid backup, no-op, rollback аудита для DB-части и отказ/компенсацию для filesystem-части.

После configuration restore: access requests, content assets/CMS, рассылки; затем hardening post-operation audits (в первую очередь GrinS apply) и постоянные login/logout events.

## Продолжение из чистого checkout

```powershell
git fetch origin
git switch fix/2026-11-09-admin-audit-price-groups
git status --short
git log -3 --oneline
$env:DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test'
npx vitest run --config vitest.config.ts lib/price-groups-server-store.test.ts app/api/admin/price-groups/route.test.ts 'app/api/admin/price-groups/[id]/route.test.ts' lib/admin-log-store.test.ts
npm run audit:architecture
npm run typecheck
```

Ожидается чистый checkout. Не подставлять production Neon URL; PostgreSQL integration/e2e запускать только на отдельной локальной или preview DB.
