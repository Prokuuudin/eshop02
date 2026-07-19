// Shared (server + client) helpers for language-prefixed routing.
//
// URL scheme:
//   ru (default) — unprefixed:  /product/5   (existing indexed URLs keep working)
//   en           — /en/product/5
//   lv           — /lv/product/5
//   /ru/*        — 308-redirects to the unprefixed URL (middleware) so the
//                  default language has exactly one canonical URL per page.
//
// The middleware rewrites unprefixed paths to /ru/* internally, so every route
// physically lives under app/[lang]/.

import type { Language } from '@/data/translations'

export const LANGUAGES: readonly Language[] = ['ru', 'en', 'lv'] as const
export const DEFAULT_LANGUAGE: Language = 'ru'
export const LANGUAGE_COOKIE = 'eshop_language'

export function isLanguage(value: string | undefined | null): value is Language {
  return value === 'ru' || value === 'en' || value === 'lv'
}

/** URL prefix for a language: '' for the default, '/en' | '/lv' otherwise. */
export function langPrefix(lang: Language): string {
  return lang === DEFAULT_LANGUAGE ? '' : `/${lang}`
}

/** Localize an unprefixed path: localizePath('/product/5', 'en') → '/en/product/5'. */
export function localizePath(path: string, lang: Language): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const prefix = langPrefix(lang)
  if (!prefix) return normalized
  return normalized === '/' ? prefix : `${prefix}${normalized}`
}

/** Split a pathname into its language and unprefixed path. */
export function stripLangPrefix(pathname: string): { lang: Language; path: string } {
  const match = pathname.match(/^\/(ru|en|lv)(\/.*)?$/)
  if (!match) return { lang: DEFAULT_LANGUAGE, path: pathname || '/' }
  return { lang: match[1] as Language, path: match[2] || '/' }
}

/**
 * Metadata alternates for an indexable page. `path` is the unprefixed path.
 * Relative URLs — resolved against metadataBase.
 */
export function pageAlternates(path: string, lang: Language): {
  canonical: string
  languages: Record<string, string>
} {
  return {
    canonical: localizePath(path, lang),
    languages: {
      ru: localizePath(path, 'ru'),
      en: localizePath(path, 'en'),
      lv: localizePath(path, 'lv'),
      'x-default': localizePath(path, DEFAULT_LANGUAGE),
    },
  }
}

/** Resolve a route param to a supported language (defensive fallback). */
export function resolveLanguage(value: string | undefined): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}
