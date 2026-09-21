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
 * The origin Next.js itself would compute from the request (Host header + the protocol
 * of the raw connection it received). Behind a TLS-terminating reverse proxy that doesn't
 * get forwarded-proto handling (e.g. IIS/iisnode in front of the plain node:http server in
 * server.js), Next sees an unencrypted connection and reports `http:` even though the
 * browser connected over `https:` — so this can legitimately disagree with the browser's
 * Origin header on an otherwise same-origin request.
 */
function requestDerivedOrigin(req: NextRequest): string {
  return req.nextUrl.origin
}

/**
 * The operator-configured canonical origin, when one is set. Unlike requestDerivedOrigin,
 * this doesn't depend on how a reverse proxy forwarded the connection, so it's the
 * authoritative value in production (see lib/site-url.ts — same env var, same requirement).
 * Never derived from client-supplied headers (Origin, Referer, X-Forwarded-Host), so an
 * attacker cannot influence it.
 */
function configuredSiteOrigin(): string | null {
  if (process.env.NODE_ENV !== 'production') return null
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return configured ? originOf(configured) : null
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
 * The Origin/Referer header must match req.nextUrl.origin (the host this request arrived
 * on) OR the configured NEXT_PUBLIC_SITE_URL origin in production (see configuredSiteOrigin
 * above) — never anything client-supplied. Checking both, rather than only nextUrl.origin,
 * keeps this working unmodified on localhost/Vercel while also being correct behind a
 * reverse proxy that doesn't preserve the original protocol. This does not widen what an
 * attacker can pass: both values are server-derived (Host header the browser actually
 * targeted, or an env var), not read from the request's Origin/Referer/X-Forwarded-* headers.
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

  const allowedOrigins = new Set([requestDerivedOrigin(req)])
  const siteOrigin = configuredSiteOrigin()
  if (siteOrigin) allowedOrigins.add(siteOrigin)

  const requestOrigin = req.headers.get('origin') ?? originOf(req.headers.get('referer') ?? '')

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
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
