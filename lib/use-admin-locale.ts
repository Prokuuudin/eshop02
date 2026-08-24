'use client'

import { useCallback } from 'react'
import { useTranslation } from '@/lib/use-translation'

export function useAdminLocale(): {
  language: 'ru' | 'en' | 'lv'
  locale: 'ru-RU' | 'en-US' | 'lv-LV'
  l: (ru: string, en: string, lv: string) => string
} {
  const { language } = useTranslation()
  const l = useCallback(
    (ru: string, en: string, lv: string): string => language === 'ru' ? ru : language === 'lv' ? lv : en,
    [language]
  )
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  return { language, locale, l }
}
