import type { Language } from '@/data/translations'

export type DateFormatOption = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type PriceFormatOption = 'symbol_before' | 'symbol_after'

export const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Riga',
  'Europe/Moscow',
] as const

export type SupportedTimezone = (typeof TIMEZONES)[number]

export type LocaleConfig = {
  defaultLanguage: Language
  dateFormat: DateFormatOption
  timezone: SupportedTimezone
  priceFormat: PriceFormatOption
}

export const DEFAULT_LOCALE_CONFIG: LocaleConfig = {
  defaultLanguage: 'ru',
  dateFormat: 'DD.MM.YYYY',
  timezone: 'Europe/Riga',
  priceFormat: 'symbol_before',
}
