import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { Language } from '@/data/translations'

export type SiteContentOverrides = {
  text: Partial<Record<Language, Record<string, string>>>
  images: Record<string, string>
}

const SITE_CONTENT_KEY = 'site-content'

const EMPTY_OVERRIDES: SiteContentOverrides = {
  text: { ru: {}, en: {}, lv: {} },
  images: {}
}

function normalizeOverrides(input: Partial<SiteContentOverrides> | null | undefined): SiteContentOverrides {
  return {
    text: {
      ru: { ...(input?.text?.ru ?? {}) },
      en: { ...(input?.text?.en ?? {}) },
      lv: { ...(input?.text?.lv ?? {}) }
    },
    images: { ...(input?.images ?? {}) }
  }
}

export async function getSiteContentOverridesFromStore(): Promise<SiteContentOverrides> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: SITE_CONTENT_KEY } })
  if (!row) return normalizeOverrides(EMPTY_OVERRIDES)
  return normalizeOverrides(row.value as Partial<SiteContentOverrides>)
}

export async function saveSiteContentOverridesToStore(overrides: Partial<SiteContentOverrides>): Promise<SiteContentOverrides> {
  const normalized = normalizeOverrides(overrides)
  await prisma.keyValueSetting.upsert({
    where: { key: SITE_CONTENT_KEY },
    create: { key: SITE_CONTENT_KEY, value: normalized as unknown as Prisma.InputJsonValue },
    update: { value: normalized as unknown as Prisma.InputJsonValue },
  })
  return normalized
}
