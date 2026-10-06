# Hairshop Pro: доставка с ручным fulfillment — 6 октября 2026

## 1. Verdict

`CONDITIONALLY READY`

Все шесть P0 из запроса подтверждены и исправлены в локальном коде. Подтверждённых неисправленных P0 в проверенном scope не обнаружено. Статус `READY WITH MANUAL FULFILLMENT` для действующего сайта пока не утверждается: реальные callbacks Paysera, блокировки PostgreSQL и конфигурация Plesk не проверялись. До выполнения раздела 8 этот отчёт не является разрешением принимать реальные онлайн-платежи.

Отдельно: локальная инвалидизация сессии не отменяет платёжную ссылку на стороне Paysera. Деньги по старой ссылке или платежу, начатому до expiry, могут поступить провайдеру. Такой callback отклоняется, заказ не становится обычным `paid`, событие логируется с `alert: true`; сотруднику нужно сверить платёж и обработать возврат/урегулирование. Ни автоматического возврата, ни обещания, что Paysera не спишет деньги, эта реализация не даёт.

## 2. Исправленные P0

| P0 | Root cause | Исправление | Regression test | Статус |
|---|---|---|---|---|
| P0-1 | v1 сохранял доставку без destination validation; country не передавался pricing и не сохранялся явно | Общий `validateOrderDelivery` в checkout, v1, admin create/edit; страна в pricing; whitelist, enabled, страны, адрес, pickup и серверный locker snapshot | v1: missing address/country/locker/store, fake ID, чужие страна/provider, disabled/unknown method, LT/EE tariffs + snapshot | Исправлен локально |
| P0-2 | `isOrderTaxIncluded` вычитал raw points как EUR; admin edit терял discount без promoCode | Канонический `pointsToEuros`, сравнение моделей с учётом нулевого floor; сохранение discount rate независимо от наличия promoCode | Реальный admin edit: €60 + €10 − 100 points = €69; 0 bonus, bonus + discount, 1 point, total=0 | Исправлен |
| P0-3 | webhook доверял подписи и статусу, не проверяя текущую сессию, amount, amount_paid и currency; edit не инвалидировал session | Проверки всех этих полей внутри транзакции под `FOR UPDATE`; edit очищает session; новый gateway request использует перечитанный DB total; создание сессии и запись её ID под той же блокировкой | €100 paid; invalidated €100 session после €120 edit rejected; новая €120 session paid; partial/wrong amount/currency; duplicate webhook | Исправлен локально |
| P0-4 | commit делался только для reserved, но released order всё равно мог стать paid | Вариант A: expired/released не оплачивается повторно и не получает нормальный paid; conditional stock commit проверяет результат; paid terminal до обработки cancel; lifetime ограничен оставшимся резервом | expired/released callback/retry; expiry во время gateway; concurrent callbacks/cleanup; stale cleaner; released idempotent checkout rejected | Исправлен локально |
| P0-5 | admin create не принимал store ID, edit не сохранял/не очищал его | `pickupStoreId` в схемах, типах и UI; store destination с сервера; clear pickup/locker/postal на несовместимом переходе | admin create missing/fake/valid store; pickup → courier/Omniva; courier/locker → pickup; store A → B | Исправлен |
| P0-6 | checkout возвращал только ID; local store и B2B payload сохраняли browser totals; invoice taxRate доверял клиенту | Возврат полного server order; клиент требует canonical order и гидратирует его; B2B total/subtotal/tax из server order; backend VAT_RATE × 100 | canonical response / stale preview / missing totals; invoice ignores forged money and taxRate=18; существующие pricing/invoice tests | Исправлен |

`taxRate` — процент ставки в модели Invoice (`lib/invoices-store.ts`), а не сумма VAT. `18` передавалось в неё напрямую. Канонический расчёт магазина использует `VAT_RATE = 0.21`, поэтому frontend передаёт 21, а backend игнорирует произвольную ставку из браузера и выводит её из этого же источника. Серверная привязка сумм Invoice к заказу уже существовала до работы; она сохранена, а не реализована заново.

