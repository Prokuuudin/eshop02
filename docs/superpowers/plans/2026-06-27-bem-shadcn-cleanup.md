# BEM/Shadcn Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить 59 сырых `<select>`/`<input type="checkbox">` в основном в `app/admin/**` на shadcn `Select`/`Checkbox`, и добавить BEM-класс на корневые элементы 6 компонентов, где он отсутствует.

**Architecture:** Механическая замена 1:1 по уже established в проекте паттернам (shadcn `Select` как в `components/Reviews.tsx`, shadcn `Checkbox` как в `components/CartDrawer.tsx`). Поведение (value/onChange-семантика) не меняется. Никакой новой абстракции не вводится.

**Tech Stack:** Next.js App Router, React, TypeScript, shadcn/ui (`@radix-ui/react-select`, `@radix-ui/react-checkbox`), Tailwind.

## Global Constraints

- Семантика value/onChange сохраняется 1:1 — это рефакторинг разметки, не изменение бизнес-логики.
- shadcn `Select`: `<Select value={x} onValueChange={setX}><SelectTrigger className="..."><SelectValue /></SelectTrigger><SelectContent>{...<SelectItem value="...">...</SelectItem>}</SelectContent></Select>`. Существующий `className` raw-select переносится на `SelectTrigger`.
- shadcn `Checkbox`: `<Checkbox checked={x} onCheckedChange={setX} />`. Сигнатура `onCheckedChange: (checked: boolean) => void` — обёртка в `components/ui/checkbox.tsx` уже коэрсит `checked === true` сама, можно передавать `setX` напрямую если `setX: (v: boolean) => void`, либо `(checked) => setX(checked === true)`, если исходный onChange ожидал что-то иное.
- Indeterminate-чекбоксы ("выбрать все"): `checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}` вместо `ref={(el) => { if (el) el.indeterminate = ... }}`.
- Импорты: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'` и/или `import { Checkbox } from '@/components/ui/checkbox'` — добавляются туда, где нужны, рядом с существующими импортами `Button`/`Input` из `@/components/ui/*`.
- BEM-класс на корневой элемент добавляется ПЕРВЫМ в списке classNames, существующие Tailwind-утилиты не трогаются.
- Каждая задача — свой коммит. После каждой задачи: `npx tsc --noEmit` + ручная проверка страницы в dev-сервере (открыть, открыть select, выбрать опцию, поставить/снять галку, если есть "выбрать все" — проверить промежуточное состояние).
- Вне скоупа: любой визуальный редизайн сверх того, что shadcn даёт по умолчанию; изменение бизнес-логики.

---

### Task 1: Заказы — `app/admin/orders/page.tsx`, `app/admin/orders/new/page.tsx`

**Files:**
- Modify: `app/admin/orders/page.tsx`
- Modify: `app/admin/orders/new/page.tsx`

- [ ] **Step 1: Импорты — `app/admin/orders/page.tsx`**

```diff
 import { Button } from '@/components/ui/button'
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
+import { Checkbox } from '@/components/ui/checkbox'
 import { Search, Printer, Download } from 'lucide-react'
```
(строки 9-11)

- [ ] **Step 2: Фильтр статуса (строки ~463-474)**

```diff
-            <select
-              value={statusFilter}
-              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
-              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
-            >
-              <option value="all">Все статусы</option>
-              {STATUS_LIST.map((s) => (
-                <option key={s} value={s}>
-                  {STATUS_LABELS[s]}
-                </option>
-              ))}
-            </select>
+            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}>
+              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">Все статусы</SelectItem>
+                {STATUS_LIST.map((s) => (
+                  <SelectItem key={s} value={s}>
+                    {STATUS_LABELS[s]}
+                  </SelectItem>
+                ))}
+              </SelectContent>
+            </Select>
```

- [ ] **Step 3: Фильтр оплаты (строки ~475-485)**

```diff
-            <select
-              value={paymentFilter}
-              onChange={(e) => setPaymentFilter(e.target.value)}
-              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
-            >
-              <option value="all">Все оплаты</option>
-              <option value="unpaid">Не оплачен</option>
-              <option value="pending">Ожидает оплаты</option>
-              <option value="paid">Оплачен</option>
-              <option value="failed">Ошибка оплаты</option>
-            </select>
+            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
+              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">Все оплаты</SelectItem>
+                <SelectItem value="unpaid">Не оплачен</SelectItem>
+                <SelectItem value="pending">Ожидает оплаты</SelectItem>
+                <SelectItem value="paid">Оплачен</SelectItem>
+                <SelectItem value="failed">Ошибка оплаты</SelectItem>
+              </SelectContent>
+            </Select>
```

- [ ] **Step 4: Фильтр доставки (строки ~486-495)**

```diff
-            <select
-              value={deliveryFilter}
-              onChange={(e) => setDeliveryFilter(e.target.value)}
-              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto"
-            >
-              <option value="all">Все доставки</option>
-              <option value="courier">Курьер</option>
-              <option value="pickup">Самовывоз</option>
-              <option value="post">Почта</option>
-            </select>
+            <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
+              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground w-full sm:w-auto">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">Все доставки</SelectItem>
+                <SelectItem value="courier">Курьер</SelectItem>
+                <SelectItem value="pickup">Самовывоз</SelectItem>
+                <SelectItem value="post">Почта</SelectItem>
+              </SelectContent>
+            </Select>
```

- [ ] **Step 5: "Выбрать все" с indeterminate (строки ~500-508)**

```diff
           <label className="flex items-center gap-1.5 cursor-pointer mr-2">
-            <input
-              type="checkbox"
-              checked={isAllSelected}
-              ref={(el) => { if (el) el.indeterminate = isSomeSelected && !isAllSelected }}
-              onChange={toggleSelectAll}
-              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-primary cursor-pointer"
-            />
+            <Checkbox
+              checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
+              onCheckedChange={toggleSelectAll}
+            />
             <span className="text-xs text-muted-foreground">Выбрать все</span>
           </label>
```

(`toggleSelectAll` уже определена как `() => void` без аргумента — `onCheckedChange` передаст ей `boolean | 'indeterminate'`, но функция его игнорирует, так что сигнатура совместима как есть)

- [ ] **Step 6: Bulk-статус select (строки ~546-555)**

```diff
-            <select
-              value={bulkStatus}
-              onChange={(e) => setBulkStatus(e.target.value as OrderStatus | '')}
-              className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground"
-            >
-              <option value="">Изменить статус...</option>
-              {STATUS_LIST.map((s) => (
-                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
-              ))}
-            </select>
+            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as OrderStatus | '')}>
+              <SelectTrigger className="rounded-lg border border-primary/50 dark:border-primary bg-card px-3 py-1.5 text-sm text-foreground">
+                <SelectValue placeholder="Изменить статус..." />
+              </SelectTrigger>
+              <SelectContent>
+                {STATUS_LIST.map((s) => (
+                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
+                ))}
+              </SelectContent>
+            </Select>
```

(пустая опция `""` у shadcn `Select` не работает как placeholder-значение — заменена на `SelectValue placeholder="..."`, которая показывается когда `bulkStatus === ''`)

- [ ] **Step 7: Чекбокс выбора заказа в строке списка (строки ~589-596)**

```diff
-                  <input
-                    type="checkbox"
-                    checked={selectedIds.has(order.id)}
-                    onChange={() => toggleSelect(order.id)}
-                    onClick={(e) => e.stopPropagation()}
-                    aria-label={`Выбрать заказ ${order.id}`}
-                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-primary cursor-pointer"
-                  />
+                  <Checkbox
+                    checked={selectedIds.has(order.id)}
+                    onCheckedChange={() => toggleSelect(order.id)}
+                    onClick={(e) => e.stopPropagation()}
+                    aria-label={`Выбрать заказ ${order.id}`}
+                  />
```

- [ ] **Step 8: Импорты и select формы оплаты — `app/admin/orders/new/page.tsx`**

```diff
 import { Button } from '@/components/ui/button'
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 7)

Способ оплаты (строки ~591-597, `selectCls` — существующая константа со стилем):
```diff
                 <Field label="Способ оплаты">
