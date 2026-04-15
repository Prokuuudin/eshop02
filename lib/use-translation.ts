"use client"

import React from 'react'
import { useI18n } from '@/lib/i18n-context'
import { translations } from '@/data/translations'
import { getSiteContentOverrides, loadSiteContentOverrides, subscribeSiteContentChanges } from '@/lib/site-content-store'

interface TranslationHelper {
  t: (key: string, defaultValue?: string) => string
  language: 'ru' | 'en' | 'lv'
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

  const t = (key: string, defaultValue?: string): string => {
    const override = overrides.text[language]?.[key]
    if (typeof override === 'string' && override.length > 0) {
      return override
    }

    const value = translations[language][key];
    return typeof value === 'string' ? value : defaultValue || key;
  }

  return { t, language }
}
