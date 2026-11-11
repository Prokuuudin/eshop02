import { NextResponse, type NextRequest } from 'next/server'
import { guardCookieAuthenticatedApiMutation } from '@/lib/api-guard'
import {
  AUTO_DETECT_FALLBACK_LANGUAGE,
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  isLanguage,
  negotiateLanguage,
} from '@/lib/i18n-routing'

const correlationId = (request: NextRequest): string => {
  const supplied = request.headers.get('x-correlation-id')?.trim()
  return supplied && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID()
}

// Same attributes as the cookie written by the language switcher (lib/i18n-context.tsx).
const LANGUAGE_COOKIE_OPTIONS = { path: '/', maxAge: 31536000, sameSite: 'lax' } as const

/**
 * Language for an unprefixed URL, decided before anything renders: the saved
 * choice, then the browser's preferred supported language, then lv. Requests
 * without Accept-Language (search crawlers) keep the canonical unprefixed page.
 */
function unprefixedLanguage(request: NextRequest) {
  const cookieLang = request.cookies.get(LANGUAGE_COOKIE)?.value
  if (isLanguage(cookieLang)) return cookieLang
  const acceptLanguage = request.headers.get('accept-language')?.trim()
  if (!acceptLanguage) return DEFAULT_LANGUAGE
  return negotiateLanguage(acceptLanguage) ?? AUTO_DETECT_FALLBACK_LANGUAGE
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    const requestId = correlationId(request)
    const blocked = guardCookieAuthenticatedApiMutation(request)
    if (blocked) {
      blocked.headers.set('x-correlation-id', requestId)
      return blocked
    }
    const headers = new Headers(request.headers)
    headers.set('x-correlation-id', requestId)
    const response = NextResponse.next({ request: { headers } })
    response.headers.set('x-correlation-id', requestId)
    return response
  }

  if (pathname === '/ru' || pathname.startsWith('/ru/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice('/ru'.length) || '/'
    const response = NextResponse.redirect(url, 308)
    // An explicit /ru link is a language choice; without saving it the unprefixed
    // target would auto-detect another language for this visitor.
    response.cookies.set(LANGUAGE_COOKIE, 'ru', LANGUAGE_COOKIE_OPTIONS)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const firstSegment = pathname.split('/')[1]
  if (firstSegment === 'en' || firstSegment === 'lv') return NextResponse.next()

  const lang = unprefixedLanguage(request)
  if (lang !== DEFAULT_LANGUAGE) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? `/${lang}` : `/${lang}${pathname}`
    return NextResponse.redirect(url, 307)
  }

  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/ru' : `/ru${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/api/:path*', '/((?!api/|_next/|.*\\.[^/]*$).*)'],
}
