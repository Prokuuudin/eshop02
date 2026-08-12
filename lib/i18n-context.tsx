
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
import { usePathname, useRouter } from 'next/navigation'
import { Language } from '@/data/translations'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  isLanguage,
  localizePath,
  stripLangPrefix,
} from '@/lib/i18n-routing'
import type { LocaleConfig } from '@/lib/locale-config'

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
  defaultLanguage = DEFAULT_LANGUAGE,
}: {
  children: ReactNode
  initialLanguage?: Language
  defaultLanguage?: LocaleConfig['defaultLanguage']
}): ReactNode {
  // The language is defined by the URL segment (app/[lang]) — no client state.
  // Navigating to another language remounts nothing; the layout re-renders with
  // the new param and this provider receives the new value.
  const language: Language = isLanguage(initialLanguage) ? initialLanguage : DEFAULT_LANGUAGE
  const router = useRouter()

  // Keep the cookie/localStorage in sync with an explicitly visited language URL,
  // and migrate legacy visitors whose choice only lives in localStorage (the
  // middleware cannot see localStorage, so without the cookie they would be
  // stuck on the default language).
  useEffect(() => {
    const cookieLang = readLanguageCookie()

    if (language !== DEFAULT_LANGUAGE) {
      // On /en/* or /lv/* the URL is the explicit choice — persist it.
      if (cookieLang !== language) writeLanguageCookie(language)
      localStorage.setItem(LANGUAGE_KEY, language)
      return
    }

    if (cookieLang) return

    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (saved === 'en' || saved === 'lv') {
      writeLanguageCookie(saved)
      router.replace(localizePath(currentUnprefixedLocation(), saved))
      return
    }
    if (saved === 'ru') return

    if (isLanguage(defaultLanguage) && defaultLanguage !== DEFAULT_LANGUAGE) {
      writeLanguageCookie(defaultLanguage)
      router.replace(localizePath(currentUnprefixedLocation(), defaultLanguage))
    }
  }, [defaultLanguage, language, router])

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
