# Дорожная карта трансформации в B2B платформу

---

## ⚠️ КРИТИЧНОЕ ЗАМЕЧАНИЕ: Не ломать существующий UI

**При реализации всех изменений ОБЯЗАТЕЛЬНО сохранять обратную совместимость с розничным UI.**

### Принципы реализации:

1. **Все новые поля в типах — ОПЦИОНАЛЬНЫЕ**

    - ✅ `sku?: string` — может не быть в розничных товарах
    - ✅ `technicalSpecs?: Record<string, string>` — условное отображение
    - ❌ Не делать `sku: string` обязательным!

2. **Условный рендеринг по роли клиента**

    - Для `retail` клиентов показывать простой UI (как сейчас)
    - Для B2B ролей (`professional`, `salon`, `distributor`, `enterprise`) показывать расширенный UI
    - Пример: SKU видно только B2B, но товар работает для всех

3. **Переименование ролей делать с миграцией**

    - ❌ Просто переименовать `master` → `professional` нельзя
    - ✅ Добавить новую роль `professional`, оставить `master` как alias для совместимости
    - ✅ Обновить экспортированные данные с миграцией в DB

4. **API обратной совместимости**

    - Старые endpoints должны работать
    - Новые endpoints создавать параллельно
    - Версионировать: `/api/v1/` (старо) и `/api/v2/` (ново с B2B)

5. **Компоненты не ломать**

    - `ProductCard.tsx` должен работать со старыми и новыми данными
    - `checkout/page.tsx` не менять для розничных заказов
    - Новые секции UI добавлять в отдельные компоненты или conditional блоки

6. **Тестирование на совместимость**
    - После каждого этапа проверить:
        - Розничный клиент может заказать (как раньше)
        - B2B клиент видит новые фичи
        - Нет ошибок в консоли
        - Мобильный UI не сломан

### Чек-лист перед каждым коммитом:

```
[ ] Все новые поля в Product — опциональные?
[ ] Компоненты не выбрасывают ошибки без новых полей?
[ ] Розничный UI выглядит как раньше?
[ ] B2B UI отображается корректно?
[ ] Все тесты проходят?
[ ] Нет `undefined` в консоли?
[ ] Миграция БД подготовлена?
```

### Примеры правильной реализации:

**❌ НЕПРАВИЛЬНО:**

```tsx
// Если нет technicalSpecs — падает компонент
export function ProductSpecs({ product }: Props) {
  return <table>{product.technicalSpecs.map(...)}</table>
}
```

**✅ ПРАВИЛЬНО:**

```tsx
// Условное отображение
export function ProductSpecs({ product }: Props) {
  if (!product.technicalSpecs) return null
  return <table>{Object.entries(product.technicalSpecs).map(...)}</table>
}
```

---

## Фаза 1: Фундамент (Неделя 1-2)

### Этап 1.1: Расширение типов данных и моделей

**Файлы для изменения:** `data/products.ts`, `lib/customer-segmentation.ts`

**Задачи:**

1. Добавить в интерфейс `Product`:

    - `sku: string` — артикул товара
    - `technicalSpecs?: Record<string, string>` — технические характеристики
    - `certificates?: string[]` — ссылки на сертификаты
    - `bulkPricingTiers?: { quantity: number, pricePerUnit: number }[]` — матрица скидок за объём
    - `minOrderQuantity: number` — общий минимум (переделать логику)
    - `unitOfMeasure: string` — единица измерения (шт, л, кг и т.д.)
    - `packagingSize?: number` — размер упаковки
    - `compatibleEquipment?: string[]` — совместимое оборудование

2. Добавить роль в `CustomerRole`:

    - Переименовать `master` → `professional` (подходит лучше)
    - Добавить `enterprise` (крупные клиенты)
    - Оставить `salon` и `distributor`

