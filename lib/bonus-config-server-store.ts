import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_BONUS_PROGRAM_CONFIG, type BonusProgramConfig } from '@/lib/bonus-program'

const BONUS_CONFIG_KEY = 'bonusProgram'

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function normalize(input?: Partial<BonusProgramConfig> | null): BonusProgramConfig {
  const source = input ?? {}
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_BONUS_PROGRAM_CONFIG.enabled,
    earnRatePercent: clamp(source.earnRatePercent, DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent, 0, 100),
    maxSpendPercent: clamp(source.maxSpendPercent, DEFAULT_BONUS_PROGRAM_CONFIG.maxSpendPercent, 0, 100),
    minOrderForEarn: clamp(source.minOrderForEarn, DEFAULT_BONUS_PROGRAM_CONFIG.minOrderForEarn, 0, 1_000_000),
    pointsExpiryDays: clamp(source.pointsExpiryDays, DEFAULT_BONUS_PROGRAM_CONFIG.pointsExpiryDays, 0, 3650),
    minPointsToSpend: clamp(source.minPointsToSpend, DEFAULT_BONUS_PROGRAM_CONFIG.minPointsToSpend, 0, 1_000_000),
    maxEarnPerOrder: clamp(source.maxEarnPerOrder, DEFAULT_BONUS_PROGRAM_CONFIG.maxEarnPerOrder, 0, 1_000_000),
  }
}

export async function getBonusProgramConfig(db: Pick<ExtendedTransactionClient, 'keyValueSetting'> = prisma): Promise<BonusProgramConfig> {
  try {
    const row = await db.keyValueSetting.findUnique({ where: { key: BONUS_CONFIG_KEY } })
    if (!row) return DEFAULT_BONUS_PROGRAM_CONFIG
    return normalize(row.value as Partial<BonusProgramConfig>)
  } catch {
    return DEFAULT_BONUS_PROGRAM_CONFIG
  }
}

export async function saveBonusProgramConfig(input: Partial<BonusProgramConfig>): Promise<BonusProgramConfig> {
  const existing = await getBonusProgramConfig()
  const next = normalize({ ...existing, ...input })

  await prisma.keyValueSetting.upsert({
    where: { key: BONUS_CONFIG_KEY },
    create: { key: BONUS_CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })

  return next
}
