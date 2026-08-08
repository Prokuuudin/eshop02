import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const ts = new Date().toISOString()

  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start

    return NextResponse.json({ status: 'ok', db: 'ok', latencyMs, ts })
  } catch (e) {
    logOperationalEvent({
      event: 'health_db_failed',
      level: 'error',
      alert: true,
      ts,
    }, e)
    return NextResponse.json(
      { status: 'degraded', db: 'error', ts },
      { status: 503 }
    )
  }
}
