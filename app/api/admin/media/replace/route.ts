import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// SVG intentionally excluded: it can carry inline <script>, enabling stored XSS when served same-origin.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
])

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

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

    const bytes = new Uint8Array(await file.arrayBuffer())

    try {
      // Update in place — keeping the same name so all references stay valid
      await prisma.mediaAsset.update({
        where: { name },
        data: { data: bytes, mimeType: file.type, size: file.size }
      })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2025') {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }
      throw e
    }

    return NextResponse.json({ ok: true, path: `/api/media/${name}` })
  } catch {
    return NextResponse.json({ error: 'replace_failed' }, { status: 500 })
  }
}
