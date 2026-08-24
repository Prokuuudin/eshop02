'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TIMEZONES,
  DEFAULT_LOCALE_CONFIG,
  type LocaleConfig,
  type DateFormatOption,
  type PriceFormatOption,
  type SupportedTimezone,
} from '@/lib/locale-config'
import type { Language } from '@/data/translations'
import { adminFetchJson, classifyAdminError } from '@/lib/admin-ui-errors'
import { useAdminLocale } from '@/lib/use-admin-locale'

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'

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

function formatPricePreview(format: PriceFormatOption): string {
  return format === 'symbol_before' ? '€ 1 234.56' : '1 234.56 €'
}

export default function AdminLocalePage(): React.ReactElement {
  const { l } = useAdminLocale()
  const languageLabels: Record<Language, string> = {
    ru: l('Русский', 'Russian', 'Krievu'),
    en: l('Английский', 'English', 'Angļu'),
    lv: l('Латышский', 'Latvian', 'Latviešu'),
  }
  const priceFormatLabels: Record<PriceFormatOption, string> = {
    symbol_before: l('Символ до числа (€ 100.00)', 'Symbol before amount (€ 100.00)', 'Simbols pirms summas (€ 100.00)'),
    symbol_after: l('Символ после числа (100.00 €)', 'Symbol after amount (100.00 €)', 'Simbols pēc summas (100.00 €)'),
  }
  const [config, setConfig] = useState<LocaleConfig>(DEFAULT_LOCALE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string>('')

  // Load the admin-authoritative config directly — don't seed from a
  // possibly-stale client cache (same reasoning as app/admin/bonus/page.tsx).
  useEffect(() => {
    adminFetchJson<LocaleConfig>('/api/admin/locale-config')
      .then((data: LocaleConfig | null) => { if (data) setConfig(data) })
      .catch((error) => setMessage(classifyAdminError(error, l('Локализация', 'Localization', 'Lokalizācija')).message))
      .finally(() => setLoading(false))
  }, [l])

  const pricePreview = formatPricePreview(config.priceFormat)

  const persist = (next: LocaleConfig, successMessage: string): void => {
    setConfig(next)
    void adminFetchJson('/api/admin/locale-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).then(() => {
      setMessage(successMessage)
      setTimeout(() => setMessage(''), 3000)
    }).catch((error) => setMessage(classifyAdminError(error, l('Сохранение локализации', 'Saving localization', 'Lokalizācijas saglabāšana')).message))
  }

  const handleSave = (): void => persist(config, l('Настройки сохранены', 'Settings saved', 'Iestatījumi saglabāti'))
  const handleReset = (): void => persist(DEFAULT_LOCALE_CONFIG, l('Настройки сброшены к умолчанию', 'Settings reset to defaults', 'Atjaunoti noklusējuma iestatījumi'))

  if (loading) {
    return (
      <AdminGate>
        <main className="w-full py-4">
          <p className="text-sm text-muted-foreground">{l('Загрузка...', 'Loading...', 'Ielāde...')}</p>
        </main>
      </AdminGate>
    )
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {l('Локализация', 'Localization', 'Lokalizācija')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {l('Настройте язык по умолчанию, формат даты, часовой пояс и формат цены.', 'Configure the default language, date format, time zone and price format.', 'Iestatiet noklusējuma valodu, datuma formātu, laika joslu un cenas formātu.')}
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
          </Link>
        </div>

        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{l('Язык интерфейса', 'Interface language', 'Saskarnes valoda')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l('Язык по умолчанию для новых пользователей и неавторизованных посетителей сайта.', 'Default language for new users and signed-out visitors.', 'Noklusējuma valoda jauniem lietotājiem un viesiem, kuri nav pierakstījušies.')}
              </p>
            </div>

            <div className="max-w-xs space-y-1">
              <label htmlFor="admin-locale-field-1" className="block text-sm font-medium text-foreground">
                {l('Язык по умолчанию', 'Default language', 'Noklusējuma valoda')}
              </label>
              <Select
                value={config.defaultLanguage}
                onValueChange={(v) => setConfig((c) => ({ ...c, defaultLanguage: v as Language }))}
              >
                <SelectTrigger id="admin-locale-field-1" className={SELECT_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {languageLabels[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{l('Валюта', 'Currency', 'Valūta')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l('Магазин работает только в евро — конвертация в другие валюты не поддерживается.', 'The store operates in euros only; currency conversion is not supported.', 'Veikals darbojas tikai eiro; konvertēšana citās valūtās netiek atbalstīta.')}
              </p>
            </div>
            <div className="max-w-xs">
              <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                EUR — {l('Евро', 'Euro', 'Eiro')} (€)
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{l('Дата и время', 'Date and time', 'Datums un laiks')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l('Формат даты применяется на всём сайте и в письмах. Часовой пояс — только для писем и уведомлений (клиентские страницы всегда показывают время браузера посетителя).', 'The date format is used across the site and in emails. The time zone applies only to emails and notifications; customer pages use the visitor’s browser time.', 'Datuma formāts tiek izmantots visā vietnē un e-pastos. Laika josla attiecas tikai uz e-pastiem un paziņojumiem; klientu lapās tiek izmantots apmeklētāja pārlūka laiks.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="admin-locale-field-2" className="block text-sm font-medium text-foreground">
                  {l('Формат даты', 'Date format', 'Datuma formāts')}
                </label>
                <Select
                  value={config.dateFormat}
                  onValueChange={(v) => setConfig((c) => ({ ...c, dateFormat: v as DateFormatOption }))}
                >
                  <SelectTrigger id="admin-locale-field-2" className={SELECT_CLASS}>
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
                <label htmlFor="admin-locale-field-3" className="block text-sm font-medium text-foreground">
                  {l('Часовой пояс (для писем)', 'Time zone (for emails)', 'Laika josla (e-pastiem)')}
                </label>
                <Select
                  value={config.timezone}
                  onValueChange={(v) => setConfig((c) => ({ ...c, timezone: v as SupportedTimezone }))}
                >
                  <SelectTrigger id="admin-locale-field-3" className={SELECT_CLASS}>
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

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{l('Формат цены', 'Price format', 'Cenas formāts')}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l('Расположение символа валюты относительно суммы.', 'Position of the currency symbol relative to the amount.', 'Valūtas simbola novietojums attiecībā pret summu.')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="admin-locale-field-4" className="block text-sm font-medium text-foreground">
                  {l('Расположение символа', 'Symbol position', 'Simbola novietojums')}
                </label>
                <Select
                  value={config.priceFormat}
                  onValueChange={(v) => setConfig((c) => ({ ...c, priceFormat: v as PriceFormatOption }))}
                >
                  <SelectTrigger id="admin-locale-field-4" className={SELECT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['symbol_before', 'symbol_after'] as PriceFormatOption[]).map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        {priceFormatLabels[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="block text-sm font-medium text-foreground">
                  {l('Превью цены', 'Price preview', 'Cenas priekšskatījums')}
                </p>
                <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground">
                  {pricePreview}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" onClick={handleReset}>
            {l('Сбросить к умолчанию', 'Reset to defaults', 'Atjaunot noklusējumu')}
          </Button>
          <Button onClick={handleSave}>{l('Сохранить', 'Save', 'Saglabāt')}</Button>
        </div>
      </main>
    </AdminGate>
  )
}
