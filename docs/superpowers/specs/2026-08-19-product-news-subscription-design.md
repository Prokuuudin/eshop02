# Замена скидочной подписки на "новости о товаре"

Дата: 2026-08-19

## Контекст и мотивация

Сейчас на сайте есть система регулярных подписок на товар со скидкой
(`ProductSubscription`): пользователь оформляет ежемесячный/квартальный
автозаказ товара со скидкой 10%/7%, чекаут это серверно валидирует
(`forcedDiscountPercent`), система напоминает за 3 дня до следующей даты.

Живых данных мало (проверено в проде): 2 активные подписки, 0 использований
альтернативной системы уведомлений о поступлении (`StockNotification`) —
эта вторая система построена полностью (модель, API, стор, кнопка, секция
в личном кабинете), но нигде не подключена ни на одной странице.

Задача: убрать скидочную подписку целиком и заменить её подпиской на
новости о товаре — цена изменилась / товар снова в наличии / акция.
Заодно поглотить мёртвую систему уведомлений о поступлении вместо того,
чтобы держать две параллельные подписочные сущности.

Решения, зафиксированные с пользователем до этой спеки:
- Уведомления о поступлении объединяются в новый unified-виджет.
- Канал доставки — только в приложении (без email).
- Триггеры: цена и поставка — автоматически при сохранении товара в
  админке; акция — ручная кнопка в админке (кампании не подключены к
  реальному ценообразованию, автотриггера для акций нет).
- 2 живые скидочные подписки: строки в БД не трогаем, просто перестаём
  их показывать и обрабатывать.
- Изменения схемы Neon — только после отдельного явного подтверждения
  непосредственно перед прогоном миграции.

## Что удаляется

Скидочная подписка (`ProductSubscription`) и всё, что её обслуживает:

- `prisma/schema.prisma` — модель `ProductSubscription`
- `lib/subscription-store.ts`
- `components/SubscriptionWidget.tsx`
- `components/account/AccountSubscriptionsSection.tsx`
- `hooks/useSubscriptionReminders.ts`
- `app/api/subscriptions/route.ts`, `app/api/subscriptions/[id]/route.ts`
  (+ их `*.test.ts`)
- `subscriptionId` / `subscriptionDiscountPercent` / `forcedDiscountPercent`
  во всей цепочке чекаута: `app/[lang]/checkout/useCheckoutPage.tsx`,
  `CheckoutFormSections.tsx`, `checkout/page.tsx`, `app/api/orders/route.ts`
  (включая `InvalidSubscriptionCheckoutError` и ролловер `nextOrderDate`),
  `lib/orders-data-store.ts`, `lib/server-pricing.ts`
  (`RecomputeInput.forcedDiscountPercent`, `lib/server-pricing.test.ts`)
- CTA-ссылки `?subscribe=1` в `ProductCard.tsx`, `ProductListRow.tsx`,
  `cart/page.tsx`, `AccountOrderCard.tsx` / `AccountOrdersSection.tsx` —
  не удаляются, а перенаводятся на новый виджет (см. ниже)
- Все ключи `subscription.*` в `data/translations/{ru,lv,en}/common.ts`

Мёртвая система уведомлений о поступлении (никогда не была подключена
к UI — 0 живых строк, кнопка нигде не рендерится):

- `prisma/schema.prisma` — модель `StockNotification`
- `lib/stock-notify-store.ts`
- `components/StockNotifyButton.tsx`
- `components/account/AccountStockNotificationsSection.tsx`
- `app/api/stock-notify/route.ts`, `app/api/stock-notify/[id]/route.ts`

## Новая модель данных

```prisma
model ProductNewsSubscription {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId    String
  productTitle String
  notifyPrice  Boolean  @default(true)
  notifyStock  Boolean  @default(true)
  notifyPromo  Boolean  @default(true)
  createdAt    DateTime @default(now())

  @@unique([userId, productId])
  @@index([productId])
  @@index([userId])
}
```

