import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth-constants'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * CSRF/Origin guard for cookie-session-authenticated mutating requests.
 *
 * The session cookie is SameSite=lax, which already blocks it being sent on cross-site
 * POST/PUT/PATCH/DELETE — this is defense in depth for that, and the only real protection
 * for any request path where a proxy/CDN config could end up widening that (or a future
 * change to SameSite=none). API-key requests (server-to-server, no browser cookie jar) are
 * exempt: they aren't CSRF-able and authenticate with a bearer secret instead of ambient
 * cookies.
 *
 * Compares Origin/Referer against req.nextUrl.origin (the host this request actually arrived
 * on, per Next's own Host/x-forwarded-host parsing) rather than a fixed config value — that
 * makes it work unmodified across localhost on any port, Vercel preview URLs, and the
 * production domain, without needing NEXT_PUBLIC_SITE_URL to be right in every environment.
 *
 * A real browser-issued fetch/XHR/form POST always sends Origin (same-origin or cross-site) —
 * so a mutating request with neither Origin nor Referer is treated as untrusted and rejected,
 * rather than failed open.
 *
 * Usage in a route handler, before doing any mutation:
 *   const blocked = guardOrigin(req)
 *   if (blocked) return blocked
 */
export function guardOrigin(
  req: NextRequest,
  options: { allowApiKey?: boolean } = {}
): NextResponse | null {
  if (!MUTATING_METHODS.has(req.method)) return null
  if (options.allowApiKey && req.headers.get('x-api-key')) return null

  const allowedOrigin = req.nextUrl.origin
  const requestOrigin = req.headers.get('origin') ?? originOf(req.headers.get('referer') ?? '')

  if (!requestOrigin || requestOrigin !== allowedOrigin) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }

  return null
}

/**
 * Central CSRF policy for API middleware. Only ambient-cookie authenticated
 * mutations need an Origin check; token/API-key/webhook calls without a session
 * cookie are not susceptible to browser CSRF.
 */
export function guardCookieAuthenticatedApiMutation(req: NextRequest): NextResponse | null {
  if (!req.nextUrl.pathname.startsWith('/api/')) return null
  if (!MUTATING_METHODS.has(req.method)) return null
  if (!req.cookies.get(SESSION_COOKIE)?.value) return null
  return guardOrigin(req)
}
