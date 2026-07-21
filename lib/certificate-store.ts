import type { Prisma } from '@/generated/prisma/client'
import type { ExtendedPrismaClient, ExtendedTransactionClient } from '@/lib/prisma'

// `prisma` itself, or the `tx` handed to a `prisma.$transaction(async (tx) => ...)`
// callback — both are shapes of the extended (money-fields-converting) client, not
// the raw generated `PrismaClient` / `Prisma.TransactionClient`.
type Db = ExtendedPrismaClient | ExtendedTransactionClient

// Сертификат мастера живёт в KV только пока заявка на рассмотрении:
// подача пишет, решение (approve/reject) удаляет. Постоянного хранилища нет.

// ~1.5 МБ файла в base64 (+33%); запрос Vercel ограничен ~4.5 МБ
export const MAX_CERT_DATA_LENGTH = 2_000_000

export const certKey = (requestId: string): string => `access-request-cert-${requestId}`

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])

export type StoredCertificate = { data: string; name: string }

/** data URL → тип и байты; null для мусора и небезопасных типов (text/html и т.п.) */
export function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  const contentType = m[1].toLowerCase()
  if (!ALLOWED_TYPES.has(contentType)) return null
  try {
    return { contentType, buffer: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

export async function saveCertificate(db: Db, requestId: string, cert: StoredCertificate): Promise<void> {
  const value = cert as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({
    where: { key: certKey(requestId) },
    create: { key: certKey(requestId), value },
    update: { value },
  })
}

export async function readCertificate(db: Db, requestId: string): Promise<StoredCertificate | null> {
  const row = await db.keyValueSetting.findUnique({ where: { key: certKey(requestId) } })
  if (!row) return null
  const value = row.value as Partial<StoredCertificate>
  if (typeof value?.data !== 'string') return null
  return { data: value.data, name: typeof value.name === 'string' ? value.name : 'certificate' }
}

export async function deleteCertificate(db: Db, requestId: string): Promise<void> {
  await db.keyValueSetting.deleteMany({ where: { key: certKey(requestId) } })
}