Одна строка на пару (пользователь, товар) с тремя независимыми флагами —
не три отдельных типа подписки. Это соответствует UI: один виджет с
чекбоксами на карточке товара, один переключаемый набор в ЛК.

Требуется вход в аккаунт — гостевой email-путь (как было в
`StockNotification`) не переносим, потому что доставка только
в приложении и без привязки к `userId` уведомление некому показать.

## Доставка уведомлений

Не строим новую инфраструктуру. Переиспользуем существующий, уже
работающий путь:

`UserNotification` (Prisma-модель) → `GET /api/notifications/inbox`
(помечает `appDelivered=true`, отдаёт непрочитанные) → клиентский
`useNotificationsStore.fetchInbox()` (вызывается в
`AccountNotificationsSection` при маунте) → рендер в общем списке
уведомлений личного кабинета.

Все текстовые уведомления — на русском без i18n-ключей, по аналогии с
уже существующим `notifyProduct` в `stock-notify-store.ts` (тот же
прецедент в кодовой базе: серверный текст уведомлений не локализуется).

## Серверная логика триггеров

Новый модуль `lib/product-news-notify.ts`:

```ts
notifyPriceChange(productId, productTitle, oldPrice, newPrice): Promise<void>
notifyRestock(productId, productTitle): Promise<void>
notifyPromo(productId, productTitle, message?: string): Promise<void>
```

Каждая функция: находит подписчиков (`ProductNewsSubscription` по
`productId` с нужным флагом `true`), `createMany` в `UserNotification`
(`channel: 'app'`, `type` — `info` для цены/поставки, `promo` для акции).
Вызовы — best-effort, обёрнуты в try/catch на месте вызова, ошибка
уведомления не должна ронять сохранение товара.

Точки вызова:

1. **`app/api/admin/products/route.ts`, `PUT`** — после успешного
   `prisma.$transaction`, есть готовые `before` (`mapDbToProduct(current)`
   с применённым оверрайдом) и `next`/`updated` снапшоты. После коммита
   транзакции:
   - `before.price !== next.price` → `notifyPriceChange`
   - `before.stock === 0 && next.stock > 0` → `notifyRestock`

   Оговорка: для товаров с `externalId` (ERP-синхронизируемых) ручное
   изменение `stock` в этом роуте уже запрещено кодом (см. строку 72,
   `current.externalId && changes.stock !== current.stock` → 400).
   Значит restock-триггер для них сработает только если/когда ERP-синк
   снова включат и в его коде добавят такой же вызов — это отдельная
   будущая задача, вне текущего скоупа (cron сейчас выключен, см. память
   [[project_live_db_multistore_audit_2026_07_21]]).

2. **`POST /api/admin/products/[id]/notify-promo`** — новый роут,
   admin-only (`requireAdminPermission('catalog.update')`), тело
   `{ message?: string }`, вызывает `notifyPromo`. Кнопка "Уведомить
   подписчиков" на странице редактирования товара в админке.

## UI

### Виджет на странице товара

