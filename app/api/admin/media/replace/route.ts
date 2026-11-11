import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { mediaPath, replaceMediaAsset } from '@/lib/media-asset-store'
import { validateUploadedImage } from '@/lib/image-upload-validation'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

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
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const verifiedMime = validateUploadedImage(bytes, file.type)
    if (!verifiedMime) {
      return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
    }

    // Update in place — keeping the same name so all references stay valid.
    // Identical bytes and type are a no-op: no write, no audit event.
    const result = await replaceMediaAsset(
      name,
      { mimeType: verifiedMime, size: file.size, bytes },
      { actor, request },
    )
    if (result === 'not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, path: mediaPath(name) })
  } catch {
    return NextResponse.json({ error: 'replace_failed' }, { status: 500 })
  }
}