-                  <select
-                    value={paymentMethod}
-                    onChange={(e) => setPaymentMethod(e.target.value)}
-                    className={selectCls}
-                  >
-                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
-                  </select>
+                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
+                    <SelectTrigger className={selectCls}>
+                      <SelectValue />
+                    </SelectTrigger>
+                    <SelectContent>
+                      {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
+                    </SelectContent>
+                  </Select>
                 </Field>
```

Статус оплаты (строки ~599-608):
```diff
                 <Field label="Статус оплаты">
-                  <select
-                    value={paymentStatus}
-                    onChange={(e) => setPaymentStatus(e.target.value as 'unpaid' | 'paid')}
-                    className={selectCls}
-                  >
-                    <option value="unpaid">Не оплачен</option>
-                    <option value="paid">Оплачен</option>
-                  </select>
+                  <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as 'unpaid' | 'paid')}>
+                    <SelectTrigger className={selectCls}>
+                      <SelectValue />
+                    </SelectTrigger>
+                    <SelectContent>
+                      <SelectItem value="unpaid">Не оплачен</SelectItem>
+                      <SelectItem value="paid">Оплачен</SelectItem>
+                    </SelectContent>
+                  </Select>
                 </Field>
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок (известная pre-existing ошибка в `app/api/orders/route.test.ts` не связана с этой задачей)

- [ ] **Step 10: Ручная проверка**

Run: `npm run dev`, открыть `/admin/orders` — проверить 3 select-фильтра, чекбокс "выбрать все" (включая промежуточное indeterminate-состояние при частичном выборе), чекбоксы строк, bulk-статус select. Открыть `/admin/orders/new` — проверить 2 select.

- [ ] **Step 11: Commit**

```bash
git add app/admin/orders/page.tsx app/admin/orders/new/page.tsx
git commit -m "refactor(admin): replace raw select/checkbox with shadcn in orders pages"
```

---

### Task 2: Конфиг — `app/admin/config/locale/page.tsx`, `app/admin/config/shipping/page.tsx`

**Files:**
- Modify: `app/admin/config/locale/page.tsx`
- Modify: `app/admin/config/shipping/page.tsx`

Оба файла используют общую константу `SELECT_CLASS` для стиля — она переносится на `SelectTrigger` без изменений.

- [ ] **Step 1: Импорт — `app/admin/config/locale/page.tsx`**

```diff
 import { Button } from '@/components/ui/button'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
 import {
```
(после строки 5, перед строкой 6 `import { ... } from '@/lib/locale-settings-store'`)

- [ ] **Step 2: Язык по умолчанию (строки ~128-138)**

```diff
-              <select
-                className={SELECT_CLASS}
-                value={language}
-                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
-              >
-                {(['ru', 'en', 'lv'] as SupportedLanguage[]).map((lang) => (
-                  <option key={lang} value={lang}>
-                    {LANGUAGE_LABELS[lang]}
-                  </option>
-                ))}
-              </select>
+              <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
+                <SelectTrigger className={SELECT_CLASS}>
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  {(['ru', 'en', 'lv'] as SupportedLanguage[]).map((lang) => (
+                    <SelectItem key={lang} value={lang}>
+                      {LANGUAGE_LABELS[lang]}
+                    </SelectItem>
+                  ))}
+                </SelectContent>
+              </Select>
```

- [ ] **Step 3: Валюта (строки ~156-166)**

```diff
-                <select
-                  className={SELECT_CLASS}
-                  value={currency}
-                  onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
-                >
-                  {(['EUR', 'USD', 'RUB'] as SupportedCurrency[]).map((cur) => (
-                    <option key={cur} value={cur}>
-                      {CURRENCY_LABELS[cur]}
-                    </option>
-                  ))}
-                </select>
+                <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
+                  <SelectTrigger className={SELECT_CLASS}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    {(['EUR', 'USD', 'RUB'] as SupportedCurrency[]).map((cur) => (
+                      <SelectItem key={cur} value={cur}>
+                        {CURRENCY_LABELS[cur]}
+                      </SelectItem>
+                    ))}
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 4: Формат даты (строки ~194-204)**

```diff
-                <select
-                  className={SELECT_CLASS}
-                  value={dateFormat}
-                  onChange={(e) => setDateFormat(e.target.value as DateFormatOption)}
-                >
-                  {(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormatOption[]).map((fmt) => (
-                    <option key={fmt} value={fmt}>
-                      {DATE_FORMAT_LABELS[fmt]}
-                    </option>
-                  ))}
-                </select>
+                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormatOption)}>
+                  <SelectTrigger className={SELECT_CLASS}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    {(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormatOption[]).map((fmt) => (
+                      <SelectItem key={fmt} value={fmt}>
+                        {DATE_FORMAT_LABELS[fmt]}
+                      </SelectItem>
+                    ))}
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 5: Часовой пояс (строки ~211-221)**

```diff
-                <select
-                  className={SELECT_CLASS}
-                  value={timezone}
-                  onChange={(e) => setTimezone(e.target.value as SupportedTimezone)}
-                >
-                  {TIMEZONES.map((tz) => (
-                    <option key={tz} value={tz}>
-                      {TIMEZONE_LABELS[tz]}
-                    </option>
-                  ))}
-                </select>
+                <Select value={timezone} onValueChange={(v) => setTimezone(v as SupportedTimezone)}>
+                  <SelectTrigger className={SELECT_CLASS}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    {TIMEZONES.map((tz) => (
+                      <SelectItem key={tz} value={tz}>
+                        {TIMEZONE_LABELS[tz]}
+                      </SelectItem>
+                    ))}
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 6: Формат цены (строки ~240-250)**

```diff
-                <select
-                  className={SELECT_CLASS}
-                  value={priceFormat}
-                  onChange={(e) => setPriceFormat(e.target.value as PriceFormatOption)}
-                >
-                  {(['symbol_before', 'symbol_after'] as PriceFormatOption[]).map((fmt) => (
-                    <option key={fmt} value={fmt}>
-                      {PRICE_FORMAT_LABELS[fmt]}
-                    </option>
-                  ))}
-                </select>
+                <Select value={priceFormat} onValueChange={(v) => setPriceFormat(v as PriceFormatOption)}>
+                  <SelectTrigger className={SELECT_CLASS}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    {(['symbol_before', 'symbol_after'] as PriceFormatOption[]).map((fmt) => (
+                      <SelectItem key={fmt} value={fmt}>
+                        {PRICE_FORMAT_LABELS[fmt]}
+                      </SelectItem>
+                    ))}
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 7: Импорт — `app/admin/config/shipping/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 7)

- [ ] **Step 8: Статус способа доставки (строки ~179-186, внутри `.map`)**

```diff
-                          <select
-                            className={SELECT_CLASS}
-                            value={method.enabled ? 'yes' : 'no'}
-                            onChange={(e) => updateDelivery(key, 'enabled', e.target.value === 'yes')}
-                          >
-                            <option value="yes">Включён</option>
-                            <option value="no">Отключён</option>
-                          </select>
+                          <Select
+                            value={method.enabled ? 'yes' : 'no'}
+                            onValueChange={(v) => updateDelivery(key, 'enabled', v === 'yes')}
+                          >
+                            <SelectTrigger className={SELECT_CLASS}>
+                              <SelectValue />
+                            </SelectTrigger>
+                            <SelectContent>
+                              <SelectItem value="yes">Включён</SelectItem>
+                              <SelectItem value="no">Отключён</SelectItem>
+                            </SelectContent>
+                          </Select>
```

- [ ] **Step 9: Статус способа оплаты (строки ~256-263, внутри другого `.map`)**

```diff
-                          <select
-                            className={SELECT_CLASS}
-                            value={method.enabled ? 'yes' : 'no'}
-                            onChange={(e) => updatePayment(key, 'enabled', e.target.value === 'yes')}
-                          >
-                            <option value="yes">Включён</option>
-                            <option value="no">Отключён</option>
-                          </select>
+                          <Select
+                            value={method.enabled ? 'yes' : 'no'}
+                            onValueChange={(v) => updatePayment(key, 'enabled', v === 'yes')}
+                          >
+                            <SelectTrigger className={SELECT_CLASS}>
+                              <SelectValue />
+                            </SelectTrigger>
+                            <SelectContent>
+                              <SelectItem value="yes">Включён</SelectItem>
+                              <SelectItem value="no">Отключён</SelectItem>
+                            </SelectContent>
+                          </Select>
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 11: Ручная проверка**

