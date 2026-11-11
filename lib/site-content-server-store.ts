import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { Language } from '@/data/translations'
import type { NextRequest } from 'next/server'
import type { ServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'

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

type TextAuditValue = { language: Language; key: string; value: string | null }
type ImageAuditValue = { key: string; value: string | null }

function changedContentSnapshots(before: SiteContentOverrides, after: SiteContentOverrides): {
  before: { text: TextAuditValue[]; images: ImageAuditValue[] }
  after: { text: TextAuditValue[]; images: ImageAuditValue[] }
  count: number
} {
  const beforeText: TextAuditValue[] = []
  const afterText: TextAuditValue[] = []
  for (const language of ['ru', 'en', 'lv'] as const) {
    const keys = [...new Set([
      ...Object.keys(before.text[language] ?? {}),
      ...Object.keys(after.text[language] ?? {}),
    ])].sort()
    for (const key of keys) {
      const previousValue = before.text[language]?.[key] ?? null
      const nextValue = after.text[language]?.[key] ?? null
      if (previousValue === nextValue) continue
      beforeText.push({ language, key, value: previousValue })
      afterText.push({ language, key, value: nextValue })
    }
  }

  const beforeImages: ImageAuditValue[] = []
  const afterImages: ImageAuditValue[] = []
  const imageKeys = [...new Set([
    ...Object.keys(before.images),
    ...Object.keys(after.images),
  ])].sort()
  for (const key of imageKeys) {
    const previousValue = before.images[key] ?? null
    const nextValue = after.images[key] ?? null
    if (previousValue === nextValue) continue
    beforeImages.push({ key, value: previousValue })
    afterImages.push({ key, value: nextValue })
  }

  return {
    before: { text: beforeText, images: beforeImages },
    after: { text: afterText, images: afterImages },
    count: beforeText.length + beforeImages.length,
  }
}

export async function getSiteContentOverridesFromStore(): Promise<SiteContentOverrides> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: SITE_CONTENT_KEY } })
  if (!row) return normalizeOverrides(EMPTY_OVERRIDES)
  return normalizeOverrides(row.value as Partial<SiteContentOverrides>)
}

export async function saveSiteContentOverridesToStore(
  overrides: Partial<SiteContentOverrides>,
  actor: ServerUser,
  request: NextRequest,
): Promise<SiteContentOverrides> {
  const normalized = normalizeOverrides(overrides)
  return prisma.$transaction(async (tx) => {
    // The row may not exist yet, so a row lock cannot serialize the first two saves.
    // A dedicated transaction lock makes the diff/no-op decision deterministic.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(91742031)`
    const current = await tx.keyValueSetting.findUnique({ where: { key: SITE_CONTENT_KEY } })
    const before = normalizeOverrides(current?.value as Partial<SiteContentOverrides> | null | undefined)
    const changes = changedContentSnapshots(before, normalized)
    if (changes.count === 0) return normalized

    await tx.keyValueSetting.upsert({
      where: { key: SITE_CONTENT_KEY },
      create: { key: SITE_CONTENT_KEY, value: normalized as unknown as Prisma.InputJsonValue },
      update: { value: normalized as unknown as Prisma.InputJsonValue },
    })
    await appendServerAudit(tx, request, actor, {
      action: 'site_content.updated',
      entityType: 'setting',
      entityId: SITE_CONTENT_KEY,
      entityTitle: 'Site content',
      before: changes.before,
      after: changes.after,
      details: `Changed ${changes.count} site content value(s)`,
    })

    return normalized
  })
}
