import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_LOCALE_CONFIG, TIMEZONES, type LocaleConfig, type SupportedTimezone } from '@/lib/locale-config'
import type { Language } from '@/data/translations'
import type { ExtendedTransactionClient } from '@/lib/prisma'

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

export async function getLocaleConfig(db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma): Promise<LocaleConfig> {
  try {
    const row = await db.keyValueSetting.findUnique({ where: { key: LOCALE_CONFIG_KEY } })
    if (!row) return DEFAULT_LOCALE_CONFIG
    return normalize(row.value as Partial<LocaleConfig>)
  } catch {
    return DEFAULT_LOCALE_CONFIG
  }
}

// Serialize concurrent edits of this single shared row - same pattern as
// lib/email-templates-server-store.ts, distinct lock key namespaced to this store.
// Callers that already have an open transaction (e.g. to make the save and its audit
// log entry atomic, see app/api/admin/locale-config/route.ts) pass it in directly so
// the lock lives inside that same transaction, instead of nesting a second one.
export async function saveLocaleConfigTx(tx: ExtendedTransactionClient, input: Partial<LocaleConfig>): Promise<LocaleConfig> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCALE_CONFIG_KEY}))`
  const existing = await getLocaleConfig(tx)
  const next = normalize({ ...existing, ...input })

  await tx.keyValueSetting.upsert({
    where: { key: LOCALE_CONFIG_KEY },
    create: { key: LOCALE_CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })

  return next
}

/** Top-level call with no open transaction - opens its own. */
export async function saveLocaleConfig(input: Partial<LocaleConfig>): Promise<LocaleConfig> {
  return prisma.$transaction((tx) => saveLocaleConfigTx(tx, input))
}
