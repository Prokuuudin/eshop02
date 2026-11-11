import 'server-only'

import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { ExtendedTransactionClient } from '@/lib/prisma'

// Shared guards for the admin invitation endpoints.
//
// * Idempotency: a client may send `Idempotency-Key`. The key (scoped to the
//   acting admin) becomes the AuditLog requestId of the batch, so a technical
//   retry — or a concurrent duplicate of the same request — finds the rows the
//   first attempt committed and replays its outcome instead of issuing another
//   token, email or event. Without the header every request is a new, explicit
//   send, exactly as before.
// * In-flight delivery: a fresh `sent` token without a recorded delivery means
//   another request is still mailing that user. A concurrent request skips the
//   user (`pending`) so it cannot replace the token behind an email that is
//   being sent. Once the delivery is recorded (or the window lapses after a
//   crash) an explicit resend works again.

export const IDEMPOTENCY_HEADER = 'idempotency-key'
export const EMAIL_DELIVERY_IN_FLIGHT_MS = 60_000
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u

/** Batch id used as the AuditLog requestId; null when the supplied key is malformed. */
export function invitationBatchId(request: NextRequest, actorId: string, scope: string): string | null {
  const key = request.headers.get(IDEMPOTENCY_HEADER)
  if (key === null) return `${scope}:${randomUUID()}`
  if (!KEY_PATTERN.test(key)) return null
  return `${scope}:${actorId}:${key}`
}

export async function lockBatch(tx: ExtendedTransactionClient, batchId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`
}

/** Per-user locks in a stable order, so overlapping batches cannot deadlock. */
export async function lockInvitationUsers(tx: ExtendedTransactionClient, userIds: string[]): Promise<void> {
  for (const userId of [...new Set(userIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invitation-user:${userId}`}))`
  }
}

export async function emailDeliveryInFlight(
  tx: ExtendedTransactionClient,
  userId: string,
  now: Date,
): Promise<boolean> {
  const latest = await tx.invitationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true },
  })
  if (!latest || latest.status !== 'sent') return false
  if (now.getTime() - latest.createdAt.getTime() >= EMAIL_DELIVERY_IN_FLIGHT_MS) return false
  const delivered = await tx.invitationDelivery.findFirst({
    where: { userId, channel: 'email', sentAt: { gte: latest.createdAt } },
    select: { id: true },
  })
  return !delivered
}
