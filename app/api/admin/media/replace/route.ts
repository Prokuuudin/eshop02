import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif',
])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const name = (formData.get('name') as string | null)?.trim()
    const file = formData.get('file')

    if (!name || name.includes('/') || name.includes('..') || name.includes('\\')) {
      return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const uploadsResolved = path.resolve(UPLOADS_DIR)
    const targetPath = path.resolve(path.join(UPLOADS_DIR, name))
    if (!targetPath.startsWith(uploadsResolved + path.sep)) {
      return NextResponse.json({ error: 'invalid_path' }, { status: 400 })
    }

    // Overwrite — keeping same filename so all references stay valid
    const buf = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(targetPath, buf)

    return NextResponse.json({ ok: true, path: `/uploads/${name}` })
  } catch {
    return NextResponse.json({ error: 'replace_failed' }, { status: 500 })
  }
}
