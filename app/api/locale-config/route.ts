import { NextResponse } from 'next/server'
import { getLocaleConfig } from '@/lib/locale-config-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const config = await getLocaleConfig()
  return NextResponse.json(config)
}