3. Расширить `CUSTOMER_ROLE_CONFIG`:
    - Добавить поле `paymentTerms: number[]` (30, 60, 90 дней)
    - Добавить `accountManagerRequired: boolean`
    - Добавить `apiAccessAllowed: boolean`
    - Добавить `requiresOrderApproval: boolean`

**Ожидаемый результат:** Типизация для B2B данных готова

---

### Этап 1.2: Структура данных для платежей и компаний

**Файлы для создания:** `lib/company-store.ts`, `lib/invoices-store.ts`

**Задачи:**

1. Создать `lib/company-store.ts` с Zustand хранилищем:

    ```
    CompanyProfile {
      companyId: string
      companyName: string
      taxId: string
      registrationNumber: string
      address: string
      city: string
      country: string
      contactPhone: string
      accountManagerId?: string
      paymentTermDays: 30 | 60 | 90
      creditLimit: number
      usedCredit: number
      teamMembers: TeamMember[]
      createdAt: Date
    }

    TeamMember {
      userId: string
      email: string
      role: 'viewer' | 'buyer' | 'manager' | 'admin'
      permissions: string[]
      addedAt: Date
    }
    ```

2. Создать `lib/invoices-store.ts` с типами:

    ```
    Invoice {
      invoiceId: string
      companyId: string
      orderId: string
      amount: number
      tax: number
      status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'
      issuedDate: Date
      dueDate: Date
      paymentRecords: PaymentRecord[]
      notes?: string
    }

    PaymentRecord {
      amount: number
      date: Date
      method: string
      reference: string
    }
    ```

**Ожидаемый результат:** Хранилища для управления компаниями и счётами готовы

---

## Фаза 2: Управление компанией и команде (Неделя 2-3)

### Этап 2.1: Переделка аккаунта (мультиюзерность)

**Файлы для изменения:** `lib/auth.ts`, `app/account/page.tsx`

**Задачи:**

1. Расширить `User` интерфейс в `lib/auth.ts`:

    ```
    User {
      // старое
      id: string
      email: string
      role: CustomerRole (→ переименовать в customerRole)

      // новое
      companyId?: string
      companyName?: string
      teamRole: 'viewer' | 'buyer' | 'manager' | 'admin'
      approvalRequired: boolean
      auditLoggingEnabled: boolean
    }
    ```

2. Изменить страницу `/app/account/page.tsx`:
    - Добавить вкладку "Команда" с листом сотрудников
    - Кнопка "Пригласить пользователя" (отправка email)
    - Управление правами каждого пользователя
    - История действий (audit log) последних 100 событий

**Ожидаемый результат:** Мультиюзерские аккаунты работают

---

### Этап 2.2: Управление профилем компании

**Файлы для создания:** `app/account/company/page.tsx`, `components/CompanyProfileForm.tsx`

**Задачи:**

1. Создать страницу `/app/account/company/page.tsx` с формой:

    - Название компании, ИНН, регистрационный номер
    - Адрес, город, страна
    - Контактный телефон
    - Выбор способов оплаты (способы + сроки платежа)
    - Лимит кредита (если применяется)
    - Выплата счётов

2. Создать компонент `CompanyProfileForm.tsx`:
    - Валидация ИНН/регистрации
    - Автосохранение в `company-store`

**Ожидаемый результат:** Компании могут управлять своим профилем

---

## Фаза 3: Система платежей (Неделя 3-4)

### Этап 3.1: Генерация счётов

**Файлы для изменения:** `app/checkout/page.tsx`, `lib/invoices-store.ts`

**Задачи:**

1. Изменить чекаут для B2B:

    - Если `paymentTermDays > 0`: вместо платежа → генерировать счёт
    - Если `paymentTermDays = 0`: обычная предоплата
    - Рассчитать дату платежа: `currentDate + paymentTermDays`

2. Добавить логику в `lib/invoices-store.ts`:

    - Функция `createInvoice(orderId, companyId, amount, taxRate)`
    - Функция `recordPayment(invoiceId, amount, method)`
    - Функция `checkOverdueInvoices()` — найти просрочки

