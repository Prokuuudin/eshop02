import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
}

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  await ensureUploadsDir()

  const entries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const filePath = path.join(UPLOADS_DIR, e.name)
        const stat = await fs.stat(filePath)
        const ext = path.extname(e.name).toLowerCase()
        return {
          name: e.name,
          path: `/uploads/${e.name}`,
          size: stat.size,
          isImage: IMAGE_EXTS.has(ext),
          ext: ext.replace('.', ''),
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString()
        }
      })
  )

  files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  return NextResponse.json({ files })
}

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function DELETE(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as { name?: string; names?: string[] }
    const targets = body.names?.length ? body.names : body.name ? [body.name] : []

    if (!targets.length) return NextResponse.json({ error: 'name_required' }, { status: 400 })

    const uploadsResolved = path.resolve(UPLOADS_DIR)
    let deleted = 0
    const errors: string[] = []

    for (const name of targets) {
      if (!safeName(name)) { errors.push(name); continue }
      const resolved = path.resolve(path.join(UPLOADS_DIR, name))
      if (!resolved.startsWith(uploadsResolved + path.sep)) { errors.push(name); continue }
      try {
        await fs.unlink(resolved)
        deleted++
      } catch {
        errors.push(name)
      }
    }

    return NextResponse.json({ ok: true, deleted, errors })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
  }
}
