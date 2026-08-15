import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const KEY_PREFIX = 'b2b_live_'
const PREFIX_DISPLAY_LEN = 12 // "b2b_live_xxxx" shown to identify the key without exposing it

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export type CompanyApiKeyMeta = {
  id: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

/** Generates a fresh key, replacing any existing one for the company (single active key model). */
export async function generateCompanyApiKey(companyId: string): Promise<{ plaintext: string; meta: CompanyApiKeyMeta }> {
  const plaintext = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`
  const keyHash = hashKey(plaintext)
  const keyPrefix = plaintext.slice(0, PREFIX_DISPLAY_LEN)

  const row = await prisma.companyApiKey.upsert({
    where: { companyId },
    create: { id: randomUUID(), companyId, keyHash, keyPrefix },
    update: { keyHash, keyPrefix, createdAt: new Date(), lastUsedAt: null },
  })

  return {
    plaintext,
    meta: { id: row.id, keyPrefix: row.keyPrefix, createdAt: row.createdAt.toISOString(), lastUsedAt: null },
  }
}

export async function getCompanyApiKeyMeta(companyId: string): Promise<CompanyApiKeyMeta | null> {
  const row = await prisma.companyApiKey.findUnique({ where: { companyId } })
  if (!row) return null
  return { id: row.id, keyPrefix: row.keyPrefix, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null }
}

export async function revokeCompanyApiKey(companyId: string): Promise<boolean> {
  const result = await prisma.companyApiKey.deleteMany({ where: { companyId } })
  return result.count > 0
}

/** Looks up a candidate key against DB-issued company keys (in addition to the static V1_API_KEYS env list). */
export async function findCompanyByApiKey(candidate: string): Promise<{ companyId: string } | null> {
  if (!candidate.startsWith(KEY_PREFIX)) return null
  const row = await prisma.companyApiKey.findUnique({ where: { keyHash: hashKey(candidate) } })
  if (!row) return null
  prisma.companyApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { companyId: row.companyId }
}
