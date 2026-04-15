'use client'

import React from 'react'
import type { Language } from '@/data/translations'
import {
  clearSiteContentOverrides,
  getSiteContentOverrides,
  loadSiteContentOverrides,
  removeImageOverride,
  removeTextOverride,
  setImageOverride,
  setTextOverride,
  subscribeSiteContentChanges,
  type SiteContentOverrides
} from '@/lib/site-content-store'

type UseSiteContentResult = {
  overrides: SiteContentOverrides
  resolveImageSrc: (source: string) => string
  getTextOverride: (language: Language, key: string) => string | undefined
  setText: (language: Language, key: string, value: string) => Promise<void>
  setImage: (source: string, target: string) => Promise<void>
  removeText: (language: Language, key: string) => Promise<void>
  removeImage: (source: string) => Promise<void>
  clearAll: () => Promise<void>
}

export function useSiteContent(): UseSiteContentResult {
  const [overrides, setOverrides] = React.useState<SiteContentOverrides>(() => getSiteContentOverrides())

  React.useEffect(() => {
    const sync = () => setOverrides(getSiteContentOverrides())
    const unsubscribe = subscribeSiteContentChanges(sync)
    sync()
    void loadSiteContentOverrides().then(sync)
    return unsubscribe
  }, [])

  const resolveImageSrc = React.useCallback(
    (source: string): string => {
      return overrides.images[source] ?? source
    },
    [overrides.images]
  )

  const getTextOverride = React.useCallback(
    (language: Language, key: string): string | undefined => {
      return overrides.text[language]?.[key]
    },
    [overrides.text]
  )

  const setText = React.useCallback(async (language: Language, key: string, value: string) => {
    await setTextOverride(language, key, value)
  }, [])

  const setImage = React.useCallback(async (source: string, target: string) => {
    await setImageOverride(source, target)
  }, [])

  const removeText = React.useCallback(async (language: Language, key: string) => {
    await removeTextOverride(language, key)
  }, [])

  const removeImage = React.useCallback(async (source: string) => {
    await removeImageOverride(source)
  }, [])

  const clearAll = React.useCallback(async () => {
    await clearSiteContentOverrides()
  }, [])

  return {
    overrides,
    resolveImageSrc,
    getTextOverride,
    setText,
    setImage,
    removeText,
    removeImage,
    clearAll
  }
}
