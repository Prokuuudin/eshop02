import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif'
])

function normalizeFileBaseName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const base = path.basename(name, ext)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeBase = base || 'image'
  const safeExt = ext && ext.length <= 10 ? ext : '.bin'
  return `${safeBase}${safeExt}`
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_is_required' }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
    }

    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await fs.mkdir(uploadsDir, { recursive: true })

    const fileName = normalizeFileBaseName(file.name)
    const now = Date.now()
    const finalName = `${now}-${fileName}`
    const finalPath = path.join(uploadsDir, finalName)

    const arrayBuffer = await file.arrayBuffer()
    await fs.writeFile(finalPath, Buffer.from(arrayBuffer))

    return NextResponse.json({
      path: `/uploads/${finalName}`,
      originalName: file.name,
      size: file.size,
      mimeType: file.type
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_upload_file' }, { status: 500 })
  }
}
