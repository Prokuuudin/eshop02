import en from './translations/en'
import lv from './translations/lv'
import ru from './translations/ru'

export type Language = 'ru' | 'en' | 'lv'

export const translations: Record<Language, Record<string, string>> = {
  ru,
  en,
  lv,
}