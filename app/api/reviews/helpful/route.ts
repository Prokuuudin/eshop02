import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, successResponse } from '@/lib/api-helpers'
import { markReviewHelpful } from '@/lib/reviews-data-store'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const VOTER_COOKIE = 'review_voter'
const VOTER_COOKIE_AGE = 60 * 60 * 24 * 365

const clientIp = (req: NextRequest): string =>
  req.headers.get('cf-connecting-ip')?.trim()
  || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || req.headers.get('x-real-ip')?.trim()
  || 'unknown'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ip = clientIp(req)
    const user = await getServerUser()
    const existingAnonymousId = req.cookies.get(VOTER_COOKIE)?.value
    const anonymousId = existingAnonymousId || randomUUID()
    const voterKey = user ? `user:${user.id}` : `anon:${anonymousId}`

    const [ipLimit, voterLimit] = await Promise.all([
      checkRateLimit(`review-helpful:ip:${ip}`),
      checkRateLimit(`review-helpful:voter:${voterKey}`),
    ])
    if (ipLimit.limited || voterLimit.limited) {
      const resetAt = Math.max(ipLimit.resetAt, voterLimit.resetAt)
      return NextResponse.json(
        { error: 'rate_limited', resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
      )
    }

    const body = (await req.json()) as { id?: string }
    const id = body.id?.trim()
    if (!id) return errorResponse('Review id is required', 400)

    const result = await markReviewHelpful(id, voterKey)
    if (result === 'not_found') return errorResponse('Review not found', 404)

    const response = successResponse({ id, counted: result === 'incremented' })
    if (!user && !existingAnonymousId) {
      response.cookies.set(VOTER_COOKIE, anonymousId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: VOTER_COOKIE_AGE,
      })
    }
    if (Math.random() < 0.01) void gcRateLimitStore()
    return response
  } catch (error) {
    console.error('Review helpful POST error:', error)
    return errorResponse('Internal server error', 500)
  }
}
