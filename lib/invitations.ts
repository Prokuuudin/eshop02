import crypto from 'crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import { Prisma } from '@/generated/prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export const INVITES_KV_KEY = 'pro-invitations'
export const CAMPAIGN_KV_KEY = 'card-rules-campaign'
export const INVITE_TTL_DAYS = 7
export const CAMPAIGN_BATCH_SIZE = 50
export const CAMPAIGN_LOCK_MS = 120_000

export type InviteLang = 'ru' | 'en' | 'lv'

export type ProInvitation = {
  userId: string
  email: string
  cardNumber: string
  token: string
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  status: 'sent' | 'accepted' | 'expired' | 'error'
  language: InviteLang
}

export type CampaignState = {
  sentCount: number
  errorCount: number
  cursor: string | null
  lastRunAt: string | null
  finished: boolean
  runningSince: string | null
}

const DEFAULT_CAMPAIGN: CampaignState = {
  sentCount: 0,
  errorCount: 0,
  cursor: null,
  lastRunAt: null,
  finished: false,
  runningSince: null,
}

export async function readInvitations(db: Db): Promise<ProInvitation[]> {
  const row = await db.keyValueSetting.findUnique({ where: { key: INVITES_KV_KEY } })
  if (!row) return []
  return ((row.value as { invitations?: ProInvitation[] })?.invitations) ?? []
}

export async function writeInvitations(db: Db, invitations: ProInvitation[]): Promise<void> {
  const value = { invitations } as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({
    where: { key: INVITES_KV_KEY },
    create: { key: INVITES_KV_KEY, value },
    update: { value },
  })
}

export async function readCampaign(db: Db): Promise<CampaignState> {
  const row = await db.keyValueSetting.findUnique({ where: { key: CAMPAIGN_KV_KEY } })
  if (!row) return { ...DEFAULT_CAMPAIGN }
  return { ...DEFAULT_CAMPAIGN, ...(row.value as Partial<CampaignState>) }
}

export async function writeCampaign(db: Db, state: CampaignState): Promise<void> {
  const value = state as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({
    where: { key: CAMPAIGN_KV_KEY },
    create: { key: CAMPAIGN_KV_KEY, value },
    update: { value },
  })
}

/** Статус с учётом протухания: accepted/error финальны, sent может стать expired. */
export function deriveStatus(inv: ProInvitation, now: Date = new Date()): ProInvitation['status'] {
  if (inv.status === 'accepted' || inv.status === 'error') return inv.status
  if (inv.acceptedAt) return 'accepted'
  if (new Date(inv.expiresAt) < now) return 'expired'
  return inv.status
}

/** Сегмент B: клиент без карты, не админ, с настоящим email. */
export function isEligibleRulesRecipient(u: {
  email: string
  platformRole: string
  cardNumber: string | null
}): boolean {
  if (u.cardNumber) return false
  if (u.platformRole === 'admin') return false
  if (!u.email || !u.email.includes('@')) return false
  if (u.email.toLowerCase().endsWith('@client.local')) return false
  return true
}

export function newInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
