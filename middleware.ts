import { NextResponse, type NextRequest } from 'next/server'

// Language routing (see lib/i18n-routing.ts for the URL scheme):
//  - /ru/*          → 308 to the unprefixed URL (single canonical for the default language)
//  - /en/*, /lv/*   → served as-is by app/[lang]/*
//  - unprefixed     → 307 to /<cookieLang>/* when the visitor explicitly chose en/lv
//                     (cookie), otherwise internal rewrite to /ru/* (URL unchanged).
// Crawlers carry no cookie, so every URL serves stable content — no
// Accept-Language sniffing, which would make indexing non-deterministic.

const LANGUAGE_COOKIE = 'eshop_language'

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // Default language: strip the explicit /ru prefix — one canonical URL.
  if (pathname === '/ru' || pathname.startsWith('/ru/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice('/ru'.length) || '/'
    return NextResponse.redirect(url, 308)
  }

  const firstSegment = pathname.split('/')[1]
  if (firstSegment === 'en' || firstSegment === 'lv') {
    return NextResponse.next()
  }

  // Unprefixed path. Honor an explicit language choice (cookie set by the
  // language switcher) so hardcoded internal links keep users in their language.
  const cookieLang = request.cookies.get(LANGUAGE_COOKIE)?.value
  if (cookieLang === 'en' || cookieLang === 'lv') {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? `/${cookieLang}` : `/${cookieLang}${pathname}`
    return NextResponse.redirect(url, 307)
  }

  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/ru' : `/ru${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Everything except API routes, Next internals and static files (dot in the
  // last segment covers sitemap.xml, robots.txt, images, fonts, …).
  matcher: ['/((?!api/|_next/|.*\\.[^/]*$).*)'],
}
