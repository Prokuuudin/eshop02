import { grinsMaintenanceClosed } from '@/lib/grins-import-maintenance'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { isSyncLockHeld } from '@/lib/sync/sync-lock'
import {
  MANUAL_IMPORT_MAX_BYTES, decodeUpload, evaluateFeed, savePendingPreview,
  type ManualImportSamples, type ManualImportSummary,
} from '@/lib/sync/manual-import'
import { requireGrinsImportActor } from '../auth'

export const runtime = 'nodejs'

export type GrinsPreviewResponse = {
  mode: 'prices-only'
  maintenanceReady: boolean
  previewId: string | null
  canApply: boolean
  sha256: string
  fileName: string
  sizeBytes: number
  expiresAt: string | null
  syncRunning: boolean
  hard: string[]
  warnings: string[]
  summary: ManualImportSummary
  samples: ManualImportSamples
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireGrinsImportActor()
  if (actor instanceof NextResponse) return actor

  // Cheap pre-check before buffering the body; the decoded size is checked again below.
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > MANUAL_IMPORT_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MANUAL_IMPORT_MAX_BYTES }, { status: 413 })
  }

  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get('file')
  } catch {
    return NextResponse.json({ error: 'file_required' }, { status: 400 })
  }
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 })
  if (file.size > MANUAL_IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MANUAL_IMPORT_MAX_BYTES }, { status: 413 })
  }

  const fileName = file.name.slice(0, 200)
  const decoded = decodeUpload(new Uint8Array(await file.arrayBuffer()), fileName)
  if (!decoded.ok) {
    return NextResponse.json({ error: decoded.error }, { status: decoded.error === 'file_too_large' ? 413 : 400 })
  }

  try {
    const evaluation = await evaluateFeed(prisma, decoded.xml)
    const { preflight } = evaluation
    const syncRunning = await isSyncLockHeld(prisma)
    const maintenanceReady = await grinsMaintenanceClosed(prisma)
    const sizeBytes = file.size
    const pending = preflight.hard.length === 0
      ? await savePendingPreview(prisma, { sha256: decoded.sha256, fileName, sizeBytes, actorId: actor.id, xml: decoded.xml, catalogFingerprint: evaluation.catalogFingerprint })
      : null

    await prisma.$transaction(async tx => appendServerAudit(tx, request, actor, {
      action: 'catalog.grins_import_previewed',
      entityType: 'grins_import',
      entityId: pending?.previewId ?? decoded.sha256,
      after: { mode: 'prices-only', fileName, sizeBytes, sha256: decoded.sha256, canApply: pending !== null && maintenanceReady && !syncRunning, hardFailures: preflight.hard.length, summary: evaluation.summary },
    }))

    const body: GrinsPreviewResponse = {
      mode: 'prices-only',
      maintenanceReady,
      previewId: pending?.previewId ?? null,
      canApply: pending !== null && maintenanceReady && !syncRunning,
      sha256: decoded.sha256,
      fileName,
      sizeBytes,
      expiresAt: pending?.expiresAt ?? null,
      syncRunning,
      hard: preflight.hard,
      warnings: preflight.warnings,
      summary: evaluation.summary,
      samples: evaluation.samples,
    }
    return NextResponse.json(body)
  } catch {
    return NextResponse.json({ error: 'preview_failed' }, { status: 500 })
  }
}
