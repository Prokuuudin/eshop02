# Бонус-блок на странице товара + починка начисления баллов

Дата: 2026-07-03. Статус: одобрено.

## Цель

Показать залогиненному клиенту его бонусы над кнопкой «в корзину» на странице товара
и сделать так, чтобы бонусы реально начислялись: сейчас `Product.bonusRate` равен NULL
у всех 2231 активных товаров, поэтому корзина, чекаут и серверный пересчёт начисляют 0.

## Бизнес-правило

- Начисляется **0.5% от суммы каждого заказа** (`earnRatePercent = 0.5`).
- 1 балл = 1 €, баллы целые (`User.bonusPoints Int`, схема БД не меняется).
- Следствие: заказ €60 → 0 баллов, €100 → 1 балл. Реальные баллы — на заказах от ~€100.
- Если у товара задан `bonusRate` — он приоритетнее процента (баллы за единицу, как сейчас).
- Округление `Math.round` один раз по сумме заказа, не по позициям.

## UI: компонент ProductBonusInfo

Новый клиентский компонент `components/ProductBonusInfo.tsx`, рендерится в
`ProductActions` над строкой с кнопкой «в корзину». Стиль — янтарная плашка как в
корзине (`app/cart/page.tsx`), BEM-класс `product-detail__bonus`.

Видимость:
- до гидрации auth-store — `null` (без flash);
- гостю — `null` (гость не видит и цен);
- при `bonusProgram.enabled = false` — `null`.

Содержимое (две строки):
1. Баланс: «Бонусный баланс: N баллов» — `user.bonusPoints`,
   ключи `account.bonus.balance` + `cart.bonus.unit`.
2. Начисление:
   - `product.bonusRate > 0` → «Начислится после заказа: +X баллов»
     (`checkout.bonus.willEarn`), X = bonusRate за единицу;
   - иначе → «Начисляется 0.5% от суммы каждого заказа»
     (`bonus.section.earnRate`, `{rate}` из конфига).

Новые ключи переводов не нужны — все три строки уже есть в ru/en/lv.

## Расчёт и начисление

Новый модуль `lib/bonus-program.ts`:
- Туда переезжают `BonusProgramConfig` и `DEFAULT_BONUS_PROGRAM_CONFIG` из
  `lib/admin-store.ts` (re-export оттуда для совместимости). Причина: admin-store —
  zustand/persist, серверному коду его импортировать нельзя.
- `earnRatePercent: 0.5` в дефолте.
- Хелпер `calcItemBonus(price, quantity, bonusRate?)`:
  `bonusRate > 0 ? bonusRate * qty : price * qty * earnRatePercent / 100`.
  Возвращает дробное; округление делает вызывающий по сумме заказа.

Применение fallback в 4 местах (единый хелпер):
- `app/cart/page.tsx` (`bonusToEarn`);
- `app/checkout/page.tsx` (`bonusToEarn`);
- `lib/server-pricing.ts` (`bonusEarnedBase`) — авторитетный серверный пересчёт;
- страница товара (отображение).

Источник процента — `DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent`, одинаковый на
клиенте и сервере. Конфиг админки живёт в localStorage каждого браузера и на
начисление не влияет.

## Миграция persist admin-store

`lib/admin-store.ts` persist без `version` — в localStorage существующих браузеров
лежит `earnRatePercent: 5`, оно перекроет новый дефолт в BonusSection и админке.
Добавить `version: 1` + `migrate`: сброс `bonusProgram` на новый дефолт.

## Тесты

`lib/server-pricing.test.ts`, новые кейсы (TDD):
- fallback-начисление при NULL `bonusRate` (0.5% от суммы);
- смешанный заказ (часть товаров с `bonusRate`, часть fallback);
- пропорциональное урезание начисления при списании баллов — не ломается;
- округление по сумме заказа (€60 → 0, €100 → 1).

## Вне скоупа

- Изменения схемы БД и данных (`bonusRate` остаётся NULL).
- Серверизация конфига бонусной программы (таблица `KeyValueSetting` есть — отдельная задача).
- Отображение бонусов гостям; скрытие цен уже реализовано и не трогается.
- `minOrderForEarn`, `maxEarnPerOrder` — как игнорировались, так и игнорируются.
