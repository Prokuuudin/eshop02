
"use client";
import { translations } from '@/data/translations'
export function useTranslation() {
  const { language } = useI18n();
  function t(key: string): string {
    return translations[language]?.[key] || key;
  }
  return { t };
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Language } from '@/data/translations'

interface I18nContextType {
  language: Language
  setLanguage: (language: Language) => void
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LANGUAGE_KEY = 'eshop_language'
const DEFAULT_LANGUAGE: Language = 'ru'

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE)

  // Load language from localStorage on mount. If there's no saved preference
  // yet, use the admin-configured default instead of a hardcoded fallback —
  // only first-time visitors pay this extra round-trip. Children always render
  // (with the default language on the server) so SSR/prerender HTML is not empty;
  // the saved preference is applied after hydration.
  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY) as Language | null
    if (savedLanguage && ['ru', 'en', 'lv'].includes(savedLanguage)) {
      setLanguageState(savedLanguage)
      return
    }

    fetch('/api/locale-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (config?.defaultLanguage && ['ru', 'en', 'lv'].includes(config.defaultLanguage)) {
          setLanguageState(config.defaultLanguage)
        }
      })
      .catch(() => {})
  }, [])

  // Keep the document language in sync for assistive tech and SEO (the store is
  // trilingual but <html lang> was hardcoded).
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = (newLanguage: Language): void => {
    setLanguageState(newLanguage)
    localStorage.setItem(LANGUAGE_KEY, newLanguage)
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