Run: `npm run dev`, открыть `/admin/config/locale` (5 select) и `/admin/config/shipping` (2 select, каждый рендерится несколько раз через `.map`) — проверить выбор опций.

- [ ] **Step 12: Commit**

```bash
git add app/admin/config/locale/page.tsx app/admin/config/shipping/page.tsx
git commit -m "refactor(admin): replace raw select with shadcn in config pages"
```

---

### Task 3: Контент — `app/admin/content/banners/page.tsx`, `app/admin/content/media/page.tsx`

**Files:**
- Modify: `app/admin/content/banners/page.tsx`
- Modify: `app/admin/content/media/page.tsx`

- [ ] **Step 1: Импорт — `app/admin/content/banners/page.tsx`**

```diff
 import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 9)

- [ ] **Step 2: Тип баннера (строки ~477-485)**

```diff
-                      <select
-                        value={bannerForm.type}
-                        onChange={(e) => setBannerForm((f) => ({ ...f, type: e.target.value as BannerType }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        {(Object.keys(BANNER_TYPE_LABELS) as BannerType[]).map((t) => (
-                          <option key={t} value={t}>{BANNER_TYPE_LABELS[t]}</option>
-                        ))}
-                      </select>
+                      <Select
+                        value={bannerForm.type}
+                        onValueChange={(v) => setBannerForm((f) => ({ ...f, type: v as BannerType }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          {(Object.keys(BANNER_TYPE_LABELS) as BannerType[]).map((t) => (
+                            <SelectItem key={t} value={t}>{BANNER_TYPE_LABELS[t]}</SelectItem>
+                          ))}
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 3: Стиль кнопки CTA (строки ~555-563)**

```diff
-                      <select
-                        value={bannerForm.ctaStyle}
-                        onChange={(e) => setBannerForm((f) => ({ ...f, ctaStyle: e.target.value as CtaStyle }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        {(Object.keys(CTA_STYLE_LABELS) as CtaStyle[]).map((s) => (
-                          <option key={s} value={s}>{CTA_STYLE_LABELS[s]}</option>
-                        ))}
-                      </select>
+                      <Select
+                        value={bannerForm.ctaStyle}
+                        onValueChange={(v) => setBannerForm((f) => ({ ...f, ctaStyle: v as CtaStyle }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          {(Object.keys(CTA_STYLE_LABELS) as CtaStyle[]).map((s) => (
+                            <SelectItem key={s} value={s}>{CTA_STYLE_LABELS[s]}</SelectItem>
+                          ))}
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 4: Цвет текста баннера (строки ~568-575)**

```diff
-                      <select
-                        value={bannerForm.textColor}
-                        onChange={(e) => setBannerForm((f) => ({ ...f, textColor: e.target.value as TextColor }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        <option value="dark">Тёмный</option>
-                        <option value="light">Светлый</option>
-                      </select>
+                      <Select
+                        value={bannerForm.textColor}
+                        onValueChange={(v) => setBannerForm((f) => ({ ...f, textColor: v as TextColor }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="dark">Тёмный</SelectItem>
+                          <SelectItem value="light">Светлый</SelectItem>
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 5: Активность баннера (строки ~598-606)**

```diff
-                      <select
-                        value={bannerForm.active ? 'yes' : 'no'}
-                        onChange={(e) => setBannerForm((f) => ({ ...f, active: e.target.value === 'yes' }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        <option value="yes">Да — отображается на сайте</option>
-                        <option value="no">Нет — скрыт</option>
-                      </select>
+                      <Select
+                        value={bannerForm.active ? 'yes' : 'no'}
+                        onValueChange={(v) => setBannerForm((f) => ({ ...f, active: v === 'yes' }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="yes">Да — отображается на сайте</SelectItem>
+                          <SelectItem value="no">Нет — скрыт</SelectItem>
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 6: Тип контентного блока (строки ~738-746)**

```diff
-                      <select
-                        value={blockForm.type}
-                        onChange={(e) => setBlockForm((f) => ({ ...f, type: e.target.value as BlockType }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
-                          <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>
-                        ))}
-                      </select>
+                      <Select
+                        value={blockForm.type}
+                        onValueChange={(v) => setBlockForm((f) => ({ ...f, type: v as BlockType }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
+                            <SelectItem key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</SelectItem>
+                          ))}
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 7: Активность контентного блока (строки ~824-832)**

```diff
-                      <select
-                        value={blockForm.active ? 'yes' : 'no'}
-                        onChange={(e) => setBlockForm((f) => ({ ...f, active: e.target.value === 'yes' }))}
-                        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm"
-                      >
-                        <option value="yes">Да — отображается на сайте</option>
-                        <option value="no">Нет — скрыт</option>
-                      </select>
+                      <Select
+                        value={blockForm.active ? 'yes' : 'no'}
+                        onValueChange={(v) => setBlockForm((f) => ({ ...f, active: v === 'yes' }))}
+                      >
+                        <SelectTrigger className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="yes">Да — отображается на сайте</SelectItem>
+                          <SelectItem value="no">Нет — скрыт</SelectItem>
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 8: Импорты — `app/admin/content/media/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
+import { Checkbox } from '@/components/ui/checkbox'
 import { Download, Grid2X2, LayoutList } from 'lucide-react'
```

- [ ] **Step 9: Сортировка файлов (строки ~295-303)**

```diff
-          <select
-            value={sort}
-            onChange={(e) => setSort(e.target.value as SortKey)}
-            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-gray-700 dark:text-gray-300"
-          >
-            <option value="date">По дате</option>
-            <option value="name">По имени</option>
-            <option value="size">По размеру</option>
-          </select>
+          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
+            <SelectTrigger className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-gray-700 dark:text-gray-300">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="date">По дате</SelectItem>
+              <SelectItem value="name">По имени</SelectItem>
+              <SelectItem value="size">По размеру</SelectItem>
+            </SelectContent>
+          </Select>
```

- [ ] **Step 10: "Выбрать все" с indeterminate (строки ~351-358)**

```diff
                 <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
-                  <input
-                    type="checkbox"
-                    checked={isAllChecked}
-                    ref={(el) => { if (el) el.indeterminate = isSomeChecked && !isAllChecked }}
-                    onChange={toggleAll}
-                    className="h-3.5 w-3.5 accent-primary"
-                  />
+                  <Checkbox
+                    checked={isAllChecked ? true : isSomeChecked ? 'indeterminate' : false}
+                    onCheckedChange={toggleAll}
+                  />
                   Выбрать все ({displayed.length})
                 </label>
```

- [ ] **Step 11: Чекбокс файла в grid-виде (строки ~383-388)**

```diff
                         <label
                           className="absolute top-1.5 left-1.5 z-10 cursor-pointer"
                           onClick={(e) => e.stopPropagation()}
                         >
-                          <input
-                            type="checkbox"
-                            checked={isChecked}
-                            onChange={() => toggleCheck(file.name)}
-                            className="h-4 w-4 accent-primary rounded"
-                          />
+                          <Checkbox
+                            checked={isChecked}
+                            onCheckedChange={() => toggleCheck(file.name)}
+                          />
                         </label>
```

- [ ] **Step 12: Чекбокс файла в list-виде (строка ~447)**

```diff
                             <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
-                              <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(file.name)} className="h-4 w-4 accent-primary" />
+                              <Checkbox checked={isChecked} onCheckedChange={() => toggleCheck(file.name)} />
                             </td>
```

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 14: Ручная проверка**

Run: `npm run dev`, открыть `/admin/content/banners` (создать/редактировать баннер — 4 select; создать/редактировать блок — 2 select) и `/admin/content/media` (сортировка-select, "выбрать все" с indeterminate, чекбоксы файлов в grid и list виде).

- [ ] **Step 15: Commit**

```bash
git add app/admin/content/banners/page.tsx app/admin/content/media/page.tsx
git commit -m "refactor(admin): replace raw select/checkbox with shadcn in content pages"
```

---

### Task 4: Маркетинг — `campaigns/page.tsx`, `discounts/page.tsx`, `showcases/page.tsx`

**Files:**
- Modify: `app/admin/marketing/campaigns/page.tsx`
- Modify: `app/admin/marketing/discounts/page.tsx`
- Modify: `app/admin/marketing/showcases/page.tsx`

- [ ] **Step 1: Импорты — `campaigns/page.tsx`**

```diff
 import { Textarea } from '@/components/ui/textarea'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
+import { Checkbox } from '@/components/ui/checkbox'
```
(после строки 7)

`selectCls` — существующая константа со стилем raw-select в этом файле, переносится на `SelectTrigger` без изменений (как в Task 2).

- [ ] **Step 2: Тип кампании (строки ~216-225)**

```diff
-                <select
-                  value={form.type}
-                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CampaignType }))}
-                  className={selectCls}
-                >
-                  <option value="discount">Скидка</option>
-                  <option value="gift">Подарок</option>
-                  <option value="bundle">Набор</option>
-                  <option value="free_shipping">Бесплатная доставка</option>
-                </select>
+                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CampaignType }))}>
+                  <SelectTrigger className={selectCls}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="discount">Скидка</SelectItem>
+                    <SelectItem value="gift">Подарок</SelectItem>
+                    <SelectItem value="bundle">Набор</SelectItem>
+                    <SelectItem value="free_shipping">Бесплатная доставка</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 3: Статус кампании (строки ~264-271)**

```diff
-                <select
-                  value={form.active ? 'true' : 'false'}
-                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'true' }))}
-                  className={selectCls}
-                >
-                  <option value="true">Активна</option>
-                  <option value="false">Неактивна</option>
-                </select>
+                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
+                  <SelectTrigger className={selectCls}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="true">Активна</SelectItem>
+                    <SelectItem value="false">Неактивна</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 4: Чекбоксы категорий (строки ~277-283, внутри `.map`)**

```diff
                       <label key={cat.value} className="flex items-center gap-2 text-sm cursor-pointer">
-                      <input
-                        type="checkbox"
-                        checked={form.targetCategories.includes(cat.value)}
-                        onChange={() => toggleCategory(cat.value)}
-                        className="rounded border-gray-300 dark:border-gray-600"
-                      />
+                      <Checkbox
+                        checked={form.targetCategories.includes(cat.value)}
+                        onCheckedChange={() => toggleCategory(cat.value)}
+                      />
                       <span className="text-gray-700 dark:text-gray-300">{cat.label}</span>
                     </label>
```

- [ ] **Step 5: Импорт — `discounts/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
 import { logAdminAction } from '@/lib/admin-log-store'
```

- [ ] **Step 6: Статус промокода (строки ~224-231)**

```diff
-                <select
-                  value={form.active ? 'true' : 'false'}
-                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'true' }))}
-                  className={selectCls}
-                >
-                  <option value="true">Активен</option>
-                  <option value="false">Скрыт</option>
-                </select>
+                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
+                  <SelectTrigger className={selectCls}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="true">Активен</SelectItem>
+                    <SelectItem value="false">Скрыт</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 7: Импорт — `showcases/page.tsx`**

