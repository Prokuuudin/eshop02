import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { appendServerAudit } from '@/lib/server-audit'
import { isRevokedCardPolicyError } from '@/lib/revoked-card-policy'
import { ACCOUNT_MERGE_TRANSACTION, AccountMergeError, buildMergePreview, executeAccountMerge } from '@/lib/admin-account-merge'
import { restoreAccountMerge } from '@/lib/admin-account-merge-restore'
import { MERGE_REASON_CODES, checkMergeNote, mergeAuditReason } from '@/lib/admin-account-merge-reason'

export const runtime = 'nodejs'

const idSchema = z.string().trim().min(1).max(200)
const previewSchema = z.object({ sourceId: idSchema, targetId: idSchema })
const reasonFields = {
  reasonCode: z.enum(MERGE_REASON_CODES),
  // Length and content are checked by checkMergeNote; the schema only caps the raw input.
  note: z.string().max(1000).nullable().optional(),
}
const mergeSchema = z.object({
  sourceId: idSchema,
  targetId: idSchema,
  sourceUpdatedAt: z.iso.datetime(),
  targetUpdatedAt: z.iso.datetime(),
  ...reasonFields,
  // The admin ticked «это один и тот же клиент» in the dialog.
  confirmed: z.literal(true),
}).strict()
const restoreSchema = z.object({ sourceId: idSchema, ...reasonFields, confirmed: z.literal(true) }).strict()


function errorResponse(e: unknown, label: string): Response {
  if (e instanceof AccountMergeError) {
    return NextResponse.json({ error: e.code, ...(e.blockers.length ? { blockers: e.blockers } : {}) }, { status: e.status })
  }
  if (isRevokedCardPolicyError(e)) return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
  if (typeof e === 'object' && e !== null && 'code' in e) {
    // Serialization failure, lock timeout or a unique clash with a concurrent write: nothing was changed.
    if (e.code === 'P2034' || e.code === 'P2002') return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
  }
  // lock_timeout (55P03) surfaces as a raw driver error.
  if (e instanceof Error && /lock timeout|55P03/u.test(e.message)) return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
  logApiError(label, e)
  return NextResponse.json({ error: 'server_error' }, { status: 500 })
}

function readReason(data: { reasonCode: (typeof MERGE_REASON_CODES)[number]; note?: string | null }) {
  const checked = checkMergeNote(data.reasonCode, data.note)
  return 'problem' in checked ? { problem: checked.problem } : { note: checked.note }
}

/** Preview of merging a card-less account (source) into a card holder (target). Changes nothing. */
export async function GET(req: NextRequest): Promise<Response> {
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  const parsed = previewSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  try {
    const preview = await buildMergePreview(prisma, parsed.data.sourceId, parsed.data.targetId)
    return NextResponse.json({ preview })
  } catch (e) {
    return errorResponse(e, '[admin/users/merge GET]')
  }
}

/** Merge after the admin confirmed the preview. One transaction; a retry of a finished merge is a no-op. */
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  const parsed = mergeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const reason = readReason(parsed.data)
  if ('problem' in reason) return NextResponse.json({ error: 'invalid_note', problem: reason.problem }, { status: 400 })
  const { sourceId, targetId, sourceUpdatedAt, targetUpdatedAt, reasonCode } = parsed.data

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const result = await executeAccountMerge(tx, {
        sourceId, targetId, sourceUpdatedAt, targetUpdatedAt, reasonCode, note: reason.note,
        actor: { id: caller.id, email: caller.email },
      })
      if (result.alreadyMerged) return result
      // Who merged what; ids and counts only. The data to undo it is in the recovery record.
      await appendServerAudit(tx, req, caller, {
        action: 'user.accounts_merged',
        entityType: 'user',
        entityId: targetId,
        before: { sourceId },
        after: { moved: result.moved, dropped: result.dropped, profileCopied: result.profileCopied, suppressionCarried: result.suppressionCarried },
        details: `recoveryRecord=${result.recoveryKey}`,
        reason: mergeAuditReason(reasonCode, reason.note),
      })
      return result
    }, ACCOUNT_MERGE_TRANSACTION)
    if (outcome.alreadyMerged) return NextResponse.json(outcome)
    return NextResponse.json({
      alreadyMerged: false, targetId: outcome.targetId, email: outcome.email, sourceId,
      moved: outcome.moved, dropped: outcome.dropped, profileCopied: outcome.profileCopied,
    })
  } catch (e) {
    return errorResponse(e, '[admin/users/merge POST]')
  }
}

/** Undo a merge from its recovery record. Refused when anything changed since. */
export async function DELETE(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  const parsed = restoreSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const reason = readReason(parsed.data)
  if ('problem' in reason) return NextResponse.json({ error: 'invalid_note', problem: reason.problem }, { status: 400 })

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const result = await restoreAccountMerge(tx, parsed.data.sourceId)
      await appendServerAudit(tx, req, caller, {
        action: 'user.accounts_merge_restored',
        entityType: 'user',
        entityId: result.sourceId,
        before: { targetId: result.targetId },
        after: { movedBack: result.movedBack, reinserted: result.reinserted, suppressionRemoved: result.suppressionRemoved },
        reason: mergeAuditReason(parsed.data.reasonCode, reason.note),
      })
      return result
    }, ACCOUNT_MERGE_TRANSACTION)
    return NextResponse.json({ restored: true, sourceId: outcome.sourceId, targetId: outcome.targetId })
  } catch (e) {
    return errorResponse(e, '[admin/users/merge DELETE]')
  }
}
