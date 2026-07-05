import { NextRequest, NextResponse } from 'next/server'
import { subscribeToNewsletter } from '@/lib/newsletter-store'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; consent?: boolean }
    const email = body.email?.trim() ?? ''

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
    }
    if (body.consent !== true) {
      return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 })
    }

    await subscribeToNewsletter(email)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[newsletter/subscribe]', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