```diff
 import { Textarea } from '@/components/ui/textarea'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

- [ ] **Step 8: Видимость подборки (строки ~231-238)**

```diff
-                <select
-                  value={form.active ? 'true' : 'false'}
-                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'true' }))}
-                  className={selectCls}
-                >
-                  <option value="true">Активна</option>
-                  <option value="false">Скрыта</option>
-                </select>
+                <Select value={form.active ? 'true' : 'false'} onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}>
+                  <SelectTrigger className={selectCls}>
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="true">Активна</SelectItem>
+                    <SelectItem value="false">Скрыта</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 10: Ручная проверка**

Run: `npm run dev`, открыть `/admin/marketing/campaigns` (2 select + чекбоксы категорий), `/admin/marketing/discounts` (1 select), `/admin/marketing/showcases` (1 select).

- [ ] **Step 11: Commit**

```bash
git add app/admin/marketing/campaigns/page.tsx app/admin/marketing/discounts/page.tsx app/admin/marketing/showcases/page.tsx
git commit -m "refactor(admin): replace raw select/checkbox with shadcn in marketing pages"
```

---

### Task 5: Бренды/Бонусы/Аккаунты — `admin/brands`, `admin/bonus`, `admin/accounts`

**Files:**
- Modify: `app/admin/brands/page.tsx`
- Modify: `app/admin/bonus/page.tsx`
- Modify: `app/admin/accounts/page.tsx`

- [ ] **Step 1: Импорт — `app/admin/brands/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 9)

- [ ] **Step 2: "В дистрибуции" — форма нового бренда (строки ~273-280)**

```diff
-                <select
-                  value={newBrand.popular ? 'yes' : 'no'}
-                  onChange={(event) => setNewBrand((prev) => ({ ...prev, popular: event.target.value === 'yes' }))}
-                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
-                >
-                  <option value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</option>
-                  <option value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</option>
-                </select>
+                <Select value={newBrand.popular ? 'yes' : 'no'} onValueChange={(v) => setNewBrand((prev) => ({ ...prev, popular: v === 'yes' }))}>
+                  <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
+                    <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 3: "В дистрибуции" — строка существующего бренда (строки ~392-399, внутри `.map`)**

```diff
-                      <select
-                        value={brand.popular ? 'yes' : 'no'}
-                        onChange={(event) => updateBrand(brand.id, { popular: event.target.value === 'yes' })}
-                        className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
-                      >
-                        <option value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</option>
-                        <option value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</option>
-                      </select>
+                      <Select value={brand.popular ? 'yes' : 'no'} onValueChange={(v) => updateBrand(brand.id, { popular: v === 'yes' })}>
+                        <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
+                          <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                          <SelectItem value="no">{tl('admin.brands.option.no', 'Нет', 'No', 'Ne')}</SelectItem>
+                          <SelectItem value="yes">{tl('admin.brands.option.yes', 'Да', 'Yes', 'Ja')}</SelectItem>
+                        </SelectContent>
+                      </Select>
```

- [ ] **Step 4: Импорт — `app/admin/bonus/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 7)

- [ ] **Step 5: Программа бонусов включена/выключена (строки ~138-145)**

```diff
-                  <select
-                    value={draft.enabled ? 'yes' : 'no'}
-                    onChange={(e) => setDraft((p) => ({ ...p, enabled: e.target.value === 'yes' }))}
-                    className="w-full rounded border border-border bg-card px-3 py-2 text-sm"
-                  >
-                    <option value="yes">{t('common.yes')}</option>
-                    <option value="no">{t('common.no')}</option>
-                  </select>
+                  <Select value={draft.enabled ? 'yes' : 'no'} onValueChange={(v) => setDraft((p) => ({ ...p, enabled: v === 'yes' }))}>
+                    <SelectTrigger className="w-full rounded border border-border bg-card px-3 py-2 text-sm">
+                      <SelectValue />
+                    </SelectTrigger>
+                    <SelectContent>
+                      <SelectItem value="yes">{t('common.yes')}</SelectItem>
+                      <SelectItem value="no">{t('common.no')}</SelectItem>
+                    </SelectContent>
+                  </Select>
```

- [ ] **Step 6: Импорт — `app/admin/accounts/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 6)

- [ ] **Step 7: Фильтр роли (строки ~140-148)**