Схема базы не менялась. Для исторических заказов сохранена совместимость двух налоговых моделей; новая колонка/миграция не вводилась.

## 3. Delivery matrix

Матрица описывает серверные default settings и whitelist. Production может дополнительно отключать метод через сохранённые shipping settings.

| Метод | LV | LT | EE | Server validation | Destination | Fulfillment |
|---|---|---|---|---|---|---|
| Pickup | Да, €0 | Нет | Нет | enabled + LV + существующий store ID | Server-derived store address/city, ID сохранён | Сотрудник выдаёт в магазине |
| Courier | Да, €10 | Да, €15 | Да, €15 | enabled + country + address/city/postalCode/country | Проверенные поля адреса | Ручное создание отправления и tracking |
| Omniva (`post`) | Да, €4 | Да, €8 | Да, €8 | enabled + country/provider/type/ID | Server directory snapshot | Ручное создание отправления и tracking |
| Venipak | Да | Да | Да | enabled + country/provider/type/ID | Server directory snapshot | Ручное создание отправления и tracking |
| Unisend | Да | Да | Да | enabled + country/provider/type/ID | Server directory snapshot | Ручное создание отправления и tracking |

Тарифы берутся из существующего spreadsheet tariff source (`data/delivery-tariffs.json`); правила бесплатной доставки по LV от €100 сохранены. Бесплатная доставка в LT/EE автоматически не переносится. Courier требует явного country. Для некурьерских legacy payload без country сохранено LV; явные LT/EE/неизвестные значения никогда не превращаются в LV.

DPD, Expresspasts, venipak_courier и unisend_courier остаются недоступны через production whitelist. Cash в customer checkout/v1 разрешён только для pickup `riga-office`. Staff-entered способы оплаты остаются административным решением.

## 4. Payment / stock invariants и security review

- `order total == payment amount`: gateway creation перечитывает заказ под блокировкой и переводит DB total в cents. Browser total не участвует. Webhook требует точного совпадения amount и amount_paid с текущим total, currency=EUR.
- `paid => current payment version`: уникальный Paysera order ID сверяется с сохранённым paymentSessionId. Любой admin edit очищает ID, даже если итоговая сумма совпала. Edit оплаченного заказа запрещён.
- `paid => stock committed`: transition reserved → committed и payment update находятся в одной транзакции. Отсутствующий conditional commit не игнорируется. Released/expired отклоняется. Уже committed staff stock может оплачиваться без временного резерва.
- Callback, session creation и admin edit блокируют строку `Order FOR UPDATE`. Cleanup использует conditional transition reserved → released; после committed не возвращает stock. Провал проверки прерывает транзакцию.
- Повтор paid callback идемпотентен. Поздний canceled/cancelled не понижает paid и не освобождает его stock. Cancel чужой/устаревшей сессии также отклоняется.
- Fake fee/total/items metadata не считаются авторитетными: customer цены пересчитываются сервером; locker metadata выводится из серверного справочника; admin unit-price override остаётся staff-only.
- Другой provider/country/type, неизвестный ID и disabled method отклоняются до persistence. Pickup destination выводится из stores; несовместимые pickup/locker/postal fields очищаются при edit.
- API retry и idempotent resubmit released заказа возвращают 409, не маскируя его под новый успешный checkout.

Локальные integration tests моделируют сериализованные транзакции и rollback. Это проверка application interleavings, а не тест реального PostgreSQL adapter/lock manager. Последний остаётся обязательным пунктом production verification.

Для варианта A re-reserve намеренно не выполняется: expired/released retry отклоняется как при достаточном stock, так и при недостаточном. Нужно оформить новый checkout с новым резервом.

## 5. Tests

Baseline: 7 файлов, 113/113 tests passed до изменений.

Окончательные suites: **2774 unit passed, 4 skipped, 6 integration passed**; всего 2780 выполненных тестов, все прошли (2784 определено с учётом skipped). Unit: 309 файлов; integration: 2 файла.

