import 'server-only'

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'
import { lockBatch } from '@/lib/invitation-dispatch'
import { logApiError } from '@/lib/observability'

// Audited outbound delivery for admin sends that change no other database
// state (broadcasts, stock reports). The "prepared" event is the durable claim:
// it commits under the batch lock before SMTP, so an audit failure sends
// nothing. The "recorded" event stores the actual outcome after SMTP.
//
// With an Idempotency-Key (see lib/invitation-dispatch) a technical retry:
//   * finds a recorded outcome → replays it, sends nothing;
//   * finds a claim without an outcome (still sending, or the outcome could not
//     be written) → `in_progress`, sends nothing — delivered mail is never sent
//     twice just because recording the result failed;
//   * finds an outcome the caller marks as retryable (nothing was delivered) →
//     may try again under the same key.
// A new key (a new admin action) is always an explicit resend.

export type DeliveryActions = { prepared: string; recorded: string }
type DeliveryTarget = { entityType: string; entityId: string }

export type DeliveryClaim =
  | { kind: 'prepared' }
  | { kind: 'in_progress' }
  | { kind: 'replay'; prepared: unknown; result: unknown }

export async function prepareAuditedDelivery(options: {
  request: NextRequest
  actor: ServerUser
  batchId: string
  actions: DeliveryActions
  target: DeliveryTarget
  after: Record<string, unknown>
  retryable: (result: unknown) => boolean
}): Promise<DeliveryClaim> {
  const { request, actor, batchId, actions, target } = options
  return prisma.$transaction(async (tx) => {
    await lockBatch(tx, batchId)
    const attempts = await tx.auditLog.findMany({
      where: { requestId: batchId, action: { in: [actions.prepared, actions.recorded] } },
      orderBy: { sequence: 'asc' },
      select: { action: true, after: true },
    })
    const last = attempts.at(-1)
    if (last?.action === actions.prepared) return { kind: 'in_progress' as const }
    if (last?.action === actions.recorded && !options.retryable(last.after)) {
      const prepared = attempts.filter((row) => row.action === actions.prepared).at(-1)
      return { kind: 'replay' as const, prepared: prepared?.after ?? null, result: last.after }
    }
    await appendServerAudit(tx, request, actor, {
      action: actions.prepared, ...target, requestId: batchId, after: options.after,
    })
    return { kind: 'prepared' as const }
  })
}

/** Records the SMTP outcome; one retry, then logged — the response stays truthful. */
export async function recordAuditedDelivery(options: {
  request: NextRequest
  actor: ServerUser
  batchId: string
  actions: DeliveryActions
  target: DeliveryTarget
  result: Record<string, unknown>
}): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.$transaction((tx) => appendServerAudit(tx, options.request, options.actor, {
        action: options.actions.recorded, ...options.target, requestId: options.batchId, after: options.result,
      }))
      return true
    } catch (error) {
      if (attempt === 1) logApiError('audited_delivery_result_not_recorded', error)
    }
  }
  return false
}