`components/ProductNewsWidget.tsx` заменяет `SubscriptionWidget` в
`ProductActions.tsx`. Показывается только авторизованным (как и раньше —
гостям не рендерится вовсе), при `product.stock === 0` тоже показывается
(в отличие от старого виджета — как раз здесь и нужна кнопка "сообщить о
поступлении").

Состояния:
- Не подписан: кнопка "Уведомить о новостях" → диалог с тремя чекбоксами
  (цена / поставка / акция, по умолчанию все включены) → подтвердить.
- Подписан: компактный блок с активными типами и кнопкой "Отписаться" /
  ссылкой "Изменить" (открывает тот же диалог на редактирование флагов).

Сохраняет паттерн `?subscribe=1` в URL + `scrollIntoView` — тот же
`id="product-subscription"` анкор, переиспользуется, чтобы не трогать
4 внешних CTA (`ProductCard`, `ProductListRow`, `cart/page.tsx`,
`AccountOrderCard`/`AccountOrdersSection`). Меняется только целевой
текст ключей (`subscription.catalogCta` → `productNews.catalogCta` и
т.д.) и иконка (RefreshCw → Bell, в духе `StockNotifyButton`).

### Личный кабинет

`components/account/AccountProductNewsSection.tsx` заменяет
`AccountSubscriptionsSection` в `app/[lang]/account/page.tsx`. Список
подписанных товаров, на каждой строке — три переключаемых чекбокса
(цена/поставка/акция) и кнопка отписаться. Без пагинации/фильтра
"показать отменённые" — у новой модели нет статуса "отменена", отписка
= удаление строки.

### API

`app/api/product-news/route.ts`:
- `GET` — список подписок текущего пользователя.
- `POST` — создать/обновить подписку на товар (`upsert` по
  `[userId, productId]`), тело `{ productId, notifyPrice?, notifyStock?, notifyPromo? }`.

`app/api/product-news/[id]/route.ts`:
- `PATCH` — изменить флаги существующей подписки (проверка владения по
  `userId`).
- `DELETE` — отписаться.

`lib/product-news-store.ts` — клиентский zustand-стор, структурно
повторяет `stock-notify-store.ts` (без email/guest-полей), с
`hydrateFromServer()` по аналогии с тем, что уже было добавлено в
`subscription-store.ts` (несохранённый WIP этой сессии — переносим идею
в новый стор, старый файл удаляется).

## Схема БД и живые данные

Одна миграция:
- добавляет `ProductNewsSubscription`
- удаляет `ProductSubscription` и `StockNotification`

Перед прогоном `prisma migrate dev`/`deploy` на живой Neon — отдельное
явное подтверждение пользователя непосредственно перед этим шагом
(правило проекта: не менять схему прод-БД без отдельного "да" на сам
факт миграции, даже если план в целом одобрен).

2 живые строки в `ProductSubscription` — не мигрируются и не
уведомляются об отмене, таблица просто дропается вместе с данными после
подтверждения. Пользователей, у которых была подписка, никто не
предупреждает (осознанное решение — 2 строки, доставка только в
приложении, дублировать разовым email не будем).

## Тестирование

- Юнит-тесты `lib/product-news-notify.ts`: подписчик с нужным флагом
  получает `UserNotification`, без флага — не получает; несколько
  подписчиков на один товар; пустой список подписчиков не падает.
- `app/api/product-news/route.test.ts`, `[id]/route.test.ts` — по
  образцу существующих `app/api/subscriptions/route.test.ts`
  (авторизация, upsert, forbidden при чужом `id`).
- `app/api/admin/products/route.test.ts` (расширить существующий) —
  PUT с изменением цены триггерит `notifyPriceChange`, PUT с
  0→>0 stock триггерит `notifyRestock`, PUT без изменений — не
  триггерит ничего.
- Убрать/адаптировать тесты, завязанные на удаляемый код:
  `lib/server-pricing.test.ts` (кейсы `forcedDiscountPercent`),
  `app/api/subscriptions/**/*.test.ts` (удалить),
  `app/api/stock-notify/**/*.test.ts` (удалить, если есть).
- Ручная проверка через браузер (skill `verify`): гостю виджет не
  показывается; авторизованный подписывается на все три типа; админ
  меняет цену товара → уведомление появляется у подписчика в ЛК;
  админ жмёт "Уведомить подписчиков" (акция) → то же для promo-флага;
  restock: товар с stock=0 → админ ставит stock>0 → уведомление.

## Вне скоупа

- ERP-синк восстановление и триггер поставки внутри него (cron сейчас
  выключен отдельно от этой задачи).
- Email-канал для новостей о товаре.
- Автоматический триггер акции от campaigns/price-groups (они не
  подключены к реальному ценообразованию — отдельная задача).
- Уведомление/компенсация 2 живых скидочных подписчиков.
