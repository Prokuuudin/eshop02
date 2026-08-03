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

const SELECT_CLASS =
  'w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm'

const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
  lv: 'Latviešu',
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

function formatPricePreview(format: PriceFormatOption): string {
  return format === 'symbol_before' ? '€ 1 234.56' : '1 234.56 €'
}

export default function AdminLocalePage(): React.ReactElement {
  const [config, setConfig] = useState<LocaleConfig>(DEFAULT_LOCALE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string>('')

  // Load the admin-authoritative config directly — don't seed from a
  // possibly-stale client cache (same reasoning as app/admin/bonus/page.tsx).
  useEffect(() => {
    adminFetchJson<LocaleConfig>('/api/admin/locale-config')
      .then((data: LocaleConfig | null) => { if (data) setConfig(data) })
      .catch((error) => setMessage(classifyAdminError(error, 'Локализация').message))
      .finally(() => setLoading(false))
  }, [])

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
    }).catch((error) => setMessage(classifyAdminError(error, 'Сохранение локализации').message))
  }

  const handleSave = (): void => persist(config, 'Настройки сохранены')
  const handleReset = (): void => persist(DEFAULT_LOCALE_CONFIG, 'Настройки сброшены к умолчанию')

  if (loading) {
    return (
      <AdminGate>
        <main className="w-full py-4">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
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
              Локализация
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Настройте язык по умолчанию, формат даты, часовой пояс и формат цены.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
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
              <h2 className="text-lg font-semibold text-foreground">Язык интерфейса</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Язык по умолчанию для новых пользователей и неавторизованных посетителей сайта.
              </p>
            </div>

            <div className="max-w-xs space-y-1">
              <label htmlFor="admin-locale-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Язык по умолчанию
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
                      {LANGUAGE_LABELS[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Валюта</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Магазин работает только в евро — конвертация в другие валюты не поддерживается.
              </p>
            </div>
            <div className="max-w-xs">
              <div className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                EUR — Евро (€)
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Дата и время</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Формат даты применяется на всём сайте и в письмах. Часовой пояс — только для писем и уведомлений (клиентские страницы всегда показывают время браузера посетителя).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="admin-locale-field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Формат даты
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
                <label htmlFor="admin-locale-field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Часовой пояс (для писем)
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
              <h2 className="text-lg font-semibold text-foreground">Формат цены</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Расположение символа валюты относительно суммы.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="admin-locale-field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Расположение символа
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
                        {PRICE_FORMAT_LABELS[fmt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Превью цены
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
            Сбросить к умолчанию
          </Button>
          <Button onClick={handleSave}>Сохранить</Button>
        </div>
      </main>
    </AdminGate>
  )
}
