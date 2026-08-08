import { NextResponse, type NextRequest } from 'next/server'
import { guardCookieAuthenticatedApiMutation } from '@/lib/api-guard'

const correlationId = (request: NextRequest): string => {
  const supplied = request.headers.get('x-correlation-id')?.trim()
  return supplied && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID()
}

const LANGUAGE_COOKIE = 'eshop_language'

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
    return NextResponse.redirect(url, 308)
  }

  const firstSegment = pathname.split('/')[1]
  if (firstSegment === 'en' || firstSegment === 'lv') return NextResponse.next()

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
  matcher: ['/api/:path*', '/((?!api/|_next/|.*\\.[^/]*$).*)'],
}
