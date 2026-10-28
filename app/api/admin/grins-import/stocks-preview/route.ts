import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MANUAL_IMPORT_MAX_BYTES, decodeUpload } from '@/lib/sync/manual-import'
import {
  evaluateStockPreview,
  type ManualStockChange,
  type ManualStockPreviewSummary,
} from '@/lib/sync/manual-stock-preview'
import { requireGrinsImportActor } from '../auth'

export const runtime = 'nodejs'

export type GrinsStockPreviewResponse = {
  mode: 'stocks-only-preview'
  readOnly: true
  canApply: false
  sha256: string
  fileName: string
  sizeBytes: number
  hard: string[]
  warnings: string[]
  summary: ManualStockPreviewSummary
  changes: ManualStockChange[]
  samples: {
    unlinked: string[]
    softDeleted: string[]
    duplicates: string[]
    invalidValues: Array<{ sku: string; field: string; value: string }>
    negativeValues: Array<{ sku: string; field: string; value: number }>
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireGrinsImportActor()
  if (actor instanceof NextResponse) return actor

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
    const evaluation = await evaluateStockPreview(prisma, decoded.xml)
    const body: GrinsStockPreviewResponse = {
      mode: 'stocks-only-preview',
      readOnly: true,
      canApply: false,
      sha256: decoded.sha256,
      fileName,
      sizeBytes: file.size,
      hard: evaluation.hard,
      warnings: evaluation.warnings,
      summary: evaluation.summary,
      changes: evaluation.changes,
      samples: evaluation.samples,
    }
    return NextResponse.json(body)
  } catch {
    return NextResponse.json({ error: 'preview_failed' }, { status: 500 })
  }
}
