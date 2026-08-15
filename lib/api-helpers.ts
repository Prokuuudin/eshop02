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

type ApiKeyEntry = { key: string; companyId?: string }

type ApiFilters = {
  category: string
  status: string
  startDate: Date
  endDate: Date
  search: string
  minPrice: number
  maxPrice: number
}

/**
 * Valid API keys, configured via the V1_API_KEYS env var (comma-separated).
 * Each entry is either a bare `key` or `key:companyId`. A key bound to a company
 * may act ONLY for that company — the client-supplied `x-company-id` header can
 * no longer widen its scope. Bare keys remain unscoped (single trusted integrator).
 */
function getConfiguredApiKeys(): ApiKeyEntry[] {
  const entries = (process.env.V1_API_KEYS ?? '')
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw): ApiKeyEntry => {
      const sep = raw.indexOf(':')
      if (sep === -1) return { key: raw }
      return { key: raw.slice(0, sep).trim(), companyId: raw.slice(sep + 1).trim() || undefined }
    })
    .filter((e) => e.key.length >= 16)

  // In dev/preview the hardcoded demo key keeps the integrations demo working.
  // In production, only explicitly configured keys are accepted (fail closed).
  if (process.env.NODE_ENV !== 'production') {
    entries.push({ key: DEMO_API_KEY })
  }
  return entries
}

/** Constant-time lookup so we don't leak key contents via timing; returns the matched entry. */
function matchApiKey(candidate: string): ApiKeyEntry | null {
  const entries = getConfiguredApiKeys()
  const candidateBuf = Buffer.from(candidate)
  let matched: ApiKeyEntry | null = null
  for (const entry of entries) {
    const keyBuf = Buffer.from(entry.key)
    if (keyBuf.length === candidateBuf.length && timingSafeEqual(keyBuf, candidateBuf)) {
      matched = entry
    }
  }
  return matched
}

/**
 * API Authentication middleware.
 * Supports: API key in `x-api-key` header (validated against V1_API_KEYS env),
 * or an authenticated server session cookie.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  // Check for API key header — fail closed if none are configured.
  const apiKey = req.headers.get('x-api-key')

  if (apiKey) {
    // Static env-configured keys first (single trusted integrator / legacy demo key),
    // then self-serve keys a company generated for itself under account/integrations.
    // Lazy import: this file is imported by routes that never touch API-key auth at
    // all, and `company-api-keys` pulls in `@/lib/prisma`, which connects eagerly at
    // module load - keeping it out of the top-level import graph here avoids forcing
    // every api-helpers consumer to have a live DATABASE_URL just to boot.
    const entry = matchApiKey(apiKey) ?? await (async () => {
      const { findCompanyByApiKey } = await import('@/lib/company-api-keys')
      const issued = await findCompanyByApiKey(apiKey)
      return issued ? { key: apiKey, companyId: issued.companyId } : null
    })()
    if (!entry) {
      return {
        authenticated: false,
        error: 'Invalid API key',
        status: 401,
      } as AuthResult
    }

    const headerCompany = req.headers.get('x-company-id') || undefined

    // A company-bound key is locked to its own company: reject any attempt to
    // scope it elsewhere via the header (cross-tenant read/write). A bare key
    // keeps header-driven scope for the single trusted integrator use case.
    if (entry.companyId && headerCompany && headerCompany !== entry.companyId) {
      return {
        authenticated: false,
        error: 'Company scope not permitted for this API key',
        status: 403,
      } as AuthResult
    }

    return {
      authenticated: true,
      user: {
        id: `api_${apiKey.substring(0, 8)}`,
        companyId: entry.companyId ?? headerCompany,
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
export function errorResponse(message: string, status: number = 400): NextResponse {
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
export function successResponse(data: unknown, status: number = 200): NextResponse {
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
export function parsePagination(req: NextRequest): { page: number; limit: number; offset: number } {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

/**
 * Filter parser helper
 */
export function parseFilters(req: NextRequest): Partial<ApiFilters> {
  const { searchParams } = new URL(req.url)
  const filters: Partial<ApiFilters> = {}

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
