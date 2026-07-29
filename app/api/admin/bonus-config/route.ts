import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import type { BonusProgramConfig } from '@/lib/bonus-program'
import { getBonusProgramConfig, saveBonusProgramConfig } from '@/lib/bonus-config-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getBonusProgramConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const payload = (await request.json()) as Partial<BonusProgramConfig>
    const saved = await saveBonusProgramConfig(payload)
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_bonus_config' }, { status: 400 })
  }
}
