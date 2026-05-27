import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
}

export async function GET() {
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

export async function DELETE(request: NextRequest) {
  try {
    const { name } = (await request.json()) as { name?: string }

    if (!name || name.includes('/') || name.includes('..')) {
      return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
    }

    const filePath = path.join(UPLOADS_DIR, name)

    // Ensure the resolved path is still inside uploads dir
    const resolved = path.resolve(filePath)
    const uploadsResolved = path.resolve(UPLOADS_DIR)
    if (!resolved.startsWith(uploadsResolved + path.sep)) {
      return NextResponse.json({ error: 'invalid_path' }, { status: 400 })
    }

    await fs.unlink(filePath)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
  }
}
