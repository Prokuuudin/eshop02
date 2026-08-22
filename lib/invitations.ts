import crypto from 'crypto'
import { Prisma } from '@/generated/prisma/client'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'

type Db = ExtendedPrismaClient | ExtendedTransactionClient

export const CAMPAIGN_KV_KEY = 'card-rules-campaign'
export const INVITE_TTL_DAYS = 7
export const CAMPAIGN_BATCH_SIZE = 50
export const CAMPAIGN_LOCK_MS = 120_000
export const INVITE_BATCH_SIZE = 20

export type InviteLang = 'ru' | 'en' | 'lv'

export function resolveInviteLang(input: string | undefined): InviteLang {
  return (['ru', 'en', 'lv'] as const).includes(input as InviteLang) ? (input as InviteLang) : 'lv'
}

export type ProInvitation = {
  id: string
  userId: string
  email: string
  cardNumber: string
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  status: 'sent' | 'accepted' | 'expired' | 'error'
  language: InviteLang
}

export type NewInvitation = {
  userId: string
  email: string
  cardNumber: string
  token: string
  expiresAt: string
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

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function readInvitations(db: Db, emails?: string[]): Promise<ProInvitation[]> {
  const rows = await db.invitationToken.findMany({
    where: emails ? { email: { in: emails } } : undefined,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.email,
    cardNumber: row.cardNumber,
    language: resolveInviteLang(row.language),
    sentAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    status: row.status as ProInvitation['status'],
  }))
}

export async function replaceInvitation(db: Db, invitation: NewInvitation): Promise<void> {
  await db.invitationToken.deleteMany({
    where: { userId: invitation.userId, status: { not: 'accepted' } },
  })
  await db.invitationToken.create({
    data: {
      tokenHash: hashInviteToken(invitation.token),
      userId: invitation.userId,
      email: invitation.email,
      cardNumber: invitation.cardNumber,
      language: invitation.language,
      expiresAt: new Date(invitation.expiresAt),
    },
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

export function deriveStatus(inv: ProInvitation, now: Date = new Date()): ProInvitation['status'] {
  if (inv.status === 'accepted' || inv.status === 'error') return inv.status
  if (inv.acceptedAt) return 'accepted'
  if (new Date(inv.expiresAt) < now) return 'expired'
  return inv.status
}

export function isEligibleRulesRecipient(u: {
  email: string
  platformRole: string
  cardNumber: string | null
}): boolean {
  if (u.cardNumber || u.platformRole === 'admin') return false
  if (!u.email || !u.email.includes('@')) return false
  return !u.email.toLowerCase().endsWith('@client.local')
}

export function newInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
