import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SupportedLanguage = 'ru' | 'en' | 'lv'
export type SupportedCurrency = 'EUR' | 'USD' | 'RUB'
export type DateFormatOption = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type PriceFormatOption = 'symbol_before' | 'symbol_after'

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  EUR: '€',
  USD: '$',
  RUB: '₽',
}

export const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Riga',
  'Europe/Moscow',
] as const

export type SupportedTimezone = (typeof TIMEZONES)[number]

export interface LocaleSettings {
  language: SupportedLanguage
  currency: SupportedCurrency
  currencySymbol: string
  timezone: SupportedTimezone
  dateFormat: DateFormatOption
  priceFormat: PriceFormatOption
}

interface LocaleSettingsStore extends LocaleSettings {
  setLanguage: (language: SupportedLanguage) => void
  setCurrency: (currency: SupportedCurrency) => void
  setTimezone: (timezone: SupportedTimezone) => void
  setDateFormat: (dateFormat: DateFormatOption) => void
  setPriceFormat: (priceFormat: PriceFormatOption) => void
  reset: () => void
}

const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  language: 'ru',
  currency: 'EUR',
  currencySymbol: '€',
  timezone: 'Europe/Riga',
  dateFormat: 'DD.MM.YYYY',
  priceFormat: 'symbol_before',
}

export const useLocaleSettingsStore = create<LocaleSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_LOCALE_SETTINGS,

      setLanguage: (language) => set({ language }),

      setCurrency: (currency) =>
        set({
          currency,
          currencySymbol: CURRENCY_SYMBOLS[currency],
        }),

      setTimezone: (timezone) => set({ timezone }),

      setDateFormat: (dateFormat) => set({ dateFormat }),

      setPriceFormat: (priceFormat) => set({ priceFormat }),

      reset: () => set({ ...DEFAULT_LOCALE_SETTINGS }),
    }),
    {
      name: 'locale-settings',
    }
  )
)