3. На странице чекаута добавить вывод:
    - "Счёт выдан" вместо "Платёж получен"
    - Дата платежа
    - Реквизиты для оплаты

**Ожидаемый результат:** Счёты генерируются автоматически

---

### Этап 3.2: Управление счётами в аккаунте

**Файлы для создания:** `app/account/invoices/page.tsx`, `components/InvoiceList.tsx`, `components/InvoiceViewer.tsx`

**Задачи:**

1. Создать страницу `/app/account/invoices/page.tsx`:

    - Таблица счётов (номер, сумма, статус, срок платежа)
    - Фильтры: по статусу, по датам
    - Сортировка: новые первыми, просрочки первыми

2. Создать `InvoiceList.tsx`:

    - Иконка статуса (оплачено, просрочено, ожидает)
    - Ссылка на просмотр счёта

3. Создать `InvoiceViewer.tsx`:
    - PDF-представление счёта
    - История платежей
    - Кнопка записи платежа (для admin)
    - Кнопка скачивания PDF

**Ожидаемый результат:** Юзеры видят и управляют счётами

---

## Фаза 4: Каталог и спецификации (Неделя 4-5)

### Этап 4.1: Техспецификации в каталоге

**Файлы для изменения:** `data/products.ts`, `components/ProductCard.tsx`, `components/ProductPageContent.tsx`

**Задачи:**

1. Добавить в `data/products.ts` для каждого товара:

    - `sku: string` — артикул
    - `technicalSpecs: { volumeRange: string, type: string, country: string, ... }`
    - `certificates: ['ISO-9001', 'DERM-TEST', ...]`
    - `bulkPricingTiers: [{ quantity: 10, pricePerUnit: 2300 }, ...]`
    - `compatibleEquipment: ['SkinPro-X', 'MicroBlast-3000']`

2. Изменить `ProductCard.tsx`:

    - Показывать SKU под названием (для B2B)
    - Добавить иконку "Спецификация" → клик открывает модал

3. Изменить `ProductPageContent.tsx`:
    - Новая секция "Технические характеристики" с таблицей
    - Новая секция "Сертификаты" со ссылками на PDF
    - Новая секция "Матрица цен" (объём → цена за единицу)
    - Новая секция "Совместимое оборудование"

**Ожидаемый результат:** Профессионалы видят нужные им характеристики

---

## Фаза 5: Аналитика и история (Неделя 5-6)

### Этап 5.1: Аналитика закупок

**Файлы для создания:** `app/account/analytics/page.tsx`, `lib/analytics-service.ts`

**Задачи:**

1. Создать `lib/analytics-service.ts`:

    ```
    getPurchaseHistory(companyId, dateFrom, dateTo)
    getTrendingProducts(companyId, months: number)
    getRepurchaseOpportunities(companyId) // товары, которые покупали раньше
    getMonthlySpending(companyId, months: number)
    getAverageOrderValue(companyId)
    getReorderNotifications(companyId) // что скоро кончится
    ```

2. Создать страницу `/app/account/analytics/page.tsx`:
    - График расходов по месяцам (Chart.js или Recharts)
    - Таблица ТОП-10 товаров (объём, сумма)
    - Таблица рекомендаций переупорядочивания
    - Среднее время между заказами по товарам
    - Экспорт отчёта (CSV/Excel)

**Ожидаемый результат:** Клиенты видят паттерны своих покупок

---

### Этап 5.2: Журнал действий (audit log)

**Файлы для создания:** `lib/audit-log-store.ts`, `app/account/audit/page.tsx`

**Задачи:**

1. Создать `lib/audit-log-store.ts`:

    ```
    AuditEntry {
      id: string
      companyId: string
      userId: string
      action: 'order_created' | 'order_approved' | 'payment_recorded' | 'user_invited' | ...
      details: any
      timestamp: Date
      ipAddress?: string
    }
    ```