```diff
-            <select
-              className="rounded-md border border-border bg-card px-3 py-2 text-sm"
-              value={dbRoleFilter}
-              onChange={(e) => setDbRoleFilter(e.target.value)}
-            >
-              <option value="">Все роли</option>
-              <option value="customer">customer</option>
-              <option value="admin">admin</option>
-            </select>
+            <Select value={dbRoleFilter || 'all'} onValueChange={(v) => setDbRoleFilter(v === 'all' ? '' : v)}>
+              <SelectTrigger className="rounded-md border border-border bg-card px-3 py-2 text-sm">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">Все роли</SelectItem>
+                <SelectItem value="customer">customer</SelectItem>
+                <SelectItem value="admin">admin</SelectItem>
+              </SelectContent>
+            </Select>
```

(sentinel `'all'` ↔ `''` — это исправление уже применено в коде через фикс-сабагента в Task 5, см. ledger; здесь обновлено для консистентности документации плана)

(пустая строка `""` как значение "все роли" не работает как value у shadcn `SelectItem` — заменена на `placeholder`, показывается когда `dbRoleFilter === ''`; поведение фильтра не меняется, т.к. и раньше пустая строка просто не матчила ни одну роль и в `useEffect`/фильтрации трактовалась как "без фильтра" — проверить эту логику при ручной проверке Step 12)

- [ ] **Step 8: Роль пользователя в таблице БД (строки ~176-184, внутри `.map`)**

```diff
-                        <select
-                          className="rounded border border-border bg-card px-2 py-1 text-xs"
-                          value={u.platformRole}
-                          onChange={(e) => handleUpdateDbRole(u.id, e.target.value)}
-                        >
-                          <option value="customer">customer</option>
-                          <option value="admin">admin</option>
-                          <option value="b2b">b2b</option>
-                        </select>
+                        <Select value={u.platformRole} onValueChange={(v) => handleUpdateDbRole(u.id, v)}>
+                          <SelectTrigger className="rounded border border-border bg-card px-2 py-1 text-xs">
+                            <SelectValue />
+                          </SelectTrigger>
+                          <SelectContent>
+                            <SelectItem value="customer">customer</SelectItem>
+                            <SelectItem value="admin">admin</SelectItem>
+                            <SelectItem value="b2b">b2b</SelectItem>
+                          </SelectContent>
+                        </Select>
```

- [ ] **Step 9: Роль участника команды (строки ~231-243, внутри вложенного `.map`)**

```diff
-                              <select
-                                value={selectedRole}
-                                onChange={(event) => {
-                                  const role = event.target.value as TeamRole
-                                  setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }))
-                                }}
-                                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
-                              >
-                                <option value="viewer">viewer</option>
-                                <option value="buyer">buyer</option>
-                                <option value="manager">manager</option>
-                                <option value="admin">admin</option>
-                              </select>
+                              <Select
+                                value={selectedRole}
+                                onValueChange={(v) => {
+                                  const role = v as TeamRole
+                                  setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }))
+                                }}
+                              >
+                                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
+                                  <SelectValue />
+                                </SelectTrigger>
+                                <SelectContent>
+                                  <SelectItem value="viewer">viewer</SelectItem>
+                                  <SelectItem value="buyer">buyer</SelectItem>
+                                  <SelectItem value="manager">manager</SelectItem>
+                                  <SelectItem value="admin">admin</SelectItem>
+                                </SelectContent>
+                              </Select>
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 11: Ручная проверка**

Run: `npm run dev`, открыть `/admin/brands` (2 select — новый бренд + существующий), `/admin/bonus` (1 select), `/admin/accounts` (3 select — фильтр ролей с placeholder-поведением для пустого значения, роль в таблице БД, роль участника команды).

- [ ] **Step 12: Commit**

```bash
git add app/admin/brands/page.tsx app/admin/bonus/page.tsx app/admin/accounts/page.tsx
git commit -m "refactor(admin): replace raw select with shadcn in brands/bonus/accounts pages"
```

---

### Task 6: Возвраты/Отзывы — `admin/returns/page.tsx`, `admin/reviews/page.tsx`

**Files:**
- Modify: `app/admin/returns/page.tsx`
- Modify: `app/admin/reviews/page.tsx`

- [ ] **Step 1: Импорт — `app/admin/returns/page.tsx`**

```diff
 import { Button } from '@/components/ui/button'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 8)

- [ ] **Step 2: Причина возврата — форма создания (строки ~263-271)**

```diff
-            <select
-              value={formReason}
-              onChange={(e) => setFormReason(e.target.value as ReturnReason)}
-              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
-            >
-              {REASON_LIST.map((r) => (
-                <option key={r} value={r}>{RETURN_REASON_LABELS[r]}</option>
-              ))}
-            </select>
+            <Select value={formReason} onValueChange={(v) => setFormReason(v as ReturnReason)}>
+              <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                {REASON_LIST.map((r) => (
+                  <SelectItem key={r} value={r}>{RETURN_REASON_LABELS[r]}</SelectItem>
+                ))}
+              </SelectContent>
+            </Select>
```

- [ ] **Step 3: Фильтр статуса (строки ~329-338)**

```diff
-          <select
-            value={statusFilter}
-            onChange={(e) => setStatusFilter(e.target.value as ReturnStatus | 'all')}
-            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
-          >
-            <option value="all">Все статусы</option>
-            {STATUS_LIST.map((s) => (
-              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
-            ))}
-          </select>
+          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReturnStatus | 'all')}>
+            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">Все статусы</SelectItem>
+              {STATUS_LIST.map((s) => (
+                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
```

- [ ] **Step 4: Фильтр причины (строки ~339-348)**

```diff
-          <select
-            value={reasonFilter}
-            onChange={(e) => setReasonFilter(e.target.value as ReturnReason | 'all')}
-            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
-          >
-            <option value="all">Все причины</option>
-            {REASON_LIST.map((r) => (
-              <option key={r} value={r}>{RETURN_REASON_LABELS[r]}</option>
-            ))}
-          </select>
+          <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as ReturnReason | 'all')}>
+            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">Все причины</SelectItem>
+              {REASON_LIST.map((r) => (
+                <SelectItem key={r} value={r}>{RETURN_REASON_LABELS[r]}</SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
```

- [ ] **Step 5: Импорт — `app/admin/reviews/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
+import { Checkbox } from '@/components/ui/checkbox'
```
(после строки 6)

- [ ] **Step 6: Фильтр статуса отзывов (строки ~313-322)**

```diff
-            <select
-              value={status}
-              onChange={(event) => setStatus(event.target.value as 'all' | ReviewStatus)}
-              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
-            >
-              <option value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</option>
-              <option value="approved">{STATUS_LABELS.approved}</option>
-              <option value="hidden">{STATUS_LABELS.hidden}</option>
-              <option value="pending">{STATUS_LABELS.pending}</option>
-            </select>
+            <Select value={status} onValueChange={(v) => setStatus(v as 'all' | ReviewStatus)}>
+              <SelectTrigger className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800">
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</SelectItem>
+                <SelectItem value="approved">{STATUS_LABELS.approved}</SelectItem>
+                <SelectItem value="hidden">{STATUS_LABELS.hidden}</SelectItem>
+                <SelectItem value="pending">{STATUS_LABELS.pending}</SelectItem>
+              </SelectContent>
+            </Select>
```

- [ ] **Step 7: "Выбрать все видимые" (строки ~328-336)**

```diff
              <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
-                <input
-                  type="checkbox"
-                  checked={allVisibleSelected}
-                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
-                  className="h-4 w-4 rounded border-gray-300"
-                />
+                <Checkbox
+                  checked={allVisibleSelected}
+                  onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
+                />
                 {l('Выбрать все видимые', 'Select all visible', 'Atlasit visas redzamas')}
              </label>
```

- [ ] **Step 8: Чекбокс выбора отзыва (строки ~384-389, внутри `.map`)**

