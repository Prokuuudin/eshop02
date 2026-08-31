import type { NextRequest } from 'next/server'

/** Resolve the original client address using the trusted proxy header precedence. */
export function getClientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown'
}
