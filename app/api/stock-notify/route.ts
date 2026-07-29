import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const STOCK_NOTIFY_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 5 }
const clientIp = (req: NextRequest) =>
  req.headers.get('cf-connecting-ip')?.trim()
  || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || req.headers.get('x-real-ip')?.trim()
  || 'unknown'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 4096) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    const body = (await req.json()) as {
      productId?: string
      productTitle?: string
      email?: string
    }

    const productId = body.productId?.trim() ?? ''
    const productTitle = body.productTitle?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!productId || !email) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (productId.length > 128 || productTitle.length > 200 || email.length > 254) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }

    const [ipLimit, emailLimit] = await Promise.all([
      checkRateLimit(`stock-notify:ip:${clientIp(req)}`, STOCK_NOTIFY_LIMIT),
      checkRateLimit(`stock-notify:email:${email}`, STOCK_NOTIFY_LIMIT),
    ])
    if (ipLimit.limited || emailLimit.limited) {
      const resetAt = Math.max(ipLimit.resetAt, emailLimit.resetAt)
      return NextResponse.json({ error: 'rate_limited', resetAt }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
      })
    }

    // Get userId from session if available
    const user = await getServerUser()
    const userId = user?.id ?? null

    const sub = await prisma.stockNotification.upsert({
      where: { productId_email: { productId, email } },
      create: {
        id: randomUUID(),
        productId,
        productTitle,
        email,
        userId,
        notified: false,
      },
      update: { notified: false, notifiedAt: null },
    })

    if (Math.random() < 0.01) void gcRateLimitStore()

    return NextResponse.json({ id: sub.id })
  } catch (e) {
    console.error('[stock-notify POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
