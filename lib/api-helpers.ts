import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

type AuthUser = {
  id: string
  email?: string
  companyId?: string
  apiAccess: boolean
}

type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; error: string; status: number }

/**
 * API Authentication middleware
 * Supports: API key in header, user session
 */
export async function authenticateRequest(req: NextRequest) {
  // Check for API key header
  const apiKey = req.headers.get('x-api-key')
  
  if (apiKey) {
    // Validate API key (simplified - in production use secure storage)
    // This would check against a database of valid API keys
    const isValidKey = apiKey.length > 10 // Placeholder validation
    if (!isValidKey) {
      return {
        authenticated: false,
        error: 'Invalid API key',
        status: 401
      } as AuthResult
    }

    const companyId = req.headers.get('x-company-id') || undefined
    
    // For API key auth, return basic user info
    return {
      authenticated: true,
      user: {
        id: `api_${apiKey.substring(0, 8)}`,
        companyId,
        apiAccess: true
      }
    } as AuthResult
  }

  // Check for session user
  const user = getCurrentUser()
  if (!user) {
    return {
      authenticated: false,
      error: 'Unauthorized',
      status: 401
    } as AuthResult
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      apiAccess: true
    }
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
