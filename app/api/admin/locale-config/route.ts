import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import type { LocaleConfig } from '@/lib/locale-config'
import { getLocaleConfig, saveLocaleConfig } from '@/lib/locale-config-server-store'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { revalidateTag } from 'next/cache'
import { STOREFRONT_CACHE_TAGS } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const config = await getLocaleConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const payload = (await request.json()) as Partial<LocaleConfig>
    const saved = await prisma.$transaction(async (tx) => {
      const before = await getLocaleConfig(tx)
      const after = await saveLocaleConfig(payload, tx)
      await appendServerAudit(tx, request, actor, { action: 'settings.locale_updated', entityType: 'setting', entityId: 'locale-config', before, after })
      return after
    })
    revalidateTag(STOREFRONT_CACHE_TAGS.locale, 'max')
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_locale_config' }, { status: 400 })
  }
}
