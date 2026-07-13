import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_LOCALE_CONFIG, TIMEZONES, type LocaleConfig, type SupportedTimezone } from '@/lib/locale-config'
import type { Language } from '@/data/translations'

const LOCALE_CONFIG_KEY = 'locale-config'
const LANGUAGES: Language[] = ['ru', 'en', 'lv']
const DATE_FORMATS = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const
const PRICE_FORMATS = ['symbol_before', 'symbol_after'] as const

function normalize(input?: Partial<LocaleConfig> | null): LocaleConfig {
  const source = input ?? {}
  return {
    defaultLanguage: LANGUAGES.includes(source.defaultLanguage as Language)
      ? (source.defaultLanguage as Language)
      : DEFAULT_LOCALE_CONFIG.defaultLanguage,
    dateFormat: (DATE_FORMATS as readonly string[]).includes(source.dateFormat as string)
      ? (source.dateFormat as LocaleConfig['dateFormat'])
      : DEFAULT_LOCALE_CONFIG.dateFormat,
    timezone: (TIMEZONES as readonly string[]).includes(source.timezone as string)
      ? (source.timezone as SupportedTimezone)
      : DEFAULT_LOCALE_CONFIG.timezone,
    priceFormat: (PRICE_FORMATS as readonly string[]).includes(source.priceFormat as string)
      ? (source.priceFormat as LocaleConfig['priceFormat'])
      : DEFAULT_LOCALE_CONFIG.priceFormat,
  }
}

export async function getLocaleConfig(): Promise<LocaleConfig> {
  try {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: LOCALE_CONFIG_KEY } })
    if (!row) return DEFAULT_LOCALE_CONFIG
    return normalize(row.value as Partial<LocaleConfig>)
  } catch {
    return DEFAULT_LOCALE_CONFIG
  }
}

export async function saveLocaleConfig(input: Partial<LocaleConfig>): Promise<LocaleConfig> {
  const existing = await getLocaleConfig()
  const next = normalize({ ...existing, ...input })

  await prisma.keyValueSetting.upsert({
    where: { key: LOCALE_CONFIG_KEY },
    create: { key: LOCALE_CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })

  return next
}
