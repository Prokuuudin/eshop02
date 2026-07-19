import 'server-only'

import { cache } from 'react'
import { translations, type Language } from '@/data/translations'
import {
  getSiteContentOverridesFromStore,
  type SiteContentOverrides,
} from '@/lib/site-content-server-store'

export type ServerTranslator = (key: string, defaultValue?: string) => string

export type ServerContent = {
  t: ServerTranslator
  resolveImageSrc: (src: string) => string
}

export const getServerContent = cache(async (language: Language): Promise<ServerContent> => {
  const overrides: SiteContentOverrides = await getSiteContentOverridesFromStore().catch(() => ({
    text: { ru: {}, en: {}, lv: {} },
    images: {},
  }))

  return {
    t: (key, defaultValue) =>
      overrides.text[language]?.[key] ?? translations[language][key] ?? defaultValue ?? key,
    resolveImageSrc: (src) => overrides.images[src] ?? src,
  }
})
