'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useLocaleSettingsStore,
  CURRENCY_SYMBOLS,
  TIMEZONES,
  type SupportedLanguage,
  type SupportedCurrency,
  type DateFormatOption,
  type PriceFormatOption,
  type SupportedTimezone,
} from '@/lib/locale-settings-store'

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ru: 'Русский',
  en: 'English',
  lv: 'Latviešu',
}

const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  EUR: 'EUR — Евро (€)',
  USD: 'USD — Доллар США ($)',
  RUB: 'RUB — Российский рубль (₽)',
}

const DATE_FORMAT_LABELS: Record<DateFormatOption, string> = {
  'DD.MM.YYYY': 'DD.MM.YYYY (27.05.2026)',
  'MM/DD/YYYY': 'MM/DD/YYYY (05/27/2026)',
  'YYYY-MM-DD': 'YYYY-MM-DD (2026-05-27)',
}

const TIMEZONE_LABELS: Record<SupportedTimezone, string> = {
  UTC: 'UTC (UTC+0)',
  'Europe/London': 'Europe/London (UTC+0/+1)',
  'Europe/Riga': 'Europe/Riga (UTC+2/+3)',
  'Europe/Moscow': 'Europe/Moscow (UTC+3)',
}

const PRICE_FORMAT_LABELS: Record<PriceFormatOption, string> = {
  symbol_before: 'Символ до числа (€ 100.00)',
  symbol_after: 'Символ после числа (100.00 €)',
}

function formatPricePreview(symbol: string, format: PriceFormatOption): string {
  return format === 'symbol_before' ? `${symbol} 1 234.56` : `1 234.56 ${symbol}`
}

export default function AdminLocalePage() {
  const store = useLocaleSettingsStore()

  const [language, setLanguage] = React.useState<SupportedLanguage>(store.language)
  const [currency, setCurrency] = React.useState<SupportedCurrency>(store.currency)
  const [timezone, setTimezone] = React.useState<SupportedTimezone>(store.timezone)
  const [dateFormat, setDateFormat] = React.useState<DateFormatOption>(store.dateFormat)
  const [priceFormat, setPriceFormat] = React.useState<PriceFormatOption>(store.priceFormat)
  const [message, setMessage] = React.useState<string>('')

  const currencySymbol = CURRENCY_SYMBOLS[currency]
  const pricePreview = formatPricePreview(currencySymbol, priceFormat)

  const handleSave = () => {
    store.setLanguage(language)
    store.setCurrency(currency)
    store.setTimezone(timezone)
    store.setDateFormat(dateFormat)
    store.setPriceFormat(priceFormat)
    setMessage('Настройки сохранены')
    setTimeout(() => setMessage(''), 3000)
  }

  const handleReset = () => {
    store.reset()
    setLanguage('ru')
    setCurrency('EUR')
    setTimezone('Europe/Riga')
    setDateFormat('DD.MM.YYYY')
    setPriceFormat('symbol_before')
    setMessage('Настройки сброшены к умолчанию')
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Локализация
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Настройте язык, валюту, форматы даты и цены.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="space-y-4">
          {/* Language */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Язык интерфейса</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Язык по умолчанию для новых пользователей и неавторизованных посетителей сайта.
              </p>
            </div>

            <div className="max-w-xs space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Язык по умолчанию
              </label>
              <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
                <SelectTrigger className={SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ru', 'en', 'lv'] as SupportedLanguage[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {LANGUAGE_LABELS[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Currency */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Валюта</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Основная валюта магазина. Символ подставляется автоматически.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Валюта
                </label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['EUR', 'USD', 'RUB'] as SupportedCurrency[]).map((cur) => (
                      <SelectItem key={cur} value={cur}>
                        {CURRENCY_LABELS[cur]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Символ (определяется автоматически)
                </label>
                <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  {currencySymbol}
                </div>
              </div>
            </div>
          </section>

          {/* Date and time */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Дата и время</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Форматы отображения дат и часовой пояс магазина.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Формат даты
                </label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormatOption)}>
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormatOption[]).map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {DATE_FORMAT_LABELS[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Часовой пояс
                </label>
                <Select value={timezone} onValueChange={(v) => setTimezone(v as SupportedTimezone)}>
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {TIMEZONE_LABELS[tz]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Price format */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Формат цены</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Расположение символа валюты относительно суммы.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Расположение символа
                </label>
                <Select value={priceFormat} onValueChange={(v) => setPriceFormat(v as PriceFormatOption)}>
                  <SelectTrigger className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['symbol_before', 'symbol_after'] as PriceFormatOption[]).map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {PRICE_FORMAT_LABELS[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Превью цены
                </label>
                <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground">
                  {pricePreview}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" onClick={handleReset}>
            Сбросить к умолчанию
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </div>
      </main>
    </AdminGate>
  )
}