2. Логировать везде:

    - В `checkout/page.tsx`: action = 'order_created'
    - В `invoices-store.ts`: action = 'payment_recorded'
    - В `company-store.ts`: action = 'user_invited', 'user_removed'
    - В `admin/page.tsx`: action = 'order_approved'

3. Создать страницу `/app/account/audit/page.tsx`:
    - Таблица: время, пользователь, действие, подробности
    - Фильтры: по пользователю, по типу действия
    - Сортировка по времени

**Ожидаемый результат:** Полная прозрачность всех действий в компании

---

## Фаза 6: Интеграция и API (Неделя 6-7)

### Этап 6.1: REST API для синхронизации

**Файлы для создания:** `app/api/v1/products/route.ts`, `app/api/v1/orders/route.ts`, `app/api/v1/invoices/route.ts`

**Задачи:**

1. Создать `app/api/v1/products/route.ts` (GET):

    ```
    GET /api/v1/products
    Query: skip, limit, category, search
    Response: { items: Product[], total: number }
    ```

2. Создать `app/api/v1/orders/route.ts` (GET, POST):

    ```
    GET /api/v1/orders — история заказов компании
    POST /api/v1/orders — создание заказа через API
    ```

3. Создать `app/api/v1/invoices/route.ts` (GET, POST):

    ```
    GET /api/v1/invoices — список счётов
    POST /api/v1/invoices/:id/payments — запись платежа
    ```

4. Добавить аутентификацию:
    - API ключ в профиле компании
    - Middleware для проверки ключа

**Ожидаемый результат:** Клиенты могут интегрировать каталог в свой софт

---

### Этап 6.2: Webhook-уведомления

**Файлы для создания:** `lib/webhooks-store.ts`, `lib/webhook-sender.ts`

**Задачи:**

1. Создать `lib/webhooks-store.ts`:

    ```
    WebhookEndpoint {
      id: string
      companyId: string
      url: string
      events: ['order.created', 'order.shipped', 'payment.recorded']
      isActive: boolean
      secret: string (для подписи)
    }
    ```

2. Создать `lib/webhook-sender.ts`:

    - Функция `sendWebhook(event, payload, endpoints[])`
    - Retry логика (до 3 раз)
    - Логирование попыток отправки

3. Вызывать webhook в важных местах:

    - После создания заказа
    - При смене статуса заказа
    - При записи платежа

4. Добавить страницу для управления webhooks:
    - `/app/account/integrations/webhooks`
    - Добавить/удалить webhook
    - История доставок

**Ожидаемый результат:** Клиентский софт получает live-уведомления

---

## Фаза 7: Улучшение UX и поддержки (Неделя 7-8)

### Этап 7.1: RFQ (Request for Quote) система

**Файлы для создания:** `app/request-quote/page.tsx`, `lib/rfq-store.ts`

**Задачи:**

1. Создать `lib/rfq-store.ts`:

    ```
    RFQRequest {
      id: string
      companyId: string
      items: { productId: string, quantity: number }[]
      notes: string
      status: 'pending' | 'quoted' | 'accepted' | 'rejected'
      quote?: { validUntil: Date, totalPrice: number, terms: string }
      createdAt: Date
    }
    ```

2. Создать страницу `/app/request-quote/page.tsx`:

    - Добавить товары в запрос
    - Указать количество
    - Добавить примечание
    - Отправить запрос

3. В админке добавить:
    - Страница с RFQ запросами
    - Форма для создания предложения (quote)
    - Отправка quote клиенту

**Ожидаемый результат:** Клиенты запрашивают спецпредложения на большие объёмы

---

### Этап 7.2: Чат и выделенная поддержка B2B

**Файлы для создания:** `components/B2BChat.tsx`, `app/api/account-manager/route.ts`

**Задачи:**

1. Создать простой чат-компонент `B2BChat.tsx`:

    - Фиксированное окно справа
    - Отправка сообщения аккаунт-менеджеру
    - История диалогов

