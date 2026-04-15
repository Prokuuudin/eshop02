import 'server-only'
import { promises as fs } from 'fs'
import path from 'path'
import type { Language } from '@/data/translations'

export type SiteContentOverrides = {
  text: Partial<Record<Language, Record<string, string>>>
  images: Record<string, string>
}

const SITE_CONTENT_STORE_FILE = path.join(process.cwd(), 'data', 'site-content.json')

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

async function ensureStoreFile(): Promise<void> {
  try {
    await fs.access(SITE_CONTENT_STORE_FILE)
  } catch {
    await fs.writeFile(SITE_CONTENT_STORE_FILE, JSON.stringify(EMPTY_OVERRIDES, null, 2), 'utf-8')
  }
}

export async function getSiteContentOverridesFromStore(): Promise<SiteContentOverrides> {
  await ensureStoreFile()
  const content = await fs.readFile(SITE_CONTENT_STORE_FILE, 'utf-8')

  try {
    const parsed = JSON.parse(content) as Partial<SiteContentOverrides>
    return normalizeOverrides(parsed)
  } catch {
    return normalizeOverrides(EMPTY_OVERRIDES)
  }
}

export async function saveSiteContentOverridesToStore(overrides: Partial<SiteContentOverrides>): Promise<SiteContentOverrides> {
  await ensureStoreFile()
  const normalized = normalizeOverrides(overrides)
  await fs.writeFile(SITE_CONTENT_STORE_FILE, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}