- `npm run typecheck`: passed, exit 0; отдельный запуск после завершения сборки.
- `npm run lint`: exit 0, 0 errors, 75 warnings при полном запуске. Одно предупреждение о явном return type нового validator затем устранено и проверено targeted lint; оставшиеся 74 относятся к постороннему коду, который не исправлялся.
- Production compilation: compiled, TypeScript и 620 static pages passed; фактический process exit проверен отдельно, поскольку PowerShell отображает warning Next.js на stderr как NativeCommandError.
- `npm run check:encoding`: passed, 1231 source files.
- `git diff --check`: passed.

Первый одновременный запуск standalone typecheck и build столкнулся с пересозданием `.next/types`. После завершения build standalone typecheck прошёл; это не ошибка исходного кода и не оставленный failed check.

Новые/расширенные regression suites:

Добавлено 74 test cases: 71 unit и 3 integration.

- `lib/delivery-production-regressions.test.ts`: destination matrix, бонусные единицы, invalid/stale payments, stock expiry, idempotency.
- `lib/admin-delivery-regressions.test.ts`: настоящий transactional admin edit, переходы destination, bonus/discount totals.
- `tests/integration/payment-reservation.integration.test.ts`: concurrent paid callbacks, cleanup/payment, stale cleaner.
- `app/api/v1/orders/route.test.ts`: строгая доставка, foreign pricing/snapshots, released duplicate.
- `app/api/admin/orders/route.test.ts`: pickup create.
- `app/api/orders/route.test.ts`: canonical response, idempotency и released checkout.
- `app/api/orders/[id]/pay/route.test.ts`: released retry до gateway.
- `app/api/webhooks/paysera/route.test.ts`: documented payment evidence forwarding.
- `app/[lang]/checkout/checkout-order-api.test.ts`: server totals и отказ без canonical response.
- `app/api/invoices/route.test.ts`: canonical amounts + rejection of client taxRate=18.

Production compilation выполняется через `node scripts/build-canonical-cwd.mjs`. `npm build` дополнительно запускает `prisma migrate deploy`; эта команда намеренно не исполнялась против настроенной базы. Отдельные миграции для этой задачи не нужны.

## 6. Изменённые файлы

| Файлы | Изменение |
|---|---|
| `lib/validate-order-delivery.ts` | Общий server destination validator |
| `lib/tax.ts` | Points → EUR и floor при восстановлении модели |
| `lib/orders-data-store.ts` | Payment evidence, row locks, safe stock transitions, session creation, admin destination/discount/session edit |
| `lib/paysera.ts` | Gateway creation по текущему DB order, lifetime, canonical order в результате |
| `lib/api-schemas.ts`, `lib/orders-data-types.ts` | Pickup ID в admin input |
| `lib/orders-store.ts` | Клиентский тип поддерживает server payment providers |
| `app/api/orders/route.ts`, `app/api/v1/orders/route.ts` | Общая delivery validation, country/pricing, canonical responses, released resubmit guard |
| `app/api/admin/orders/route.ts` | Validated manual create destination |
| `app/api/orders/[id]/pay/route.ts`, `app/api/webhooks/paysera/route.ts` | Safe retry и verified current payment callbacks |
| `app/api/invoices/route.ts` | Server-derived VAT rate |
| `app/[lang]/checkout/checkout-order-api.ts`, `useCheckoutPage.tsx` | Canonical order hydration и B2B financial values |
| `app/[lang]/admin/orders/OrderEditForm.tsx`, `useAdminOrdersPage.ts` | Pickup selector/state/request для edit |
| `app/[lang]/admin/orders/new/page.tsx`, `useNewOrderPage.tsx` | Pickup selector/state/request для create |
| Regression files из раздела 5 | Проверки описанных дефектов |
| Этот отчёт | Результаты, ограничения и release verification |

## 7. Что осталось

- **Remaining P0:** подтверждённых неисправленных дефектов из шести P0 нет. Production release заблокирован до проверки реального payment/stock контура из раздела 8.
- **P1:** операционная обработка отклонённых, но фактически поступивших Paysera payments; сверка действующих locker directories; подтверждение runtime Node >=22.13.0 в Plesk (локальный runtime тестирования: 20.10.0).
- **P2:** carrier shipment API, labels, automatic tracking/statuses/webhooks. Эти задачи не реализовывались.

