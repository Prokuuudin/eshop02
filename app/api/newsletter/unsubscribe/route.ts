import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeFromMarketing, verifyMarketingUnsubToken } from '@/lib/newsletter-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function extract(req: NextRequest, body?: Record<string, unknown>): { email: string; token: string } {
  const sp = req.nextUrl.searchParams
  const email = (String(body?.email ?? sp.get('email') ?? '')).trim().toLowerCase()
  const token = String(body?.token ?? sp.get('token') ?? '').trim()
  return { email, token }
}

function confirmationPage(ok: boolean): NextResponse {
  const body = ok
    ? `<h1>Вы отписаны от рассылки</h1><p>You have been unsubscribed. / Jūs esat atteicies no jaunumiem.</p>`
    : `<h1>Ссылка недействительна</h1><p>This unsubscribe link is invalid or expired.</p>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#111827;text-align:center">${body}</body></html>`
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// Human clicks the link in a marketing email.
export async function GET(req: NextRequest): Promise<Response> {
  const { email, token } = extract(req)
  if (!EMAIL_RE.test(email) || !token || !verifyMarketingUnsubToken(email, token)) {
    return confirmationPage(false)
  }
  await unsubscribeFromMarketing(email)
  return confirmationPage(true)
}

// RFC 8058 one-click: mail clients POST here from the native "Unsubscribe" control.
export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      body = (await req.json()) as Record<string, unknown>
    } else {
      const form = await req.formData()
      body = Object.fromEntries(form.entries())
    }
  } catch {
    // fall back to query params
  }

  const { email, token } = extract(req, body)
  if (!EMAIL_RE.test(email) || !token || !verifyMarketingUnsubToken(email, token)) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }
  await unsubscribeFromMarketing(email)
  return NextResponse.json({ ok: true })
}
