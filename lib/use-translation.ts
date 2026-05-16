"use client"

import React from 'react'
import { useI18n } from '@/lib/i18n-context'
import { translations } from '@/data/translations'
import { getSiteContentOverrides, loadSiteContentOverrides, subscribeSiteContentChanges } from '@/lib/site-content-store'

type TranslationParams = Record<string, string | number>

interface TranslationHelper {
  t: (key: string, defaultValue?: string, params?: TranslationParams) => string
  language: 'ru' | 'en' | 'lv'
}

const interpolate = (template: string, params?: TranslationParams): string => {
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (fullMatch, rawKey: string) => {
    const value = params[rawKey]
    return value === undefined || value === null ? fullMatch : String(value)
  })
}

export function useTranslation(): TranslationHelper {
  const { language } = useI18n()
  const [overrides, setOverrides] = React.useState(() => getSiteContentOverrides())

  React.useEffect(() => {
    const sync = () => setOverrides(getSiteContentOverrides())
    const unsubscribe = subscribeSiteContentChanges(sync)
    sync()
    void loadSiteContentOverrides().then(sync)
    return unsubscribe
  }, [])

  const t = (key: string, defaultValue?: string, params?: TranslationParams): string => {
    // Для кредитного калькулятора всегда используем основной перевод
    if (key === 'credit.downPaymentEur' || key === 'credit.monthlyPayment' || key === 'credit.calculatorTitle' || key === 'credit.downPaymentPercent' || key === 'credit.termMonths') {
      const value = translations[language][key]
      const resolved = typeof value === 'string' ? value : defaultValue || key
      return interpolate(resolved, params)
    }
    const override = overrides.text[language]?.[key]
    if (typeof override === 'string' && override.length > 0) {
      return interpolate(override, params)
    }
    const value = translations[language][key]
    const resolved = typeof value === 'string' ? value : defaultValue || key
    return interpolate(resolved, params)
  }

  return { t, language }
}
