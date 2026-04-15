import type { Language } from '@/data/translations'

export type SiteContentOverrides = {
  text: Partial<Record<Language, Record<string, string>>>
  images: Record<string, string>
}

const EMPTY_OVERRIDES: SiteContentOverrides = {
  text: { ru: {}, en: {}, lv: {} },
  images: {}
}

let overridesCache: SiteContentOverrides = cloneOverrides(EMPTY_OVERRIDES)
let hasLoadedFromApi = false

function cloneOverrides(overrides: SiteContentOverrides): SiteContentOverrides {
  return {
    text: {
      ru: { ...(overrides.text.ru ?? {}) },
      en: { ...(overrides.text.en ?? {}) },
      lv: { ...(overrides.text.lv ?? {}) }
    },
    images: { ...overrides.images }
  }
}

function notifySiteContentChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('eshop-site-content-changed'))
}

export function getSiteContentOverrides(): SiteContentOverrides {
  return cloneOverrides(overridesCache)
}

export async function loadSiteContentOverrides(force = false): Promise<SiteContentOverrides> {
  if (typeof window === 'undefined') return cloneOverrides(overridesCache)
  if (hasLoadedFromApi && !force) return cloneOverrides(overridesCache)

  try {
    const response = await fetch('/api/content', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error('failed_to_load_site_content')
    }

    const data = (await response.json()) as Partial<SiteContentOverrides>
    overridesCache = {
      text: {
        ru: { ...(data.text?.ru ?? {}) },
        en: { ...(data.text?.en ?? {}) },
        lv: { ...(data.text?.lv ?? {}) }
      },
      images: { ...(data.images ?? {}) }
    }
    hasLoadedFromApi = true
    notifySiteContentChanged()
  } catch {
    // Keep last known cache on read failures.
  }

  return cloneOverrides(overridesCache)
}

export async function saveSiteContentOverrides(overrides: SiteContentOverrides): Promise<void> {
  const response = await fetch('/api/admin/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides)
  })

  if (!response.ok) {
    throw new Error('failed_to_save_site_content')
  }

  const saved = (await response.json()) as Partial<SiteContentOverrides>
  overridesCache = {
    text: {
      ru: { ...(saved.text?.ru ?? {}) },
      en: { ...(saved.text?.en ?? {}) },
      lv: { ...(saved.text?.lv ?? {}) }
    },
    images: { ...(saved.images ?? {}) }
  }
  hasLoadedFromApi = true
  notifySiteContentChanged()
}

export async function setTextOverride(language: Language, key: string, value: string): Promise<void> {
  const normalizedKey = key.trim()
  if (!normalizedKey) return

  const next = getSiteContentOverrides()
  const bucket = { ...(next.text[language] ?? {}) }

  if (value.trim()) {
    bucket[normalizedKey] = value
  } else {
    delete bucket[normalizedKey]
  }

  next.text[language] = bucket
  await saveSiteContentOverrides(next)
}

export async function removeTextOverride(language: Language, key: string): Promise<void> {
  const normalizedKey = key.trim()
  if (!normalizedKey) return

  const next = getSiteContentOverrides()
  const bucket = { ...(next.text[language] ?? {}) }
  delete bucket[normalizedKey]
  next.text[language] = bucket
  await saveSiteContentOverrides(next)
}

export async function setImageOverride(source: string, target: string): Promise<void> {
  const from = source.trim()
  if (!from) return

  const next = getSiteContentOverrides()
  if (target.trim()) {
    next.images[from] = target.trim()
  } else {
    delete next.images[from]
  }

  await saveSiteContentOverrides(next)
}

export async function removeImageOverride(source: string): Promise<void> {
  const from = source.trim()
  if (!from) return

  const next = getSiteContentOverrides()
  delete next.images[from]
  await saveSiteContentOverrides(next)
}

export async function clearSiteContentOverrides(): Promise<void> {
  await saveSiteContentOverrides(cloneOverrides(EMPTY_OVERRIDES))
}

export function subscribeSiteContentChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = () => listener()
  window.addEventListener('eshop-site-content-changed', handler)
  return () => window.removeEventListener('eshop-site-content-changed', handler)
}
