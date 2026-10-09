import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { logOperationalEvent } from '@/lib/observability'
import { applyManualImport, type ApplyRejection } from '@/lib/sync/manual-import'
import { requireGrinsImportActor } from '../auth'

export const runtime = 'nodejs'
// A full apply touches ~16k rows in 200-row batches; keep the handler alive.
export const maxDuration = 300

const REJECTION_STATUS: Record<ApplyRejection, number> = {
  preview_not_found: 409,
  preview_mismatch: 409,
  preview_expired: 409,
  content_mismatch: 409,
  sync_running: 409,
  preflight_failed: 422,
  backup_failed: 500,
  already_applied: 409,
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireGrinsImportActor()
  if (actor instanceof NextResponse) return actor

  let body: { previewId?: unknown; sha256?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  const { previewId, sha256 } = body
  if (typeof previewId !== 'string' || !/^[0-9a-f-]{36}$/u.test(previewId) || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(sha256)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  try {
    const outcome = await applyManualImport({ db: prisma }, { previewId, sha256, actorId: actor.id })

    await prisma.$transaction(async tx => appendServerAudit(tx, request, actor, {
      action: outcome.status === 'rejected' ? 'catalog.grins_import_rejected' : outcome.status === 'completed' ? 'catalog.grins_import_applied' : 'catalog.grins_import_failed',
      entityType: 'grins_import',
      entityId: previewId,
      after: outcome.status === 'rejected'
        ? { sha256, error: outcome.error, runId: outcome.runId ?? null }
        : { sha256, fileName: outcome.fileName, status: outcome.status, runId: outcome.result.runId, productsSynced: outcome.result.productsSynced, errorCount: outcome.result.errorCount, backupKey: outcome.backupKey },
    })).catch(() => logOperationalEvent({ event: 'grins_import_audit_failed', level: 'error' }, new Error('audit_write_failed')))

    if (outcome.status === 'rejected') {
      return NextResponse.json({ error: outcome.error, hard: outcome.hard ?? [], runId: outcome.runId ?? null }, { status: REJECTION_STATUS[outcome.error] })
    }
    if (outcome.status !== 'completed') {
      logOperationalEvent({ event: 'grins_manual_import_not_completed', level: 'error', alert: true, runId: outcome.result.runId, status: outcome.status })
    }
    const { result } = outcome
    return NextResponse.json({
      status: result.status,
      runId: result.runId,
      productsSynced: result.productsSynced,
      errorCount: result.errorCount,
      unlinkedXml: result.unlinkedXml ?? 0,
      softDeletedSkipped: result.softDeletedSkipped ?? 0,
      reason: result.reason ?? null,
      backupKey: outcome.backupKey,
    }, { status: result.status === 'completed' ? 200 : result.status === 'skipped' ? 409 : 500 })
  } catch {
    logOperationalEvent({ event: 'grins_manual_import_failed', level: 'error', alert: true }, new Error('manual_import_operation_failed'))
    return NextResponse.json({ error: 'apply_failed' }, { status: 500 })
  }
}