2. Создать `app/api/account-manager/route.ts`:

    - POST: отправить сообщение
    - GET: получить историю
    - Уведомление аккаунт-менеджеру (email)

3. В аккаунте добавить:
    - Информацию о аккаунт-менеджере
    - Прямой контакт

**Ожидаемый результат:** Персональная поддержка для B2B

---

### Этап 7.3: Оптимизация ценообразования

**Файлы для изменения:** `data/products.ts`, `components/ProductCard.tsx`, `lib/customer-segmentation.ts`

**Задачи:**

1. Переделать логику цен в `lib/customer-segmentation.ts`:

    ```
    calculatePrice(product, customerRole, quantity) {
      // 1. Базовая цена по роли
      let price = getRolePrice(product.price, customerRole)

      // 2. Скидка за объём (bulkPricingTiers)
      const tier = product.bulkPricingTiers?.find(t => quantity >= t.quantity)
      if (tier) price = tier.pricePerUnit

      // 3. Прогрессивная скидка (опционально)
      // ...

      return price
    }
    ```

2. На `ProductCard.tsx` показывать:

    - Базовую цену (по роли)
    - Информацию "При покупке 10+: X₽ за шт"

3. В корзине при изменении количества пересчитывать цену

**Ожидаемый результат:** Прозрачное ценообразование с поощрением больших заказов

---

## Фаза 8: Финал и полировка (Неделя 8+)

### Этап 8.1: Документация и обучение

**Задачи:**

1. Написать docs для B2B клиентов:

    - Как использовать API
    - Как работают webhook'и
    - Как читать счёты
    - Структура CSV-экспорта

2. Создать видео-туториалы (или гифки):

    - Как добавить пользователя в компанию
    - Как отправить RFQ
    - Как отследить платёж

3. Добавить FAQ раздел

### Этап 8.2: Тестирование и оптимизация

**Задачи:**

1. Написать E2E тесты для ключевых сценариев B2B:

    - Создание аккаунта компании
    - Заказ с отсрочкой платежа
    - Управление командой
    - Генерация счёта

2. Тестирование производительности API

3. Тестирование на разных браузерах/девайсах

4. A/B тестирование новых фич

---

## Приоритизация по importante

**Критичные (необходимо сделать сразу):**

1. Расширение типов данных (Фаза 1.1)
2. Мультиюзерные аккаунты (Фаза 2.1)
3. Система счётов (Фаза 3.1)
4. Управление счётами (Фаза 3.2)

**Очень важно (следующее):** 5. Техспеки товаров (Фаза 4.1) 6. Аналитика (Фаза 5.1) 7. API (Фаза 6.1)

**Важно (потом):** 8. RFQ система (Фаза 7.1) 9. Чат поддержки (Фаза 7.2) 10. Webhook'и (Фаза 6.2)

**Улучшения (когда будет время):** 11. Audit log (Фаза 5.2) 12. Динамическое ценообразование (Фаза 7.3)

---

## Оценка трудозатрат

-   **Фаза 1:** 2-3 дня
-   **Фаза 2:** 3-4 дня
-   **Фаза 3:** 3-4 дня
-   **Фаза 4:** 3-4 дня
-   **Фаза 5:** 3-4 дня
-   **Фаза 6:** 3-4 дня
-   **Фаза 7:** 2-3 дня
-   **Фаза 8:** 2-3 дня

**Итого:** 6-8 недель на одного разработчика (или 2-3 недели для команды из 2-3 человек)

---

## Переменные/конфиги для обновления

-   `.env` — API ключи для сервисов генерации PDF
-   `tailwind.config.cjs` — если добавляются новые компоненты (charts, etc)
-   `package.json` — новые зависимости:
    -   `recharts` (графики)
    -   `pdfkit` или `jsPDF` (генерация PDF)
    -   `xlsx` (экспорт Excel)
    -   `nodemailer` (уже есть, для email уведомлений)
