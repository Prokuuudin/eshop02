import { useI18n } from '@/lib/i18n-context'
import { translations } from '@/data/translations'

interface TranslationHelper {
  t: (key: string, defaultValue?: string) => string
  language: 'ru' | 'en' | 'lv'
}

export function useTranslation(): TranslationHelper {
  const { language } = useI18n()

  const t = (key: string, defaultValue?: string): string => {
    const value = translations[language][key];
    return typeof value === 'string' ? value : defaultValue || key;
  }

  return { t, language }
}
