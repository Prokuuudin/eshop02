import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const DATA_DIR = path.join(process.cwd(), 'data')

const ALLOWED_FILES = [
  'orders.json',
  'reviews.json',
  'blog-posts.json',
  'site-content.json',
  'product-overrides.json',
  'banners.json',
  'promo-codes.json',
  'shipping-settings.json',
]

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const files: Record<string, unknown> = {}

  for (const filename of ALLOWED_FILES) {
    const filePath = path.join(DATA_DIR, filename)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      files[filename] = JSON.parse(raw)
    } catch {
      // File doesn't exist — skip silently
    }
  }

  return NextResponse.json({
    kind: 'configuration-export',
    warning: 'This export does not contain the PostgreSQL database and is not a disaster-recovery backup.',
    timestamp: new Date().toISOString(),
    files,
  })
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  void request
  return NextResponse.json({ error: 'configuration_restore_disabled_use_controlled_maintenance' }, { status: 405 })

  /* let body: { files?: Record<string, unknown>; confirmConfigurationRestore?: boolean }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body?.files || typeof body.files !== 'object') {
    return NextResponse.json({ error: 'missing_files' }, { status: 400 })
  }
  if (body.confirmConfigurationRestore !== true) {
    return NextResponse.json({ error: 'configuration_restore_confirmation_required' }, { status: 400 })
  }

  const restored: string[] = []
  const skipped: string[] = []

  for (const [filename, content] of Object.entries(body.files)) {
    // Whitelist check — no path traversal allowed
    if (!ALLOWED_FILES.includes(filename)) {
      skipped.push(filename)
      continue
    }

    // Extra safety: ensure no path separator in filename
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      skipped.push(filename)
      continue
    }

    const filePath = path.join(DATA_DIR, filename)
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8')
    restored.push(filename)
  }

  return NextResponse.json({ ok: true, restored, skipped }) */
}
