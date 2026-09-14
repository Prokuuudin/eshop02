import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { createConfigurationBackup, restoreConfigurationBackup, validateConfigurationBackup } from '@/lib/configuration-backup'

export const runtime = 'nodejs'
const MAX_BACKUP_BYTES = 20 * 1024 * 1024

export async function GET(): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const backup = await createConfigurationBackup()
    return NextResponse.json(backup, { headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="configuration-backup-${backup.createdAt.slice(0, 10)}.json"`,
    } })
  } catch {
    return NextResponse.json({ error: 'backup_creation_failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BACKUP_BYTES) return NextResponse.json({ error: 'backup_too_large' }, { status: 413 })
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > MAX_BACKUP_BYTES) return NextResponse.json({ error: 'backup_too_large' }, { status: 413 })
    const body = JSON.parse(raw) as { backup?: unknown; confirmation?: string }
    if (body.confirmation !== 'RESTORE CONFIGURATION') return NextResponse.json({ error: 'restore_confirmation_required' }, { status: 400 })
    validateConfigurationBackup(body.backup)
    const restored = await restoreConfigurationBackup(body.backup)
    return NextResponse.json({ ok: true, restored })
  } catch {
    return NextResponse.json({ error: 'invalid_or_failed_restore' }, { status: 400 })
  }
}
