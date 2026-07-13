import { NextResponse } from 'next/server'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'

export const runtime = 'nodejs'

export async function GET() {
  const config = await getBonusProgramConfig()
  return NextResponse.json(config)
}
