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
// physically lives under app/[lang]/. On an unprefixed URL it first picks the
// language server-side (saved cookie → browser Accept-Language → lv) and
// redirects to /en or /lv before anything renders.

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

/**
 * Localize an internal link href, keeping its query and hash:
 * localizeInternalHref('/#faq', 'lv') → '/lv#faq'. Left unchanged: external and
 * protocol-relative URLs, already prefixed paths, API routes and files (paths with an
 * extension), which live outside app/[lang].
 */
export function localizeInternalHref(href: string, lang: Language): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const queryOrHash = href.search(/[?#]/)
  const pathname = queryOrHash === -1 ? href : href.slice(0, queryOrHash)
  const suffix = queryOrHash === -1 ? '' : href.slice(queryOrHash)
  if (/^\/(?:ru|en|lv|api|_next)(?:\/|$)/.test(pathname) || /\.[^/]+$/.test(pathname)) return href
  return localizePath(pathname, lang) + suffix
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

/** Language for a first visit whose browser languages are all unsupported. */
export const AUTO_DETECT_FALLBACK_LANGUAGE: Language = 'lv'

/**
 * Pick the supported language the browser prefers most from an Accept-Language
 * header ("lv-LV,lv;q=0.9,en;q=0.8" → 'lv'). Returns null when none is supported.
 */
export function negotiateLanguage(acceptLanguage: string): Language | null {
  let best: Language | null = null
  let bestQ = 0
  for (const part of acceptLanguage.split(',')) {
    const [tag, ...params] = part.split(';')
    const lang = tag.trim().toLowerCase().split('-')[0]
    if (!isLanguage(lang)) continue
    const qParam = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith('q='))
    const q = qParam ? Number(qParam.slice(2)) : 1
    // Equal weights keep header order (the first listed wins).
    if (Number.isFinite(q) && q > bestQ) {
      best = lang
      bestQ = q
    }
  }
  return best
}

/** Resolve a route param to a supported language (defensive fallback). */
export function resolveLanguage(value: string | undefined): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}
