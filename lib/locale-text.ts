import type { Language } from '@/data/translations'

export type LocaleText = Partial<Record<Language, string>>

const LANG_ORDER: Language[] = ['ru', 'en', 'lv']

export function parseLocaleText(raw: string): LocaleText | null {
  if (!raw || raw[0] !== '{') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as LocaleText
    }
  } catch {
    // not JSON — legacy plain string
  }
  return null
}

export function encodeLocaleText(value: LocaleText): string {
  return JSON.stringify(value)
}

export function resolveLocaleText(raw: string, language: Language): string {
  const parsed = parseLocaleText(raw)
  if (!parsed) return raw
  if (parsed[language]) return parsed[language] as string
  for (const lang of LANG_ORDER) {
    if (parsed[lang]) return parsed[lang] as string
  }
  return raw
}
