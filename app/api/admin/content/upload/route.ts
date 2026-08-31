import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import path from 'path'
import { validateUploadedImage } from '@/lib/image-upload-validation'

export const runtime = 'nodejs'

function normalizeFileBaseName(name: string): string {
  const nameLower = name.toLowerCase()
  const ext = path.extname(nameLower).toLowerCase()
  const base = path.basename(nameLower, ext)
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeBase = base || 'image'
  const safeExt = ext && ext.length <= 10 ? ext : '.bin'
  return `${safeBase}${safeExt}`
}

export async function POST(request: NextRequest): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_is_required' }, { status: 400 })
    }

    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const fileName = normalizeFileBaseName(file.name)
    const finalName = `${Date.now()}-${fileName}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const verifiedMime = validateUploadedImage(bytes, file.type)
    if (!verifiedMime) {
      return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
    }

    await prisma.mediaAsset.create({
      data: {
        name: finalName,
        mimeType: verifiedMime,
        size: file.size,
        data: bytes
      }
    })

    return NextResponse.json({
      path: `/api/media/${finalName}`,
      originalName: file.name,
      size: file.size,
      mimeType: verifiedMime
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_upload_file' }, { status: 500 })
  }
}