## 8. Production verification

1. **Paysera sandbox:** фактический full order payload, merchant_order_id, paysera_order_id, integer amount/amount_paid, EUR, HMAC и формы canceled/cancelled. Контракт сверялся с [официальной документацией webhooks](https://developers.paysera.com/guides/checkout-modern/api-integration/webhooks).
2. **Paysera sandbox:** €100 → paid; €100 link → admin €120 → старый callback rejected; новая €120 session → paid; duplicate; wrong currency/amount; old canceled не освобождает новый reserve.
3. **Paysera expiry:** подтвердить lifetime, in-flight payment после expiry и фактическое поступление денег по инвалидированной локально ссылке. [Paysera документирует](https://developers.paysera.com/guides/checkout-modern/api-integration/payment-links), что expired link может завершить in-flight payment. Проверить alert delivery и ручную процедуру возврата/сверки.
4. **PostgreSQL / используемый Prisma adapter:** параллельные session creation/admin edit/callback/cleanup с настоящими FOR UPDATE и rollback. Проверить 20-second transaction timeout и приемлемую latency gateway calls под блокировкой.
5. **Plesk:** правильные environment variables без публикации секретов, HTTPS callback reachability, SITE_URL, Node version и актуальность используемого build. Deployment здесь не выполнялся.
6. **Доставка:** persisted enabled/countries/freeFrom; live picker и справочники LV/LT/EE; один checkout для каждого enabled provider/country и pickup store; cash restriction; destination в admin и письмах.
7. **Fulfillment:** сотрудник вручную создаёт отправление и вносит tracking, сверяя snapshot заказа. Проверить email delivery CONTACT_TO и клиенту, админские права и сохранение tracking.
8. **B2B:** generated invoice/display/download соответствует созданному DB order при discount/bonus/delivery и foreign country. Убедиться, что старые уже выпущенные invoices отдельно сверены; изменения существующих бухгалтерских документов не входили в эту задачу.

## 9. Git

- Branch: `main`.
- Исходный HEAD: `b6c303b7c7887cfd3598f9281c32f888f6db5381`.
- Чужой WIP: шесть изменённых tracked files и исходные untracked files сохранены; в delivery commit не включаются.
- Commit message: `fix: make delivery checkout safe for production` (создаётся после всех checks; SHA предоставляется в финальном сообщении).
- Push: нет. Deployment: нет. Production migrations: нет.

Исходные tracked WIP paths: `GRINS_PRO_EXPORTER_HANDOFF.md`, `components/admin/products/AddProductForm.tsx`, `ProductBulkPricingFields.tsx`, `ProductGalleryFields.tsx`, `docs/deployment-checklist.md`, `docs/grins-pro-exporter-runbook.md`.

Expected `git status --short` after the delivery commit (verified again after commit):

```text
 M GRINS_PRO_EXPORTER_HANDOFF.md
 M components/admin/products/AddProductForm.tsx
 M components/admin/products/ProductBulkPricingFields.tsx
 M components/admin/products/ProductGalleryFields.tsx
 M docs/deployment-checklist.md
 M docs/grins-pro-exporter-runbook.md
?? AI_HANDOFF.md
?? admin-import-readiness.md
?? backup-retention-plan.md
?? fifth-wave-normalized-sku-safe-candidates.json
?? fourth-wave-ean-safe-candidates.json
?? full-sync-readiness.md
?? research/grins-paradox/analyze.py
?? research/grins-paradox/control_skus.py
?? research/grins-paradox/deep_dive.py
?? scripts/test-product-editor.mjs
?? second-new-product-import-hidden-duplicates.csv
?? second-new-product-import-rejected.csv
?? second-new-product-import-safe-candidates.json
?? second-reconciliation-intermediate.json
?? second-reconciliation-intermediate.md
?? sync-preflight-anomalies.json
?? sync-preflight-anomalies.md
```
