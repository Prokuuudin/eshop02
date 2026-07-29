import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import type { LocaleConfig } from '@/lib/locale-config'
import { getLocaleConfig, saveLocaleConfig } from '@/lib/locale-config-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getLocaleConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const payload = (await request.json()) as Partial<LocaleConfig>
    const saved = await saveLocaleConfig(payload)
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_locale_config' }, { status: 400 })
  }
}
