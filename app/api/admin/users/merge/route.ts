import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'
import { appendServerAudit } from '@/lib/server-audit'
import { isRevokedCardPolicyError } from '@/lib/revoked-card-policy'
import {
  AccountMergeError,
  buildMergePreview,
  executeAccountMerge,
  MERGE_REASON_MAX_LENGTH,
  MERGE_REASON_MIN_LENGTH,
} from '@/lib/admin-account-merge'

export const runtime = 'nodejs'

const idSchema = z.string().trim().min(1).max(200)
const previewSchema = z.object({ sourceId: idSchema, targetId: idSchema })
const mergeSchema = z.object({
  sourceId: idSchema,
  targetId: idSchema,
  sourceUpdatedAt: z.iso.datetime(),
  targetUpdatedAt: z.iso.datetime(),
  reason: z.string().trim().min(MERGE_REASON_MIN_LENGTH).max(MERGE_REASON_MAX_LENGTH),
  // The admin ticked «это один и тот же клиент» in the dialog.
  confirmed: z.literal(true),
}).strict()

function errorResponse(e: unknown, label: string): Response {
  if (e instanceof AccountMergeError) {
    return NextResponse.json({ error: e.code, ...(e.blockers.length ? { blockers: e.blockers } : {}) }, { status: e.status })
  }
  if (isRevokedCardPolicyError(e)) return NextResponse.json({ error: 'card_policy_unavailable' }, { status: 503 })
  if (typeof e === 'object' && e !== null && 'code' in e) {
    // Serialization failure: another write touched one of the accounts. Nothing was changed.
    if (e.code === 'P2034') return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
    if (e.code === 'P2002') return NextResponse.json({ error: 'concurrent_update' }, { status: 409 })
  }
  logApiError(label, e)
  return NextResponse.json({ error: 'server_error' }, { status: 500 })
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

/** Merge after the admin confirmed the preview. Atomic; a retry of a finished merge is a no-op. */
export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked
  const caller = await requireAdmin()
  if (caller instanceof NextResponse) return caller
  const parsed = mergeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const { sourceId, targetId, sourceUpdatedAt, targetUpdatedAt, reason } = parsed.data

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const result = await executeAccountMerge(tx, {
        sourceId, targetId, sourceUpdatedAt, targetUpdatedAt, reason,
        actor: { id: caller.id, email: caller.email },
      })
      if (result.alreadyMerged) return result
      // Who merged what. Restore data lives in the recovery record, not here; no secrets either way.
      await appendServerAudit(tx, req, caller, {
        action: 'user.accounts_merged',
        entityType: 'user',
        entityId: targetId,
        entityTitle: result.email,
        before: { sourceId, targetEmail: result.previousTargetEmail },
        after: { email: result.email, moved: result.moved, dropped: result.dropped, suppressionCarried: result.suppressionCarried },
        details: `recoveryRecord=${result.recoveryKey}; sourceUpdatedAt=${sourceUpdatedAt}; targetUpdatedAt=${targetUpdatedAt}`,
        reason,
      })
      return result
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 })
    return NextResponse.json(outcome)
  } catch (e) {
    return errorResponse(e, '[admin/users/merge POST]')
  }
}
