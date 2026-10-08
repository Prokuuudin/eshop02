import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireGrinsImportActor } from '../auth'

export const runtime = 'nodejs'

export type GrinsImportHistoryRow = {
  id: string
  status: string
  triggeredBy: string
  startedAt: string
  finishedAt: string | null
  productsTotal: number
  productsSynced: number
  errorCount: number
  kind: string | null
  stage: string | null
  fileName: string | null
  sha256: string | null
  actor: string | null
  fatal: string | null
  hardFailures: string[]
  backupKey: string | null
  changes: { price: number; stock: number } | null
}

const text = (value: unknown, max = 300): string | null => (typeof value === 'string' ? value.slice(0, max) : null)

export async function GET(): Promise<Response> {
  const actor = await requireGrinsImportActor()
  if (actor instanceof NextResponse) return actor

  const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 })
  // errorSample is either the historical SyncError[] or a diagnostics object; only
  // whitelisted, secret-free fields are returned.
  const samples = runs.map(run => (run.errorSample && typeof run.errorSample === 'object' && !Array.isArray(run.errorSample)
    ? run.errorSample as Record<string, unknown>
    : {}))
  const actorIds = [...new Set(samples.map(s => text(s.actorId)).filter((id): id is string => Boolean(id)))]
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
    : []
  const emailById = new Map(users.map(u => [u.id, u.email]))

  const rows: GrinsImportHistoryRow[] = runs.map((run, i) => {
    const s = samples[i]
    const actorId = text(s.actorId)
    return {
      id: run.id,
      status: run.status,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      productsTotal: run.productsTotal,
      productsSynced: run.productsSynced,
      errorCount: run.errorCount,
      kind: text(s.kind),
      stage: text(s.stage),
      fileName: text(s.fileName),
      sha256: text(s.xmlSha256, 64),
      actor: actorId ? (emailById.get(actorId) ?? actorId) : null,
      fatal: text(s.fatal ?? s.reason),
      hardFailures: Array.isArray(s.hardFailures) ? s.hardFailures.filter((h): h is string => typeof h === 'string').slice(0, 5) : [],
      backupKey: text(s.backupKey),
      changes: s.changes && typeof s.changes === 'object'
        ? { price: Number((s.changes as Record<string, unknown>).price) || 0, stock: Number((s.changes as Record<string, unknown>).stock) || 0 }
        : null,
    }
  })
  return NextResponse.json({ runs: rows })
}
