# Locale Config — реальные настройки локализации

**Дата:** 2026-07-13
**Статус:** approved, готов к implementation plan

## Проблема

`/admin/config/locale` — форма-пустышка. `lib/locale-settings-store.ts` (zustand + persist) никто в приложении не читает: язык/валюта/таймзона/формат даты/формат цены сохраняются только в localStorage админа и ни на что не влияют.

Реальность:
- Валюта — везде EUR, конвертации нет и не будет (`lib/utils.ts:formatEuro` хардкодит `€`, Stripe checkout хардкодит `currency:'eur'`).
- Формат даты неявно следует за языком UI визитора (`formatDate` → `toLocaleDateString(locale)`), а не за глобальной настройкой.
- Таймзона захардкожена `Europe/Riga` в двух местах (email-уведомления о заказе, `app/api/orders/route.ts`).
- Язык по умолчанию для новых гостей захардкожен `'ru'` (`lib/i18n-context.tsx`).

## Решение по объёму (согласовано с пользователем)

1. **Валюта** — убрать селектор из админки, оставить статичную строку "EUR (€)". Никакой конвертации, никакого выбора.
2. **Формат даты** — сделать реальным глобальным паттерном (DD.MM.YYYY / MM/DD/YYYY / YYYY-MM-DD), применяется везде на сайте/в письмах, **кроме** вызовов `formatDate` с явными `options` (например длинная дата на странице блога — `{year:'numeric', month:'long', day:'numeric'}`) — те остаются locale-driven как есть.
3. **Часовой пояс** — влияет **только** на серверные артефакты (email-уведомления о заказе). Клиентские страницы продолжают показывать время в таймзоне браузера визитора — это не трогаем.
4. **Язык по умолчанию** — реальный дефолт для гостей без cookie `eshop_language` (сейчас хардкод `'ru'`).
5. **Формат цены** (символ до/после числа) — становится реальным для `formatEuro`.

## Архитектура

### Хранилище
`lib/locale-config-server-store.ts` — KV-бэкенд (`prisma.keyValueSetting`, ключ `'locale-config'`), по образцу `lib/bonus-config-server-store.ts`:
```ts
type LocaleConfig = {
  defaultLanguage: 'ru' | 'en' | 'lv'
  dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timezone: string // из существующего списка TIMEZONES
  priceFormat: 'symbol_before' | 'symbol_after'
}
```
`getLocaleConfig()` / `saveLocaleConfig(partial)` — с дефолтами и нормализацией, как у bonus-config-server-store.

### API
- `app/api/locale-config/route.ts` — публичный `GET` (нужен и клиенту для форматирования, и серверу — не для этого файла, сервер читает store напрямую).
- `app/api/admin/locale-config/route.ts` — `GET`/`PUT`, `requireAdmin()`, по образцу `app/api/admin/bonus-config/route.ts`.

### Общий форматтер (клиент + сервер)
`lib/date-format.ts` (новый, чистые функции, без `'server-only'` — используется в обоих контекстах):
- `formatDateWithPattern(date: Date, pattern: DateFormatOption): string` — ручное форматирование day/month/year с паддингом нулями, без Intl (паттерн — не язык).

### Клиент
- `lib/utils.ts`:
  - Модуль хранит мутируемый `let localeFormatConfig = DEFAULT_LOCALE_CONFIG` + `export function setLocaleFormatConfig(config)`.
  - `formatEuro(value, locale)` — символ фиксирован `€`, но позиция (до/после) берётся из `localeFormatConfig.priceFormat`. Сигнатура не меняется.
  - `formatDate(value, locale, options?)` — если `options` передан явно → без изменений (`toLocaleDateString(locale, options)`). Если `options` не передан → `formatDateWithPattern(new Date(value), localeFormatConfig.dateFormat)`. Сигнатура не меняется — 13 вызывающих файлов не трогаем.
- `app/providers.tsx` — новый `LocaleConfigSync` (компонент-пустышка, как `BonusConfigSync`): `fetch('/api/locale-config')` один раз на монтировании всего приложения → `setLocaleFormatConfig(config)`.
- `lib/i18n-context.tsx` — `I18nProvider`: если в localStorage нет `eshop_language`, вместо хардкода `'ru'` фетчит `/api/locale-config` и берёт `defaultLanguage`. Если cookie/localStorage уже есть — фетч не делается (без лишней задержки для вернувшихся визиторов).

