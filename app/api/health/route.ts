import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ts = new Date().toISOString()

  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start

    return NextResponse.json({ status: 'ok', db: 'ok', latencyMs, ts })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json(
      { status: 'degraded', db: 'error', error: message, ts },
      { status: 200 } // 200 so uptime monitor distinguishes "app up, DB down" from "app down"
    )
  }
}
