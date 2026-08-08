import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'

export type OperationalEvent = {
  event: string
  level?: 'info' | 'warn' | 'error'
  correlationId?: string
  alert?: boolean
  [key: string]: unknown
}

const serializeError = (error: unknown): { errorType?: string; errorMessage?: string } => {
  if (error instanceof Error) {
    return { errorType: error.name, errorMessage: error.message.slice(0, 500) }
  }
  return error === undefined ? {} : { errorMessage: String(error).slice(0, 500) }
}

export function getCorrelationId(request?: NextRequest | Request): string {
  const supplied = request?.headers.get('x-correlation-id')?.trim()
  return supplied && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID()
}

export function logOperationalEvent(event: OperationalEvent, error?: unknown): void {
  const payload = JSON.stringify({
    ...event,
    ...serializeError(error),
    level: event.level ?? 'info',
    service: 'hairshop-web',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    ts: new Date().toISOString(),
  })
  if (event.level === 'error') console.error(payload)
  else if (event.level === 'warn') console.warn(payload)
  else console.log(payload)
}

export function logApiError(event: string, error?: unknown): void {
  const normalized = event
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 100)
  logOperationalEvent({ event: normalized || 'api_error', level: 'error' }, error)
}