```diff
                   <label className="inline-flex items-center">
-                    <input
-                      type="checkbox"
-                      checked={isSelected}
-                      onChange={(event) => toggleReviewSelection(review.id, event.target.checked)}
-                      className="h-4 w-4 rounded border-gray-300"
-                    />
+                    <Checkbox
+                      checked={isSelected}
+                      onCheckedChange={(checked) => toggleReviewSelection(review.id, checked === true)}
+                    />
                   </label>
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 10: Ручная проверка**

Run: `npm run dev`, открыть `/admin/returns` (форма создания + 2 фильтра), `/admin/reviews` (фильтр статуса, "выбрать все видимые", чекбокс отзыва).

- [ ] **Step 11: Commit**

```bash
git add app/admin/returns/page.tsx app/admin/reviews/page.tsx
git commit -m "refactor(admin): replace raw select/checkbox with shadcn in returns/reviews pages"
```

---

### Task 7: Системные + прочее — `system/logs`, `system/admin-log`, `notifications/send`, `products/bulk-price`, `client-barcodes`

**Files:**
- Modify: `app/admin/system/logs/page.tsx`
- Modify: `app/admin/system/admin-log/page.tsx`
- Modify: `app/admin/notifications/send/page.tsx`
- Modify: `app/admin/products/bulk-price/page.tsx`
- Modify: `app/admin/client-barcodes/page.tsx`

- [ ] **Step 1: Импорт — `app/admin/system/logs/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 7)

- [ ] **Step 2: Фильтр действия (строки ~140-149)**

**Важно:** `actionFilter` хранит `''` как "без фильтра" (обычный `string`, не литерал `'all'` в типе). У raw-select был реальный, всегда выбираемый `<option value="">Все действия</option>` — пользователь мог открыть список повторно и выбрать "Все действия" снова, чтобы снять фильтр. Голый `placeholder` показывается ТОЛЬКО пока `actionFilter === ''` и недостижим из дропдауна после выбора конкретного действия — реальная потеря UX (обнаружена и исправлена в Task 5 для похожего случая в `admin/accounts/page.tsx`, тот же класс ошибки). Использовать sentinel-значение `'all'`, транслируемое в `''` на границе:

```diff
-          <select
-            value={actionFilter}
-            onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
-            className="border rounded-md px-3 py-2 text-sm bg-background"
-          >
-            <option value="">Все действия</option>
-            {uniqueActions.map((a) => (
-              <option key={a} value={a}>{a}</option>
-            ))}
-          </select>
+          <Select value={actionFilter || 'all'} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v); setPage(0) }}>
+            <SelectTrigger className="border rounded-md px-3 py-2 text-sm bg-background">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">Все действия</SelectItem>
+              {uniqueActions.map((a) => (
+                <SelectItem key={a} value={a}>{a}</SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
```

(sentinel `'all'` ↔ `''` на границе `value`/`onValueChange` — `actionFilter` снаружи этого блока остаётся `''`/конкретным значением, как раньше; "Все действия" теперь реальный, всегда выбираемый пункт списка)

