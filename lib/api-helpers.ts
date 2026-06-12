import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServerUser } from '@/lib/server-auth'

type AuthUser = {
  id: string
  email?: string
  companyId?: string
  apiAccess: boolean
}

type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; error: string; status: number }

// Demo key for the B2B webhooks playground — only honoured outside production.
const DEMO_API_KEY = 'b2b-demo-api-key-12345'

/** Valid API keys, configured via the V1_API_KEYS env var (comma-separated). */
function getConfiguredApiKeys(): string[] {
  const keys = (process.env.V1_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length >= 16)

  // In dev/preview the hardcoded demo key keeps the integrations demo working.
  // In production, only explicitly configured keys are accepted (fail closed).
  if (process.env.NODE_ENV !== 'production') {
    keys.push(DEMO_API_KEY)
  }
  return keys
}

/** Constant-time membership check so we don't leak key length/prefix via timing. */
function isValidApiKey(candidate: string): boolean {
  const keys = getConfiguredApiKeys()
  const candidateBuf = Buffer.from(candidate)
  let matched = false
  for (const key of keys) {
    const keyBuf = Buffer.from(key)
    if (keyBuf.length === candidateBuf.length && timingSafeEqual(keyBuf, candidateBuf)) {
      matched = true
    }
  }
  return matched
}

/**
 * API Authentication middleware.
 * Supports: API key in `x-api-key` header (validated against V1_API_KEYS env),
 * or an authenticated server session cookie.
 */
export async function authenticateRequest(req: NextRequest) {
  // Check for API key header — fail closed if none are configured.
  const apiKey = req.headers.get('x-api-key')

  if (apiKey) {
    if (!isValidApiKey(apiKey)) {
      return {
        authenticated: false,
        error: 'Invalid API key',
        status: 401,
      } as AuthResult
    }

    const companyId = req.headers.get('x-company-id') || undefined

    return {
      authenticated: true,
      user: {
        id: `api_${apiKey.substring(0, 8)}`,
        companyId,
        apiAccess: true,
      },
    } as AuthResult
  }

  // Fall back to an authenticated server session.
  const user = await getServerUser()
  if (!user) {
    return {
      authenticated: false,
      error: 'Unauthorized',
      status: 401,
    } as AuthResult
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      // Session users get API access only for read endpoints; write endpoints additionally gate on this.
      apiAccess: false,
    },
  } as AuthResult
}

/**
 * Error response helper
 */
export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json(
    {
      error: message,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}

/**
 * Success response helper
 */
export function successResponse(data: any, status: number = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}

/**
 * Pagination helper
 */
export function parsePagination(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

/**
 * Filter parser helper
 */
export function parseFilters(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filters: Record<string, any> = {}

  // Parse common filters
  const category = searchParams.get('category')
  if (category) filters.category = category

  const status = searchParams.get('status')
  if (status) filters.status = status

  const startDate = searchParams.get('startDate')
  if (startDate) filters.startDate = new Date(startDate)

  const endDate = searchParams.get('endDate')
  if (endDate) filters.endDate = new Date(endDate)

  const search = searchParams.get('search')
  if (search) filters.search = search

  const minPrice = searchParams.get('minPrice')
  if (minPrice !== null && minPrice !== '') filters.minPrice = Number(minPrice)

  const maxPrice = searchParams.get('maxPrice')
  if (maxPrice !== null && maxPrice !== '') filters.maxPrice = Number(maxPrice)

  return filters
}
