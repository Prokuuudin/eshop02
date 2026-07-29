import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// First-party observability sink. Web Vitals (field CWV) and client-side runtime
// errors are logged server-side so they surface in the hosting logs — no third
// party, no cookies, no personal data stored. Replace/extend with Sentry etc. later.

const MAX = (s: unknown, n: number): string => (typeof s === 'string' ? s.slice(0, n) : '')

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    if (Math.random() < 0.02) void gcRateLimitStore()

    const body = (await req.json().catch(() => null)) as
      | { type?: string; name?: string; value?: number; rating?: string; path?: string; message?: string; stack?: string }
      | null
    if (!body || typeof body.type !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (body.type === 'vitals') {
      // Low volume (one set per page load); log for aggregation in the hosting dashboard.
      console.log('[web-vitals]', JSON.stringify({
        name: MAX(body.name, 40),
        value: typeof body.value === 'number' ? Math.round(body.value * 1000) / 1000 : null,
        rating: MAX(body.rating, 20),
        path: MAX(body.path, 200),
      }))
      return NextResponse.json({ ok: true })
    }

    if (body.type === 'error') {
      // Errors can spam — cap per IP so a broken client can't flood the logs.
      const rl = await checkRateLimit(`telemetry-error:${clientIp(req)}`)
      if (rl.limited) return NextResponse.json({ ok: true, throttled: true })
      console.error('[client-error]', JSON.stringify({
        message: MAX(body.message, 500),
        stack: MAX(body.stack, 2000),
        path: MAX(body.path, 200),
      }))
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false }, { status: 400 })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