- [ ] **Step 3: Импорт — `app/admin/system/admin-log/page.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 7)

- [ ] **Step 4: Фильтр действия (строки ~163-172)**

**Важно:** `actionFilter` хранит `''` как "без фильтра" (тип `AdminLogAction | ''`). Та же ситуация, что в Task 7 Step 2 — без sentinel-значения "Все действия" станет недостижимым после первого выбора. Использовать `'all'`:

```diff
-          <select
-            value={actionFilter}
-            onChange={(e) => { setActionFilter(e.target.value as AdminLogAction | ''); setPage(0) }}
-            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
-          >
-            <option value="">Все действия</option>
-            {uniqueActions.map((a) => (
-              <option key={a} value={a}>{ACTION_LABELS[a as AdminLogAction] ?? a}</option>
-            ))}
-          </select>
+          <Select value={actionFilter || 'all'} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v as AdminLogAction); setPage(0) }}>
+            <SelectTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">Все действия</SelectItem>
+              {uniqueActions.map((a) => (
+                <SelectItem key={a} value={a}>{ACTION_LABELS[a as AdminLogAction] ?? a}</SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
```

- [ ] **Step 5: Фильтр администратора (строки ~173-180)**

**Важно:** `adminFilter` хранит `''` как "без фильтра" (обычный `string`). Тот же класс ошибки, тот же sentinel-фикс:

```diff
-          <select
-            value={adminFilter}
-            onChange={(e) => { setAdminFilter(e.target.value); setPage(0) }}
-            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
-          >
-            <option value="">Все администраторы</option>
-            {uniqueAdmins.map((a) => <option key={a} value={a}>{a}</option>)}
-          </select>
+          <Select value={adminFilter || 'all'} onValueChange={(v) => { setAdminFilter(v === 'all' ? '' : v); setPage(0) }}>
+            <SelectTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">Все администраторы</SelectItem>
+              {uniqueAdmins.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
+            </SelectContent>
+          </Select>
```

- [ ] **Step 6: Импорт — `app/admin/notifications/send/page.tsx`**

```diff
 import { Textarea } from '@/components/ui/textarea'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
+import { Checkbox } from '@/components/ui/checkbox'
```
(после строки 6)

- [ ] **Step 7: Чекбокс выбора пользователя (строки ~223-228, внутри `.map`)**

```diff
                   <label
                     key={u.id}
                     className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                   >
-                    <input
-                      type="checkbox"
-                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 accent-emerald-600"
-                      checked={selectedIds.has(u.id)}
-                      onChange={() => toggleUser(u.id)}
-                    />
+                    <Checkbox
+                      checked={selectedIds.has(u.id)}
+                      onCheckedChange={() => toggleUser(u.id)}
+                    />
```

- [ ] **Step 8: Тип уведомления (строки ~275-284)**

```diff
-              <select
-                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
-                value={type}
-                onChange={(e) => setType(e.target.value as NotificationType)}
-              >
-                <option value="info">info</option>
-                <option value="success">success</option>
-                <option value="warning">warning</option>
-                <option value="promo">promo</option>
-              </select>
+              <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
+                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="info">info</SelectItem>
+                  <SelectItem value="success">success</SelectItem>
+                  <SelectItem value="warning">warning</SelectItem>
+                  <SelectItem value="promo">promo</SelectItem>
+                </SelectContent>
+              </Select>
```

- [ ] **Step 9: Импорт — `app/admin/products/bulk-price/page.tsx`**

Файл использует JSX без TypeScript-расширения импорта shadcn-компонентов из `@/components/ui/*` — добавить рядом с существующими импортами (в этом файле их пока нет, добавить после строки 4 `import AdminGate from '@/components/admin/AdminGate';`):

```diff
 import AdminGate from '@/components/admin/AdminGate';
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
+import { Checkbox } from '@/components/ui/checkbox';
```

- [ ] **Step 10: Чекбокс "сохранить старую цену" (строки ~176-182)**

```diff
                         <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
-                            <input
-                                type="checkbox"
-                                checked={saveOldPrice}
-                                onChange={(e) => setSaveOldPrice(e.target.checked)}
-                                className="h-4 w-4 rounded"
-                            />
+                            <Checkbox
+                                checked={saveOldPrice}
+                                onCheckedChange={(checked) => setSaveOldPrice(checked === true)}
+                            />
                             Сохранить старую цену (зачёркнутая)
                         </label>
```

- [ ] **Step 11: Фильтр категории (строки ~215-226)**

**Важно:** `catFilter` хранит `''` как "без фильтра" (обычный `string`). Тот же класс ошибки, что в Task 7 Step 2/4/5 — голый placeholder делает "Все категории" недостижимым после первого выбора. Sentinel-фикс:

```diff
-                    <select
-                        value={catFilter}
-                        onChange={(e) => setCatFilter(e.target.value)}
-                        className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
-                    >
-                        <option value="">Все категории</option>
-                        {CATEGORIES.map((c) => (
-                            <option key={c} value={c}>
-                                {c}
-                            </option>
-                        ))}
-                    </select>
+                    <Select value={catFilter || 'all'} onValueChange={(v) => setCatFilter(v === 'all' ? '' : v)}>
+                        <SelectTrigger className="rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
+                            <SelectValue />
+                        </SelectTrigger>
+                        <SelectContent>
+                            <SelectItem value="all">Все категории</SelectItem>
+                            {CATEGORIES.map((c) => (
+                                <SelectItem key={c} value={c}>
+                                    {c}
+                                </SelectItem>
+                            ))}
+                        </SelectContent>
+                    </Select>
```

- [ ] **Step 12: Чекбокс "выбрать все" в заголовке таблицы (строки ~240-245)**

```diff
                                     <th className="w-10 px-4 py-3">
-                                        <input
-                                            type="checkbox"
-                                            checked={filtered.length > 0 && selected.size === filtered.length}
-                                            onChange={toggleAll}
-                                            className="h-4 w-4 rounded"
-                                        />
+                                        <Checkbox
+                                            checked={filtered.length > 0 && selected.size === filtered.length}
+                                            onCheckedChange={toggleAll}
+                                        />
                                     </th>
```

- [ ] **Step 13: Чекбокс строки товара (строки ~283-288)**

```diff
                                             <td className="px-4 py-3">
-                                                <input
-                                                    type="checkbox"
-                                                    checked={isSelected}
-                                                    onChange={() => toggle(p.id)}
-                                                    onClick={(e) => e.stopPropagation()}
-                                                    className="h-4 w-4 rounded"
-                                                />
+                                                <Checkbox
+                                                    checked={isSelected}
+                                                    onCheckedChange={() => toggle(p.id)}
+                                                    onClick={(e) => e.stopPropagation()}
+                                                />
                                             </td>
```

- [ ] **Step 14: Импорт — `app/admin/client-barcodes/page.tsx`**

```diff
 import IconSearch from '@/components/ui/icon-search';
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { useTranslation } from '@/lib/use-translation';
```
(после строки 18)

- [ ] **Step 15: Роль участника команды (строки ~437-449, внутри вложенного `.map`)**

```diff
-                                                            <select
-                                                                value={selectedRole}
-                                                                onChange={(event) => {
-                                                                    const role = event.target.value as TeamRole;
-                                                                    setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }));
-                                                                }}
-                                                                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
-                                                            >
-                                                                <option value="viewer">viewer</option>
-                                                                <option value="buyer">buyer</option>
-                                                                <option value="manager">manager</option>
-                                                                <option value="admin">admin</option>
-                                                            </select>
+                                                            <Select
+                                                                value={selectedRole}
+                                                                onValueChange={(value) => {
+                                                                    const role = value as TeamRole;
+                                                                    setMemberRolesDraft((prev) => ({ ...prev, [companyUser.id]: role }));
+                                                                }}
+                                                            >
+                                                                <SelectTrigger className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm">
+                                                                    <SelectValue />
+                                                                </SelectTrigger>
+                                                                <SelectContent>
+                                                                    <SelectItem value="viewer">viewer</SelectItem>
+                                                                    <SelectItem value="buyer">buyer</SelectItem>
+                                                                    <SelectItem value="manager">manager</SelectItem>
+                                                                    <SelectItem value="admin">admin</SelectItem>
+                                                                </SelectContent>
+                                                            </Select>
```

(этот select структурно идентичен Task 5 Step 9 в `admin/accounts/page.tsx` — независимая копия той же роле-формы команды, использующаяся в другом разделе админки)

- [ ] **Step 16: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 17: Ручная проверка**

Run: `npm run dev`, открыть `/admin/system/logs`, `/admin/system/admin-log`, `/admin/notifications/send`, `/admin/products/bulk-price`, `/admin/client-barcodes` — проверить все select/checkbox на каждой.

- [ ] **Step 18: Commit**

```bash
git add app/admin/system/logs/page.tsx app/admin/system/admin-log/page.tsx app/admin/notifications/send/page.tsx app/admin/products/bulk-price/page.tsx app/admin/client-barcodes/page.tsx
git commit -m "refactor(admin): replace raw select/checkbox with shadcn in system/notifications/bulk-price/client-barcodes pages"
```

---

### Task 8: Общие компоненты + публичная страница — `InvoiceList.tsx`, `AuditLogViewer.tsx`, `InvoiceViewer.tsx`, `app/request-quote/page.tsx`

**Files:**
- Modify: `components/InvoiceList.tsx`
- Modify: `components/AuditLogViewer.tsx`
- Modify: `components/InvoiceViewer.tsx`
- Modify: `app/request-quote/page.tsx`

**Важно:** `InvoiceList.tsx`/`AuditLogViewer.tsx`/`InvoiceViewer.tsx` используются в `app/account/**` — это клиентские (не только админские) страницы, и `app/request-quote/page.tsx` — публичная страница. Ручная проверка этой задачи особенно важна.

- [ ] **Step 1: Импорт — `components/InvoiceList.tsx`**

```diff
 import { Badge } from '@/components/ui/badge'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 8)

- [ ] **Step 2: Фильтр статуса счёта (строки ~103-114)**

```diff
-          <select
-            value={filterStatus}
-            onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | 'all')}
-            className="rounded border border-gray-300 dark:border-gray-600 bg-card text-foreground px-3 py-2 text-sm"
-          >
-            <option value="all">{t('account.invoiceList.filter.allStatuses')}</option>
-            <option value="issued">{t('account.invoice.status.issued')}</option>
-            <option value="paid">{t('account.invoice.status.paid')}</option>
-            <option value="overdue">{t('account.invoice.status.overdue')}</option>
-            <option value="draft">{t('account.invoice.status.draft')}</option>
-            <option value="cancelled">{t('account.invoice.status.cancelled')}</option>
-          </select>
+          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as InvoiceStatus | 'all')}>
+            <SelectTrigger className="rounded border border-gray-300 dark:border-gray-600 bg-card text-foreground px-3 py-2 text-sm">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">{t('account.invoiceList.filter.allStatuses')}</SelectItem>
+              <SelectItem value="issued">{t('account.invoice.status.issued')}</SelectItem>
+              <SelectItem value="paid">{t('account.invoice.status.paid')}</SelectItem>
+              <SelectItem value="overdue">{t('account.invoice.status.overdue')}</SelectItem>
+              <SelectItem value="draft">{t('account.invoice.status.draft')}</SelectItem>
+              <SelectItem value="cancelled">{t('account.invoice.status.cancelled')}</SelectItem>
+            </SelectContent>
+          </Select>
```

- [ ] **Step 3: Сортировка списка счетов (строки ~116-124)**

```diff
-          <select
-            value={sortBy}
-            onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'status')}
-            className="rounded border border-gray-300 dark:border-gray-600 bg-card text-foreground px-3 py-2 text-sm"
-          >
-            <option value="date">{t('account.invoiceList.sort.byDate')}</option>
-            <option value="amount">{t('account.invoiceList.sort.byAmount')}</option>
-            <option value="status">{t('account.invoiceList.sort.byStatus')}</option>
-          </select>
+          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'date' | 'amount' | 'status')}>
+            <SelectTrigger className="rounded border border-gray-300 dark:border-gray-600 bg-card text-foreground px-3 py-2 text-sm">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="date">{t('account.invoiceList.sort.byDate')}</SelectItem>
+              <SelectItem value="amount">{t('account.invoiceList.sort.byAmount')}</SelectItem>
+              <SelectItem value="status">{t('account.invoiceList.sort.byStatus')}</SelectItem>
+            </SelectContent>
+          </Select>
```

- [ ] **Step 4: Импорт — `components/AuditLogViewer.tsx`**

```diff
 import { Card } from '@/components/ui/card'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 5)

- [ ] **Step 5: Фильтр действия (строки ~128-139)**

**Важно:** `filterValue` хранит `''` как "без фильтра" (обычный `string`). Тот же класс ошибки, что в Task 7 — голый placeholder делает пункт "все действия" недостижимым после первого выбора (см. Task 7 Step 2 для полного объяснения, найдено и исправлено ревьюером в Task 5). Sentinel-фикс:

```diff
         {filterType === 'action' ? (
-          <select
-            value={filterValue}
-            onChange={(e) => setFilterValue(e.target.value)}
-            className="px-3 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 bg-card text-foreground"
-          >
-            <option value="">{t('account.auditLog.filter.allActions')}</option>
-            {actionTypes.map(action => (
-              <option key={action} value={action}>
-                {getActionLabel(action)}
-              </option>
-            ))}
-          </select>
+          <Select value={filterValue || 'all'} onValueChange={(v) => setFilterValue(v === 'all' ? '' : v)}>
+            <SelectTrigger className="px-3 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 bg-card text-foreground">
+              <SelectValue />
+            </SelectTrigger>
+            <SelectContent>
+              <SelectItem value="all">{t('account.auditLog.filter.allActions')}</SelectItem>
+              {actionTypes.map(action => (
+                <SelectItem key={action} value={action}>
+                  {getActionLabel(action)}
+                </SelectItem>
+              ))}
+            </SelectContent>
+          </Select>
         ) : (
```

- [ ] **Step 6: Импорт — `components/InvoiceViewer.tsx`**

```diff
 import { Input } from '@/components/ui/input'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 8)

- [ ] **Step 7: Способ оплаты (строки ~222-231)**

```diff
-                <select
-                  value={paymentMethod}
-                  onChange={(e) => setPaymentMethod(e.target.value)}
-                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-foreground px-3 py-2"
-                >
-                  <option value="bank_transfer">{t('account.invoiceViewer.paymentMethod.bankTransfer')}</option>
-                  <option value="card">{t('account.invoiceViewer.paymentMethod.card')}</option>
-                  <option value="cash">{t('account.invoiceViewer.paymentMethod.cash')}</option>
-                  <option value="check">{t('account.invoiceViewer.paymentMethod.check')}</option>
-                </select>
+                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
+                  <SelectTrigger className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-foreground px-3 py-2">
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    <SelectItem value="bank_transfer">{t('account.invoiceViewer.paymentMethod.bankTransfer')}</SelectItem>
+                    <SelectItem value="card">{t('account.invoiceViewer.paymentMethod.card')}</SelectItem>
+                    <SelectItem value="cash">{t('account.invoiceViewer.paymentMethod.cash')}</SelectItem>
+                    <SelectItem value="check">{t('account.invoiceViewer.paymentMethod.check')}</SelectItem>
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 8: Импорт — `app/request-quote/page.tsx`**

```diff
 import { Button } from '@/components/ui/button'
+import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```
(после строки 10)

- [ ] **Step 9: Выбор товара в строке RFQ (строки ~143-153, внутри `.map`)**

```diff
-                <select
-                  value={item.productId}
-                  onChange={(e) => updateRow(index, { productId: e.target.value })}
-                  className="rounded border border-border bg-background px-3 py-2 text-sm"
-                >
-                  {products.map((product) => (
-                    <option key={product.id} value={product.id}>
-                      {product.title}
-                    </option>
-                  ))}
-                </select>
+                <Select value={item.productId} onValueChange={(v) => updateRow(index, { productId: v })}>
+                  <SelectTrigger className="rounded border border-border bg-background px-3 py-2 text-sm">
+                    <SelectValue />
+                  </SelectTrigger>
+                  <SelectContent>
+                    {products.map((product) => (
+                      <SelectItem key={product.id} value={product.id}>
+                        {product.title}
+                      </SelectItem>
+                    ))}
+                  </SelectContent>
+                </Select>
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок

- [ ] **Step 11: Ручная проверка**

Run: `npm run dev`. Проверить со стороны клиентского аккаунта: `/account/invoices` (использует `InvoiceList`/`InvoiceViewer` — открыть, отфильтровать по статусу, отсортировать, открыть счёт и сменить способ оплаты) и `/account` (раздел audit log, если есть `AuditLogViewer` — отфильтровать по действию). Проверить `/request-quote` — добавить строку товара, выбрать товар из списка.

- [ ] **Step 12: Commit**

```bash
git add components/InvoiceList.tsx components/AuditLogViewer.tsx components/InvoiceViewer.tsx app/request-quote/page.tsx
git commit -m "refactor: replace raw select with shadcn in invoice/audit-log components and request-quote page"
```

---

### Task 9: BEM-фиксы — `components/account/*`, `app/admin/blog`, `app/admin/bonus`, `app/admin/categories`

**Files:**
- Modify: `components/account/AccountOrdersSection.tsx`
- Modify: `components/account/AccountProfileCard.tsx`
- Modify: `components/account/AccountAddressesWidget.tsx`
- Modify: `app/admin/blog/page.tsx`
- Modify: `app/admin/bonus/page.tsx`
- Modify: `app/admin/categories/page.tsx`

Только добавление BEM-класса на корневой элемент — существующие Tailwind-классы не трогаются.

- [ ] **Step 1: `AccountOrdersSection.tsx` (строки ~41-44)**

```diff
     <section
         id="orders-history"
-        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6"
+        className="account-orders-section rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-6"
     >
```

- [ ] **Step 2: `AccountProfileCard.tsx` (строка ~59)**

Файл уже использует BEM для вложенных элементов (`account-profile__header`, `account-profile__avatar`) — у корневого `div` блок-класс отсутствует:

```diff
     return (
-        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
+        <div className="account-profile rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
```

- [ ] **Step 3: `AccountAddressesWidget.tsx` (строки ~23-26)**

```diff
         <Link
             href="/account/addresses"
-            className="group flex flex-col rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm hover:shadow-md hover:border-emerald-200 dark:border-emerald-800 dark:bg-emerald-900/30 dark:hover:border-emerald-700 transition-all"
+            className="account-addresses-widget group flex flex-col rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm hover:shadow-md hover:border-emerald-200 dark:border-emerald-800 dark:bg-emerald-900/30 dark:hover:border-emerald-700 transition-all"
         >
```

- [ ] **Step 4: `app/admin/blog/page.tsx` (строка ~291)**

```diff
     <AdminGate>
-      <main className="w-full py-4 text-foreground">
+      <main className="admin-blog-page w-full py-4 text-foreground">
```

- [ ] **Step 5: `app/admin/bonus/page.tsx` (строка ~97)**

```diff
     <AdminGate>
-      <main className="w-full py-4 space-y-6 text-foreground">
+      <main className="admin-bonus-page w-full py-4 space-y-6 text-foreground">
```

- [ ] **Step 6: `app/admin/categories/page.tsx` (строка ~340)**

```diff
     <AdminGate>
-      <main className="w-full py-4 space-y-4">
+      <main className="admin-categories-page w-full py-4 space-y-4">
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без новых ошибок (добавление класса в `className`-строку не влияет на типы)

- [ ] **Step 8: Ручная проверка**

Run: `npm run dev`, открыть `/account` (секция заказов, карточка профиля), `/account` widget адресов, `/admin/blog`, `/admin/bonus`, `/admin/categories` — убедиться что внешний вид не изменился (класс добавлен только для именования, никакого нового CSS-правила под него нет).

- [ ] **Step 9: Commit**

```bash
git add components/account/AccountOrdersSection.tsx components/account/AccountProfileCard.tsx components/account/AccountAddressesWidget.tsx app/admin/blog/page.tsx app/admin/bonus/page.tsx app/admin/categories/page.tsx
git commit -m "style: add missing BEM block class to account components and admin page wrappers"
```

---

## Post-implementation checklist

- [ ] Полный typecheck: `npx tsc --noEmit -p tsconfig.json` — без новых ошибок относительно baseline
- [ ] Полный набор тестов: `npx vitest run` — без регрессий относительно baseline (рендер-тестов для этих файлов в проекте нет, регрессии возможны только в существующих тестах сторов/хелперов, к которым эти компоненты обращаются — изменений в сторах/хелперах эта задача не делает)
- [ ] `npm run build` (или `npx next build --webpack`, если `prisma migrate deploy` падает на cold-start Neon — это окружение, не код)
- [ ] Ручной проход по всем 25 страницам/компонентам из задач 1-8 — каждый select/checkbox открывается, выбор работает, indeterminate-чекбоксы показывают промежуточное состояние корректно
- [ ] Визуальная сверка — внешний вид select/checkbox после замены не должен заметно отличаться от raw-версии (shadcn-компоненты уже стилизованы консистентно с остальным проектом)

