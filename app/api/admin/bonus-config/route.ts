import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import type { BonusProgramConfig } from '@/lib/bonus-program'
import { getBonusProgramConfig, saveBonusProgramConfig } from '@/lib/bonus-config-server-store'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  const config = await getBonusProgramConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const payload = (await request.json()) as Partial<BonusProgramConfig>
    const saved = await prisma.$transaction(async (tx) => {
      const before = await getBonusProgramConfig(tx)
      const after = await saveBonusProgramConfig(payload, tx)
      await appendServerAudit(tx, request, actor, {
        action: 'settings.bonus_program_updated', entityType: 'setting', entityId: 'bonusProgram', before, after,
      })
      return after
    })
    revalidateTag(STOREFRONT_CACHE_TAGS.bonus, 'max')
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_bonus_config' }, { status: 400 })
  }
}
