import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { createMediaAsset, mediaPath } from '@/lib/media-asset-store'
import path from 'path'
import { validateUploadedMedia } from '@/lib/media-upload-validation'
import { BANNER_IMAGE_MAX_BYTES, BANNER_VIDEO_MAX_BYTES } from '@/lib/banner-media'

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
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_is_required' }, { status: 400 })
    }

    const maxBytes = file.type.startsWith('video/') ? BANNER_VIDEO_MAX_BYTES : BANNER_IMAGE_MAX_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const fileName = normalizeFileBaseName(file.name)
    const finalName = `${Date.now()}-${fileName}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const verifiedMime = validateUploadedMedia(bytes, file.type)
    if (!verifiedMime) {
      return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
    }

    await createMediaAsset(
      { name: finalName, mimeType: verifiedMime, size: file.size, bytes },
      { actor, request },
    )

    return NextResponse.json({
      path: mediaPath(finalName),
      originalName: file.name,
      size: file.size,
      mimeType: verifiedMime
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_upload_file' }, { status: 500 })
  }
}
