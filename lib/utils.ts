import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Language } from '@/data/translations'
import { DEFAULT_LOCALE_CONFIG, type LocaleConfig } from '@/lib/locale-config'
import { formatDateWithPattern } from '@/lib/date-format'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs))
}

export function getLocaleFromLanguage(language: Language): string {
  if (language === 'ru') return 'ru-RU'
  if (language === 'lv') return 'lv-LV'
  return 'en-US'
}

// Populated once by LocaleConfigSync (app/providers.tsx) after fetching the
// admin-configured settings — formatDate/formatEuro read it directly so none
// of their ~49 call sites across the app need to change.
let localeFormatConfig: LocaleConfig = DEFAULT_LOCALE_CONFIG

export function setLocaleFormatConfig(config: LocaleConfig): void {
  localeFormatConfig = config
}

export function formatEuro(value: number, locale: string): string {
  const amount = value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return localeFormatConfig.priceFormat === 'symbol_after' ? `${amount} €` : `€${amount}`
}

export function formatDate(
  value: string | number | Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (options) return new Date(value).toLocaleDateString(locale, options)
  return formatDateWithPattern(new Date(value), localeFormatConfig.dateFormat)
}

export default cn
