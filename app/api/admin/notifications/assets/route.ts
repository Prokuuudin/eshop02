import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { validateUploadedImage } from '@/lib/image-upload-validation'

export const runtime = 'nodejs'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

function safeName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const base = path.basename(name, ext).replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/gu, '-').replace(/-+/gu, '-').slice(0, 80) || 'file'
  return `${base}${ext.slice(0, 10)}`
}

export async function POST(request: NextRequest): Promise<Response> {
  const caller = await requireAdminPermission('marketing.manage')
  if (caller instanceof NextResponse) return caller
  const form = await request.formData()
  const file = form.get('file')
  const kind = form.get('kind') === 'image' ? 'image' : 'attachment'
  if (!(file instanceof File)) return NextResponse.json({ error: 'file_required' }, { status: 400 })
  const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES
  if (!file.size || file.size > max) return NextResponse.json({ error: 'file_too_large', max }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const imageMime = validateUploadedImage(bytes, file.type)
  const pdfMime = file.type === 'application/pdf' && bytes.length >= 5 && new TextDecoder('ascii').decode(bytes.slice(0, 5)) === '%PDF-' ? 'application/pdf' : null
  const mimeType = imageMime ?? (kind === 'attachment' ? pdfMime : null)
  if (!mimeType) return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
  const name = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`
  await prisma.mediaAsset.create({ data: { name, mimeType, size: file.size, data: bytes } })
  return NextResponse.json({ path: `/api/media/${encodeURIComponent(name)}`, name: file.name, size: file.size, mimeType })
}