### Сервер
`app/api/orders/route.ts` — `sendOrderConfirmationEmail` и `sendAdminOrderNotificationEmail`: вместо хардкода `Europe/Riga` + `toLocaleString('ru-RU', {timeZone})` — читают `getLocaleConfig()` напрямую (серверный импорт, не HTTP), берут `timezone` для `Intl`-опции и `dateFormat` через `formatDateWithPattern` для даты, время (HH:mm) — отдельно, в той же таймзоне.

### Админка
`app/admin/config/locale/page.tsx`:
- Убрать секцию "Валюта" (Select + preview символа) целиком, заменить статичной строкой `EUR (€)`.
- Убрать импорт `useLocaleSettingsStore` — вместо него страница делает свой `GET /api/admin/locale-config` при монтировании (как `app/admin/bonus/page.tsx` и `app/admin/config/shipping/page.tsx`) — не зависит от гонки с гидратацией общего клиентского кэша.
- Сохранение — `PUT /api/admin/locale-config`.

`lib/locale-settings-store.ts` — **удалить файл целиком** (zustand-стор больше не нужен, ни один компонент его не импортирует после рефакторинга).

## Данные: поток

```
Админ меняет настройки → PUT /api/admin/locale-config → KeyValueSetting('locale-config')
                                                              │
                          ┌───────────────────────────────────┼──────────────────────────┐
                          ▼                                   ▼                          ▼
              LocaleConfigSync (клиент,               I18nProvider (клиент,     getLocaleConfig()
              на старте приложения)                    только новым гостям)      (сервер, при отправке
                          │                                   │                   email о заказе)
                          ▼                                   ▼                          ▼
              formatDate/formatEuro                  defaultLanguage для            timezone + dateFormat
              по всему сайту                          новых визиторов                 в письме
```

## Обработка ошибок
- Все фетчи — `.catch(() => {})`, при недоступности сервера остаются дефолты (`DD.MM.YYYY`, `Europe/Riga`, `symbol_before`, `'ru'`) — идентично текущему поведению, деградация без краша.
- `getLocaleConfig()` на сервере — тот же паттерн try/catch → дефолт, что и `getBonusProgramConfig()`.

## Тестирование
- `lib/date-format.test.ts` (новый) — юнит-тесты `formatDateWithPattern` на все 3 паттерна + граничные случаи (однозначные день/месяц с паддингом, полночь/конец года).
- `app/api/admin/locale-config/route.test.ts` (новый) — мокаем `@/lib/prisma` (`keyValueSetting.findUnique/upsert`) и `@/lib/server-auth` (`requireAdmin`), по образцу `app/api/auth/register-card/route.test.ts`: GET без авторизации → 403, PUT сохраняет и нормализует, GET после PUT возвращает сохранённое. Это же покрывает `lib/locale-config-server-store.ts` — отдельный тест-файл на сам store не нужен (route-тест и есть интеграционный тест store).
- `lib/utils.test.ts` (новый, либо расширение существующего, если `lib/utils.ts` уже имеет тест-файл — проверить `Glob lib/utils.test.ts` перед созданием) — `formatDate`/`formatEuro` до и после `setLocaleFormatConfig()`: явные `options` игнорируют конфиг, дефолтный вызов без `options` следует конфигу; `formatEuro` меняет позицию символа по `priceFormat`.
- Существующие 13 вызовов `formatDate` / 36 вызовов `formatEuro` — сигнатуры не меняются, регрессионных тестов на них нет и не требуется (нечего ломать на уровне контракта).

## Вне рамок (явно)
- Конвертация валют / мультивалютный Stripe-чекаут.
- Принудительная таймзона на клиентских (браузерных) страницах.
- Expiry бонусных баллов (`pointsExpiryDays`) — отдельная тема, не трогается.
- `formatDate`-вызовы с явными `options` (длинные даты, блог) — остаются locale-driven, не подчиняются глобальному паттерну.
