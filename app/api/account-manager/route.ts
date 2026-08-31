import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

const MESSAGE_LIMIT = { windowMs: 5 * 60 * 1000, maxAttempts: 20 }

const companyIdFrom = (req: NextRequest): string | null =>
  req.nextUrl.searchParams.get('companyId') ?? req.headers.get('x-company-id')

async function authorize(req: NextRequest, bodyCompanyId?: string) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const companyId = bodyCompanyId ?? companyIdFrom(req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  if (!user.companyId || user.companyId !== companyId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return { user, companyId }
}

const serialize = (message: {
  id: string
  companyId: string
  senderType: string
  text: string
  createdAt: Date
  author: { name: string | null }
}) => ({
  id: message.id,
  companyId: message.companyId,
  from: message.senderType,
  text: message.text,
  createdAt: message.createdAt.toISOString(),
  authorName: message.author.name ?? undefined,
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorize(req)
  if (auth instanceof NextResponse) return auth

  const messages = await prisma.accountManagerMessage.findMany({
    where: { companyId: auth.companyId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return NextResponse.json({ messages: messages.map(serialize) })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 8192) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  let body: { companyId?: string; text?: string }
  try {
    body = (await req.json()) as { companyId?: string; text?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const auth = await authorize(req, body.companyId)
  if (auth instanceof NextResponse) return auth
  const limit = await checkRateLimit(`account-manager:${auth.companyId}:${auth.user.id}`, MESSAGE_LIMIT)
  if (limit.limited) {
    return NextResponse.json({ error: 'rate_limited', resetAt: limit.resetAt }, {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) },
    })
  }
  const text = body.text?.trim() ?? ''
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > 5000) return NextResponse.json({ error: 'text_too_long' }, { status: 400 })

  const senderType = auth.user.platformRole === 'admin' ? 'manager' : 'client'
  const message = await prisma.accountManagerMessage.create({
    data: { companyId: auth.companyId, authorId: auth.user.id, senderType, text },
    include: { author: { select: { name: true } } },
  })
  if (Math.random() < 0.01) void gcRateLimitStore()
  return NextResponse.json({ message: serialize(message) }, { status: 201 })
}
