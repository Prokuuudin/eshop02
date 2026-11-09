import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { deleteMediaAssets } from '@/lib/media-asset-store'
import path from 'path'

export const runtime = 'nodejs'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

export async function GET(): Promise<Response> {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const rows = await prisma.mediaAsset.findMany({
    select: { name: true, size: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })

  const files = rows.map((row) => {
    const ext = path.extname(row.name).toLowerCase()
    return {
      name: row.name,
      path: `/api/media/${row.name}`,
      size: row.size,
      isImage: IMAGE_EXTS.has(ext),
      ext: ext.replace('.', ''),
      createdAt: row.createdAt.toISOString(),
      modifiedAt: row.updatedAt.toISOString()
    }
  })

  return NextResponse.json({ files })
}

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as { name?: string; names?: string[] }
    const targets = body.names?.length ? body.names : body.name ? [body.name] : []

    if (!targets.length) return NextResponse.json({ error: 'name_required' }, { status: 400 })

    const valid = targets.filter(safeName)
    const invalid = targets.filter((name) => !safeName(name))

    // Existence is decided under the row lock, so a concurrent or repeated
    // delete reports the file as missing instead of auditing it twice.
    const deleted = valid.length ? await deleteMediaAssets(valid, { actor, request }) : []
    const missing = valid.filter((name) => !deleted.includes(name))

    return NextResponse.json({ ok: true, deleted: deleted.length, errors: [...invalid, ...missing] })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
  }
}
