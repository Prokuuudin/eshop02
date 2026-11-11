
"use client";
import { translations } from '@/data/translations'
export function useTranslation(): { t: (key: string) => string } {
  const { language } = useI18n();
  function t(key: string): string {
    return translations[language]?.[key] || key;
  }
  return { t };
}

import React, { createContext, useContext, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Language } from '@/data/translations'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  isLanguage,
  localizePath,
  stripLangPrefix,
} from '@/lib/i18n-routing'

interface I18nContextType {
  language: Language
  setLanguage: (language: Language) => void
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LANGUAGE_KEY = 'eshop_language'

function readLanguageCookie(): Language | null {
  const match = document.cookie.match(/(?:^|;\s*)eshop_language=(ru|en|lv)(?:;|$)/)
  return match ? (match[1] as Language) : null
}

function writeLanguageCookie(language: Language): void {
  // Functional cookie (explicit user language choice) — read by the middleware
  // to keep visitors on their language when they follow unprefixed links.
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`
}

/** Current unprefixed path + query + hash, for language-switch navigation. */
function currentUnprefixedLocation(): string {
  const { path } = stripLangPrefix(window.location.pathname)
  return `${path}${window.location.search}${window.location.hash}`
}

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode
  initialLanguage?: Language
}): ReactNode {
  // The language is defined by the URL segment (app/[lang]) — no client state.
  // Navigating to another language remounts nothing; the layout re-renders with
  // the new param and this provider receives the new value.
  const language: Language = isLanguage(initialLanguage) ? initialLanguage : DEFAULT_LANGUAGE

  // Migrate a legacy localStorage-only preference to a server-readable cookie.
  // Never navigate during hydration: the server has already rendered the
  // negotiated language, and a client redirect would visibly flash it.
  // The migrated preference takes effect on the next navigation/request.
  useEffect(() => {
    const cookieLang = readLanguageCookie()
    if (cookieLang) {
      localStorage.setItem(LANGUAGE_KEY, cookieLang)
      return
    }

    // A legacy saved choice wins over the URL language: without a cookie the
    // proxy may have auto-redirected this visitor to /lv or /en, so the URL is
    // not necessarily their choice. The URL still decides what is shown now.
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (isLanguage(saved)) {
      writeLanguageCookie(saved)
      return
    }

    // No saved choice: persist an explicit /en or /lv visit (unprefixed ru is
    // left to browser negotiation).
    if (language !== DEFAULT_LANGUAGE) {
      writeLanguageCookie(language)
      localStorage.setItem(LANGUAGE_KEY, language)
    }
  }, [language])

  const setLanguage = (newLanguage: Language): void => {
    if (newLanguage === language) return
    writeLanguageCookie(newLanguage)
    localStorage.setItem(LANGUAGE_KEY, newLanguage)
    // A language change crosses the app/[lang] route boundary and also changes
    // middleware behaviour through a cookie. A full navigation avoids stale
    // RSC/router state observed on Vercel after deployments and guarantees that
    // the server renders the destination with the newly written cookie.
    window.location.assign(localizePath(currentUnprefixedLocation(), newLanguage))
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  )
}

/**
 * Pathname without the /en | /lv language prefix — for route checks and
 * breadcrumbs that reason about the logical (unprefixed) route.
 */
export function useUnprefixedPathname(): string {
  const pathname = usePathname()
  return stripLangPrefix(pathname).path
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
